/**
 * Tool handlers for AI Memory MCP Server
 * Contains the main tool implementations for conversation search and retrieval
 * Updated to use SQLite FTS5 database instead of JSONL parsing
 */

import { MessageUtils } from '../utils/message-utils.js';
import DatabaseManager from '../../database/database-manager.js';

export class ToolHandlers {
  constructor(parser) {
    this.parser = parser; // Keep for hybrid fallback
    this.dbManager = new DatabaseManager();
    this.isDbInitialized = false;
  }

  /**
   * Initialize database connection
   */
  async initializeDatabase() {
    if (!this.isDbInitialized) {
      try {
        await this.dbManager.initialize();
        this.isDbInitialized = true;
        console.log('Database initialized for MCP tool handlers');
      } catch (error) {
        console.error('Failed to initialize database:', error);
        throw error;
      }
    }
  }

  /**
   * Hybrid search - try SQLite first, fallback to JSONL
   */
  async hybridSearch(query, options = {}) {
    try {
      // Try SQLite FTS5 search first
      const sqliteResults = this.dbManager.searchConversations(query, {
        limit: options.limit || 50,
        projectFilter: options.projectFilter,
        timeframe: options.timeframe,
        searchMode: options.searchMode || 'mixed'
      });

      if (sqliteResults.length > 0) {
        console.log(`SQLite search found ${sqliteResults.length} results`);
        return sqliteResults.map(result => ({
          sessionId: result.session_id,
          projectPath: result.project_path,
          projectName: result.project_name,
          messageCount: result.message_count,
          preview: result.snippet || 'No preview available',
          relevanceScore: result.relevance_score || 1.0,
          startTime: result.created_at,
          endTime: result.updated_at,
          topics: JSON.parse(result.topics || '[]'),
          keywords: JSON.parse(result.keywords || '[]')
        }));
      }
    } catch (error) {
      console.warn('SQLite search failed, falling back to JSONL:', error.message);
    }

    // Fallback to JSONL parsing for recent conversations
    console.log('Using JSONL fallback search');
    const searchOptions = {
      fuzzyThreshold: options.fuzzy_threshold || 0.6,
      searchMode: options.search_mode || 'mixed',
      logic: options.logic || 'OR'
    };

    return this.parser.searchConversations(query, options.timeframe, searchOptions);
  }

  /**
   * Search conversations tool handler - Uses SQLite FTS5 with JSONL fallback
   */
  async handleSearchConversations(args) {
    const { 
      query, 
      timeframe = null, 
      limit = 20,
      search_mode = 'mixed',
      fuzzy_threshold = 0.6,
      logic = 'OR',
      max_tokens = 3000,
      include_snippets = true,
      snippet_length = 150
    } = args;

    try {
      await this.initializeDatabase();

      // Use hybrid search approach
      const searchOptions = {
        limit: limit * 2, // Get more results for better filtering
        timeframe: timeframe,
        searchMode: search_mode,
        fuzzy_threshold: fuzzy_threshold,
        logic: logic
      };

      const results = await this.hybridSearch(query, searchOptions);
      const limitedResults = results.slice(0, limit);

      // Create token-conscious formatted results
      let currentTokens = 0;
      const baseResponseTokens = MessageUtils.estimateTokens(JSON.stringify({
        query: query,
        searchOptions: { search_mode, logic, fuzzy_threshold, timeframe },
        results: [],
        total_found: results.length,
        showing: 0,
        database_status: this.isDbInitialized ? 'Connected' : 'Fallback mode',
        token_usage: { estimated_tokens: 0, max_tokens: max_tokens }
      }));
      
      currentTokens = baseResponseTokens;
      const formattedResults = [];
      
      for (let i = 0; i < limitedResults.length; i++) {
        const result = limitedResults[i];
        
        // Create base result (essential metadata only)
        const baseResult = {
          sessionId: result.sessionId,
          projectName: result.projectName,
          messageCount: result.messageCount,
          startTime: result.startTime,
          relevanceScore: result.relevanceScore || 1.0,
          searchMethod: results.length > 0 && results[0].relevance_score ? 'SQLite FTS5' : 'JSONL Fallback'
        };
        
        let finalResult = baseResult;
        const resultTokens = MessageUtils.estimateTokens(JSON.stringify(baseResult));
        
        // Check if we can include snippet
        if (include_snippets && result.preview) {
          const truncatedPreview = result.preview.length > snippet_length * 4 ? 
            result.preview.substring(0, snippet_length * 4) + '...' : result.preview;
          const snippetTokens = MessageUtils.estimateTokens(truncatedPreview);
          
          // Add snippet only if it fits within token budget
          if (currentTokens + resultTokens + snippetTokens < max_tokens - 200) { // 200 token buffer
            finalResult.preview = truncatedPreview;
          }
        }
        
        const finalResultTokens = MessageUtils.estimateTokens(JSON.stringify(finalResult));
        
        // Stop if adding this result would exceed token limit
        if (currentTokens + finalResultTokens > max_tokens - 200) {
          break;
        }
        
        formattedResults.push(finalResult);
        currentTokens += finalResultTokens;
      }

      // Create token-conscious response
      const response = {
        query: query,
        searchOptions: {
          search_mode: search_mode,
          logic: logic,
          fuzzy_threshold: fuzzy_threshold,
          timeframe: timeframe,
          max_tokens: max_tokens,
          include_snippets: include_snippets
        },
        results: formattedResults,
        total_found: results.length,
        showing: formattedResults.length,
        token_usage: {
          estimated_tokens: currentTokens,
          max_tokens: max_tokens,
          token_savings: formattedResults.length < limitedResults.length ? 
            `Truncated ${limitedResults.length - formattedResults.length} results to stay within token limit` : null
        },
        database_status: this.isDbInitialized ? 'Connected' : 'Fallback mode',
        search_engine: formattedResults.length > 0 ? formattedResults[0].searchMethod : 'None',
        get_full_details: "Use get_conversation_context with a specific sessionId to get complete conversation details"
      };

      return {
        content: [{
          type: 'text',
          text: JSON.stringify(response, null, 2)
        }]
      };
    } catch (error) {
      return {
        content: [{
          type: 'text',
          text: `Error searching conversations: ${error.message}`
        }]
      };
    }
  }

  /**
   * Get conversation context tool handler - Uses SQLite with JSONL fallback
   */
  async handleGetConversationContext(args) {
    const {
      session_id,
      include_project_files = true,
      page = 1,
      page_size = 50,
      content_types = [],
      summary_mode = 'full',
      max_tokens = 20000,
      exclude_long_messages = false,
      priority_messages = []
    } = args;

    try {
      await this.initializeDatabase();

      let conversationData = null;
      let dataSource = 'SQLite';

      // Try SQLite first
      try {
        conversationData = this.dbManager.getConversationContext(session_id, {
          page,
          pageSize: page_size,
          maxTokens: max_tokens,
          contentTypes: content_types.length > 0 ? content_types : null,
          summaryMode: summary_mode
        });
      } catch (error) {
        console.warn('SQLite query failed, falling back to JSONL:', error.message);
      }

      // Fallback to JSONL parsing if SQLite fails or no results
      if (!conversationData) {
        dataSource = 'JSONL Fallback';
        
        const files = this.parser.findConversationFiles();
        let targetFile = null;

        for (const file of files) {
          try {
            const conversation = this.parser.parseConversation(file.filePath);
            if (conversation.sessionId === session_id) {
              targetFile = { 
                filePath: file.filePath, 
                projectHash: file.projectHash, 
                conversation 
              };
              break;
            }
          } catch (parseError) {
            continue;
          }
        }

        if (!targetFile) {
          return {
            content: [{
              type: 'text',
              text: `No conversation found with session ID: ${session_id}`
            }]
          };
        }

        const { conversation } = targetFile;

        // Apply filters to messages
        const filterOptions = {
          content_types,
          exclude_long_messages,
          priority_messages
        };

        const filteredMessages = MessageUtils.filterMessages(conversation.messages, filterOptions);
        const paginatedResult = MessageUtils.paginateMessages(filteredMessages, page, page_size, max_tokens);

        conversationData = {
          conversation: {
            session_id: conversation.sessionId,
            project_name: conversation.projectName,
            project_path: conversation.projectPath,
            created_at: conversation.startTime,
            updated_at: conversation.endTime,
            message_count: conversation.messageCount,
            file_references: []
          },
          messages: paginatedResult.messages,
          pagination: paginatedResult.pagination
        };
      }

      if (!conversationData) {
        return {
          content: [{
            type: 'text',
            text: `No conversation found with session ID: ${session_id}`
          }]
        };
      }

      // Format response with conversation metadata
      const context = {
        sessionId: conversationData.conversation.session_id,
        projectPath: conversationData.conversation.project_path,
        projectName: conversationData.conversation.project_name,
        messageCount: conversationData.conversation.message_count,
        startTime: conversationData.conversation.created_at,
        endTime: conversationData.conversation.updated_at,
        pagination: conversationData.pagination,
        dataSource: dataSource
      };

      // Add pagination info
      if (conversationData.pagination && conversationData.pagination.totalPages > 1) {
        context.pagination_note = `Showing page ${conversationData.pagination.page} of ${conversationData.pagination.totalPages}. Use page parameter to navigate.`;
      }

      // Extract file references from messages if requested
      if (include_project_files) {
        const allFileRefs = new Set();
        
        // Add file references from conversation record
        if (conversationData.conversation.file_references) {
          conversationData.conversation.file_references.forEach(ref => allFileRefs.add(ref));
        }

        // Extract from messages
        conversationData.messages.forEach(msg => {
          if (msg.file_references) {
            const refs = typeof msg.file_references === 'string' 
              ? JSON.parse(msg.file_references) 
              : msg.file_references;
            refs.forEach(ref => allFileRefs.add(ref));
          }
        });
        
        context.file_references = Array.from(allFileRefs);
      }

      // Format messages for display
      const messageTexts = [];
      let currentTokens = MessageUtils.estimateTokens(JSON.stringify(context, null, 2));

      for (let i = 0; i < conversationData.messages.length; i++) {
        const msg = conversationData.messages[i];
        const globalIndex = ((conversationData.pagination?.page || 1) - 1) * (conversationData.pagination?.pageSize || page_size) + i + 1;
        const role = msg.role || 'unknown';
        const timestamp = new Date(msg.timestamp).toLocaleString();
        const textContent = MessageUtils.formatMessage(msg, summary_mode);
        
        const messageText = `[${globalIndex}] ${role.toUpperCase()} (${timestamp}):\n${textContent}`;
        const messageTokens = MessageUtils.estimateTokens(messageText);
        
        // Check if adding this message would exceed token limit
        if (currentTokens + messageTokens + 500 > max_tokens) {
          break;
        }
        
        messageTexts.push(messageText);
        currentTokens += messageTokens;
      }

      // Add token usage info to context
      context.token_usage = {
        estimated_tokens: currentTokens,
        max_tokens: max_tokens,
        messages_shown: messageTexts.length,
        total_messages_in_conversation: conversationData.conversation.message_count
      };

      return {
        content: [{
          type: 'text', 
          text: JSON.stringify(context, null, 2) + '\n\nMessages:\n' + messageTexts.join('\n\n---\n\n')
        }]
      };

    } catch (error) {
      return {
        content: [{
          type: 'text',
          text: `Error retrieving conversation context: ${error.message}`
        }]
      };
    }
  }

  /**
   * List recent conversations tool handler - Uses SQLite with JSONL fallback
   */
  async handleListRecentConversations(args) {
    const { timeframe = 'today', project_filter, limit = 20 } = args;

    try {
      await this.initializeDatabase();

      // Try SQLite query first
      let conversations = [];
      let dataSource = 'SQLite';

      try {
        const timeCondition = this.dbManager.parseTimeframe(timeframe);
        const query = this.dbManager.db.prepare(`
          SELECT session_id, project_name, project_path, created_at, updated_at, message_count
          FROM conversations 
          WHERE created_at >= ?
          ${project_filter ? 'AND project_name LIKE ?' : ''}
          ORDER BY created_at DESC 
          LIMIT ?
        `);

        const params = [timeCondition?.toISOString() || '1970-01-01'];
        if (project_filter) params.push(`%${project_filter}%`);
        params.push(limit);

        const results = query.all(...params);
        conversations = results.map(row => ({
          sessionId: row.session_id,
          projectName: row.project_name,
          projectPath: row.project_path,
          startTime: row.created_at,
          endTime: row.updated_at,
          messageCount: row.message_count
        }));
      } catch (error) {
        // Fallback to JSONL parsing
        dataSource = 'JSONL Fallback';
        const files = this.parser.findConversationFiles();

        for (const file of files) {
          try {
            const conversation = this.parser.parseConversation(file.filePath);
            const cutoff = this.parser.parseTimeframe(timeframe);
            if (cutoff && new Date(conversation.endTime) < cutoff) continue;
            if (project_filter && !conversation.projectPath?.toLowerCase().includes(project_filter.toLowerCase())) continue;
            conversations.push(conversation);
          } catch (parseError) {
            continue;
          }
        }

        conversations.sort((a, b) => new Date(b.startTime) - new Date(a.startTime)).slice(0, limit);
      }

      const formattedResults = conversations.map((conv, i) => ({
        rank: i + 1,
        sessionId: conv.sessionId,
        project: conv.projectName || conv.projectPath?.split('/').pop() || 'Unknown',
        startTime: conv.startTime,
        endTime: conv.endTime,
        messageCount: conv.messageCount,
        projectPath: conv.projectPath
      }));

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            timeframe,
            project_filter,
            results: formattedResults,
            total_found: conversations.length,
            showing: formattedResults.length,
            dataSource
          }, null, 2)
        }]
      };
    } catch (error) {
      return {
        content: [{ type: 'text', text: `Error listing recent conversations: ${error.message}` }]
      };
    }
  }

  /**
   * Find similar solutions tool handler - Uses SQLite FTS5 for better matching
   */
  async handleFindSimilarSolutions(args) {
    const { problem_description, exclude_current_project = true, confidence_threshold = 0.6 } = args;

    try {
      await this.initializeDatabase();

      // Use hybrid search for better similarity matching
      const results = await this.hybridSearch(problem_description, {
        limit: 10,
        searchMode: 'mixed'
      });

      // Score results based on relevance and content similarity
      const scoredResults = results.map(result => {
        const confidence = result.relevanceScore || 0.5; // Use FTS5 relevance if available
        return { ...result, confidence };
      });

      // Filter and sort by confidence
      const filteredResults = scoredResults
        .filter(result => result.confidence >= confidence_threshold)
        .sort((a, b) => b.confidence - a.confidence);

      const formattedResults = filteredResults.slice(0, 5).map((result, i) => {
        const projectName = result.projectName || result.projectPath?.split('/').pop() || 'Unknown';
        const confidencePercent = Math.round(result.confidence * 100);

        return {
          rank: i + 1,
          sessionId: result.sessionId,
          project: projectName,
          confidence: `${confidencePercent}%`,
          preview: result.preview,
          projectPath: result.projectPath,
          messageCount: result.messageCount,
          startTime: result.startTime,
          topics: result.topics || [],
          relevanceScore: result.relevanceScore
        };
      });

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            problem_description,
            confidence_threshold,
            results: formattedResults,
            total_candidates_evaluated: results.length,
            solutions_found: formattedResults.length,
            search_method: 'SQLite FTS5 + Hybrid Fallback'
          }, null, 2)
        }]
      };

    } catch (error) {
      return {
        content: [{ type: 'text', text: `Error finding similar solutions: ${error.message}` }]
      };
    }
  }
}