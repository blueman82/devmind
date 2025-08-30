/**
 * Tool handlers for AI Memory MCP Server
 * Contains the main tool implementations for conversation search and retrieval
 */

import { MessageUtils } from '../utils/message-utils.js';

export class ToolHandlers {
  constructor(parser) {
    this.parser = parser;
  }

  /**
   * Search conversations tool handler
   */
  async handleSearchConversations(args) {
    const { 
      query, 
      timeframe = null, 
      limit = 20,
      search_mode = 'mixed',
      fuzzy_threshold = 0.6,
      logic = 'OR'
    } = args;

    try {
      // Enhanced search with new options
      const searchOptions = {
        fuzzyThreshold: fuzzy_threshold,
        searchMode: search_mode,
        logic: logic
      };

      const results = this.parser.searchConversations(query, timeframe, searchOptions);
      const limitedResults = results.slice(0, limit);

      const formattedResults = limitedResults.map(result => ({
        sessionId: result.sessionId,
        projectPath: result.projectPath,
        messageCount: result.messageCount,
        preview: result.preview,
        relevanceScore: result.relevanceScore || 1.0,
        matchedTerms: result.matchedTerms || [query],
        startTime: result.startTime,
        endTime: result.endTime
      }));

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            query: query,
            searchOptions: searchOptions,
            results: formattedResults,
            total_found: results.length,
            showing: limitedResults.length,
            search_mode: search_mode,
            logic: logic,
            timeframe: timeframe
          }, null, 2)
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
   * Get conversation context tool handler
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
      // Find the conversation file by session ID
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

      // Apply pagination with token limiting
      const paginatedResult = MessageUtils.paginateMessages(filteredMessages, page, page_size, max_tokens);
      const { messages: pageMessages, pagination } = paginatedResult;

      // Format conversation context
      const context = {
        sessionId: conversation.sessionId,
        projectPath: conversation.projectPath,
        messageCount: conversation.messageCount,
        startTime: conversation.startTime,
        endTime: conversation.endTime,
        pagination: pagination
      };

      // Add pagination info
      if (pagination.total_pages > 1) {
        context.pagination_note = `Showing page ${pagination.current_page} of ${pagination.total_pages}. Use page parameter to navigate.`;
      }

      // Extract file references
      if (include_project_files) {
        const allFileRefs = new Set();
        
        pageMessages.forEach(msg => {
          if (msg.content && Array.isArray(msg.content)) {
            msg.content.forEach(item => {
              if (item.type === 'tool_use' && item.input && item.input.file_path) {
                allFileRefs.add(item.input.file_path);
              }
              if (item.type === 'tool_result' && item.content && typeof item.content === 'string') {
                const fileMatches = item.content.match(/(?:file_path|path)["']?\s*:\s*["']([^"']+)["']/g);
                if (fileMatches) {
                  fileMatches.forEach(match => {
                    const path = match.split(/["':]/)[1];
                    if (path) allFileRefs.add(path.trim());
                  });
                }
              }
            });
          }
        });
        
        context.file_references = Array.from(allFileRefs);
      }

      // Show filtered messages
      const messagesText = pageMessages.map((msg, index) => {
        const globalIndex = (pagination.current_page - 1) * pagination.page_size + index + 1;
        const role = msg.role || msg.type || 'unknown';
        const timestamp = new Date(msg.timestamp).toLocaleString();
        const textContent = MessageUtils.formatMessage(msg, summary_mode);
        
        return `[${globalIndex}] ${role.toUpperCase()} (${timestamp}):\n${textContent}`;
      }).join('\n\n---\n\n');

      // Add filtering summary if filters were applied
      let filterSummary = '';
      if (content_types.length > 0 || exclude_long_messages || priority_messages.length > 0) {
        const appliedFilters = [];
        if (content_types.length > 0) appliedFilters.push(`content_types: ${content_types.join(', ')}`);
        if (exclude_long_messages) appliedFilters.push('exclude_long_messages: true');
        if (priority_messages.length > 0) appliedFilters.push(`priority_messages: ${priority_messages.join(', ')}`);
        
        filterSummary = `\n\nFilters Applied: ${appliedFilters.join(', ')}\nOriginal message count: ${conversation.messageCount}, After filtering: ${filteredMessages.length}`;
      }

      return {
        content: [{
          type: 'text', 
          text: JSON.stringify(context, null, 2) + '\n\nMessages:\n' + messagesText + filterSummary
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
   * List recent conversations tool handler
   */
  async handleListRecentConversations(args) {
    const { timeframe = 'today', project_filter, limit = 20 } = args;

    try {
      const files = this.parser.findConversationFiles();
      const conversations = [];

      for (const file of files) {
        try {
          const conversation = this.parser.parseConversation(file.filePath);
          
          // Apply timeframe filter
          const cutoff = this.parser.parseTimeframe(timeframe);
          if (cutoff && new Date(conversation.endTime) < cutoff) continue;

          // Apply project filter
          if (project_filter) {
            const projectName = conversation.projectPath.split('/').pop();
            if (!projectName.toLowerCase().includes(project_filter.toLowerCase())) {
              continue;
            }
          }

          conversations.push(conversation);
        } catch (parseError) {
          continue;
        }
      }

      // Sort by start time (most recent first)
      conversations.sort((a, b) => new Date(b.startTime) - new Date(a.startTime));
      const limitedResults = conversations.slice(0, limit);

      const formattedResults = limitedResults.map((conv, i) => {
        const projectName = conv.projectPath ? conv.projectPath.split('/').pop() : 'Unknown';
        const duration = new Date(conv.endTime) - new Date(conv.startTime);
        const durationMin = Math.round(duration / (1000 * 60));

        return {
          rank: i + 1,
          sessionId: conv.sessionId,
          project: projectName,
          startTime: conv.startTime,
          endTime: conv.endTime,
          duration_minutes: durationMin,
          messageCount: conv.messageCount,
          projectPath: conv.projectPath
        };
      });

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            timeframe: timeframe,
            project_filter: project_filter,
            results: formattedResults,
            total_found: conversations.length,
            showing: limitedResults.length
          }, null, 2)
        }]
      };

    } catch (error) {
      return {
        content: [{
          type: 'text',
          text: `Error listing recent conversations: ${error.message}`
        }]
      };
    }
  }

  /**
   * Find similar solutions tool handler
   */
  async handleFindSimilarSolutions(args) {
    const { problem_description, exclude_current_project = true, confidence_threshold = 0.6 } = args;

    try {
      // This is a simplified implementation - in a full version, 
      // we'd use semantic search or AI-powered similarity matching

      const results = this.parser.searchConversations(problem_description);
      
      // Filter and score results based on keyword overlap
      const scoredResults = results.map(result => {
        const problemWords = problem_description.toLowerCase().split(/\s+/);
        const previewWords = result.preview.toLowerCase().split(/\s+/);
        
        const overlap = problemWords.filter(word => 
          previewWords.some(previewWord => previewWord.includes(word) || word.includes(previewWord))
        );

        const confidence = overlap.length / problemWords.length;
        return { ...result, confidence };
      });

      // Sort by confidence
      const filteredResults = scoredResults
        .filter(result => result.confidence >= confidence_threshold)
        .sort((a, b) => b.confidence - a.confidence);

      const formattedResults = filteredResults.slice(0, 5).map((result, i) => {
        const projectName = result.projectPath ? result.projectPath.split('/').pop() : 'Unknown';
        const confidencePercent = Math.round(result.confidence * 100);

        return {
          rank: i + 1,
          sessionId: result.sessionId,
          project: projectName,
          confidence: `${confidencePercent}%`,
          preview: result.preview,
          projectPath: result.projectPath,
          messageCount: result.messageCount,
          startTime: result.startTime
        };
      });

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            problem_description: problem_description,
            confidence_threshold: confidence_threshold,
            results: formattedResults,
            total_candidates_evaluated: results.length,
            solutions_found: formattedResults.length
          }, null, 2)
        }]
      };

    } catch (error) {
      return {
        content: [{
          type: 'text',
          text: `Error finding similar solutions: ${error.message}`
        }]
      };
    }
  }
}