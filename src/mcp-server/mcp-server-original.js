#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';
import ConversationParser from '../parser/conversation-parser.js';

class AIMemoryMCPServer {
  constructor() {
    this.server = new Server(
      {
        name: 'ai-memory-mcp-server',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.parser = new ConversationParser();
    this.setupErrorHandling();
    this.setupHandlers();
  }

  setupErrorHandling() {
    this.server.onerror = (error) => console.error('[MCP Error]', error);
    process.on('SIGINT', async () => {
      await this.server.close();
      process.exit(0);
    });
  }

  setupHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          {
            name: 'search_conversations',
            description: 'Search across all Claude Code conversations using keywords or natural language with fuzzy matching and flexible logic',
            inputSchema: {
              type: 'object',
              properties: {
                query: {
                  type: 'string',
                  description: 'Search query - keywords or natural language. Use quotes for exact phrases.'
                },
                timeframe: {
                  type: 'string',
                  description: 'Optional timeframe filter like "2 days ago", "last week"'
                },
                limit: {
                  type: 'number',
                  description: 'Maximum number of results to return (default: 10)',
                  default: 10
                },
                search_mode: {
                  type: 'string',
                  enum: ['fuzzy', 'exact', 'mixed'],
                  description: 'Search matching strategy: fuzzy (tolerant), exact (strict), mixed (exact + fuzzy fallback)',
                  default: 'mixed'
                },
                fuzzy_threshold: {
                  type: 'number',
                  minimum: 0.0,
                  maximum: 1.0,
                  description: 'Fuzzy matching tolerance (0.0=very tolerant, 1.0=exact only, default: 0.6)',
                  default: 0.6
                },
                logic: {
                  type: 'string',
                  enum: ['OR', 'AND'],
                  description: 'Term combination logic: OR (any term matches), AND (all terms must match)',
                  default: 'OR'
                }
              },
              required: ['query']
            }
          },
          {
            name: 'get_conversation_context',
            description: 'Retrieve context from a specific conversation with smart pagination, filtering, and limiting for large conversations',
            inputSchema: {
              type: 'object',
              properties: {
                session_id: {
                  type: 'string',
                  description: 'Session ID of the conversation to retrieve'
                },
                include_project_files: {
                  type: 'boolean',
                  description: 'Include file references from the conversation',
                  default: true
                },
                page: {
                  type: 'number',
                  description: 'Page number for pagination (default: 1)',
                  default: 1,
                  minimum: 1
                },
                page_size: {
                  type: 'number',
                  description: 'Number of messages per page (default: 50)',
                  default: 50,
                  minimum: 1,
                  maximum: 200
                },
                content_types: {
                  type: 'array',
                  items: {
                    type: 'string',
                    enum: ['user', 'assistant', 'tool_calls', 'tool_results']
                  },
                  description: 'Filter by message types (default: all types)'
                },
                summary_mode: {
                  type: 'string',
                  enum: ['full', 'condensed', 'key_points_only'],
                  description: 'Level of detail in message content (default: full)',
                  default: 'full'
                },
                max_tokens: {
                  type: 'number',
                  description: 'Maximum tokens to return (default: 20000)',
                  default: 20000,
                  minimum: 1000,
                  maximum: 25000
                },
                exclude_long_messages: {
                  type: 'boolean',
                  description: 'Skip messages longer than 1000 characters',
                  default: false
                },
                priority_messages: {
                  type: 'array',
                  items: {
                    type: 'string',
                    enum: ['first', 'last', 'errors', 'important']
                  },
                  description: 'Include priority message types even when filtering'
                }
              },
              required: ['session_id']
            }
          },
          {
            name: 'list_recent_conversations',
            description: 'List recent conversations across all projects',
            inputSchema: {
              type: 'object',
              properties: {
                timeframe: {
                  type: 'string',
                  description: 'Timeframe like "today", "yesterday", "2 days ago"',
                  default: 'today'
                },
                project_filter: {
                  type: 'string',
                  description: 'Optional project name or path to filter by'
                },
                limit: {
                  type: 'number',
                  description: 'Maximum number of conversations to return',
                  default: 20
                }
              }
            }
          },
          {
            name: 'find_similar_solutions',
            description: 'Find conversations where similar problems were solved in other projects',
            inputSchema: {
              type: 'object',
              properties: {
                problem_description: {
                  type: 'string',
                  description: 'Description of the current problem or feature need'
                },
                exclude_current_project: {
                  type: 'boolean',
                  description: 'Exclude results from the current project',
                  default: true
                },
                confidence_threshold: {
                  type: 'number',
                  description: 'Minimum confidence score for matches (0.0-1.0)',
                  default: 0.6
                }
              },
              required: ['problem_description']
            }
          }
        ]
      };
    });

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        switch (name) {
          case 'search_conversations':
            return await this.handleSearchConversations(args);
          case 'get_conversation_context':
            return await this.handleGetConversationContext(args);
          case 'list_recent_conversations':
            return await this.handleListRecentConversations(args);
          case 'find_similar_solutions':
            return await this.handleFindSimilarSolutions(args);
          default:
            throw new McpError(
              ErrorCode.MethodNotFound,
              `Unknown tool: ${name}`
            );
        }
      } catch (error) {
        throw new McpError(
          ErrorCode.InternalError,
          `Tool execution failed: ${error.message}`
        );
      }
    });
  }

  async handleSearchConversations(args) {
    const { 
      query, 
      timeframe, 
      limit = 10,
      search_mode = 'mixed',
      fuzzy_threshold = 0.6,
      logic = 'OR'
    } = args;
    
    try {
      // Enhanced search with new options
      const searchOptions = {
        searchMode: search_mode,
        fuzzyThreshold: fuzzy_threshold,
        logic: logic
      };
      
      const results = this.parser.searchConversations(query, timeframe, searchOptions);
      const limitedResults = results.slice(0, limit);
      
      const formattedResults = limitedResults.map(result => ({
        sessionId: result.sessionId,
        projectName: result.projectPath ? result.projectPath.split('/').pop() : 'Unknown',
        projectPath: result.projectPath,
        startTime: result.startTime,
        messageCount: result.messageCount,
        preview: result.preview,
        relevanceScore: result.relevanceScore,
        matchedTerms: result.matchedTerms
      }));

      return {
        content: [
          {
            type: 'text',
            text: `Found ${results.length} conversations matching "${query}"${timeframe ? ` from ${timeframe}` : ''}\n\n` +
                  formattedResults.map((r, i) => 
                    `${i + 1}. **${r.projectName}** (${r.messageCount} messages)\n` +
                    `   Session: ${r.sessionId}\n` +
                    `   Time: ${new Date(r.startTime).toLocaleString()}\n` +
                    `   Preview: ${r.preview}\n`
                  ).join('\n')
          }
        ]
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `Error searching conversations: ${error.message}`
          }
        ]
      };
    }
  }

  // Token estimation utility
  estimateTokens(text) {
    if (!text) return 0;
    // Rough approximation: 1 token ≈ 4 characters
    return Math.ceil(text.length / 4);
  }

  // Filter messages based on criteria
  filterMessages(messages, options = {}) {
    let filtered = [...messages];
    const {
      content_types = [],
      exclude_long_messages = false,
      priority_messages = []
    } = options;

    // Filter by content types
    if (content_types.length > 0) {
      filtered = filtered.filter(msg => {
        if (!msg.role) return false;
        
        if (content_types.includes('user') && msg.role === 'user') return true;
        if (content_types.includes('assistant') && msg.role === 'assistant') return true;
        if (content_types.includes('tool_calls') && msg.role === 'assistant' && msg.content?.toolCalls) return true;
        if (content_types.includes('tool_results') && msg.role === 'tool') return true;
        
        return false;
      });
    }

    // Exclude long messages
    if (exclude_long_messages) {
      filtered = filtered.filter(msg => {
        const text = this.getMessageText(msg);
        return text.length <= 1000;
      });
    }

    // Add priority messages back if they were filtered out
    if (priority_messages.length > 0) {
      const priorityMsgs = [];
      
      if (priority_messages.includes('first') && messages.length > 0) {
        priorityMsgs.push(messages[0]);
      }
      if (priority_messages.includes('last') && messages.length > 0) {
        priorityMsgs.push(messages[messages.length - 1]);
      }
      if (priority_messages.includes('errors')) {
        const errorMsgs = messages.filter(msg => 
          this.getMessageText(msg).toLowerCase().includes('error') ||
          this.getMessageText(msg).toLowerCase().includes('failed') ||
          this.getMessageText(msg).toLowerCase().includes('exception')
        );
        priorityMsgs.push(...errorMsgs);
      }
      if (priority_messages.includes('important')) {
        const importantMsgs = messages.filter(msg => 
          this.getMessageText(msg).toLowerCase().includes('important') ||
          this.getMessageText(msg).toLowerCase().includes('critical') ||
          this.getMessageText(msg).toLowerCase().includes('warning')
        );
        priorityMsgs.push(...importantMsgs);
      }

      // Merge priority messages with filtered results (remove duplicates)
      const priorityIds = new Set(priorityMsgs.map((msg, i) => messages.indexOf(msg)));
      const filteredIds = new Set(filtered.map(msg => messages.indexOf(msg)));
      const combinedIds = new Set([...priorityIds, ...filteredIds]);
      
      filtered = Array.from(combinedIds)
        .sort((a, b) => a - b)
        .map(i => messages[i]);
    }

    return filtered;
  }

  // Get text content from message
  getMessageText(msg) {
    if (!msg.content) return '';
    if (typeof msg.content === 'string') return msg.content;
    if (Array.isArray(msg.content.text)) return msg.content.text.join(' ');
    if (typeof msg.content.text === 'string') return msg.content.text;
    return '';
  }

  // Format message with summary mode
  formatMessage(msg, summaryMode = 'full') {
    const text = this.getMessageText(msg);
    
    switch (summaryMode) {
      case 'condensed':
        return text.substring(0, 100) + (text.length > 100 ? '...' : '');
      case 'key_points_only': {
        // Extract key points (lines starting with -, *, numbers, or containing keywords)
        const lines = text.split('\n');
        const keyLines = lines.filter(line => {
          const trimmed = line.trim();
          return trimmed.match(/^[-*\d+.]/g) ||
                 trimmed.toLowerCase().includes('important') ||
                 trimmed.toLowerCase().includes('error') ||
                 trimmed.toLowerCase().includes('summary') ||
                 trimmed.toLowerCase().includes('result');
        });
        return keyLines.length > 0 ? keyLines.join('\n') : text.substring(0, 50) + '...';
      }
      default:
        return text;
    }
  }

  // Smart pagination with token limiting
  paginateMessages(messages, page = 1, pageSize = 50, maxTokens = 20000) {
    const startIndex = (page - 1) * pageSize;
    const endIndex = Math.min(startIndex + pageSize, messages.length);
    
    // Adjust end index based on token limit
    let currentTokens = 0;
    let actualEndIndex = startIndex;
    
    for (let i = startIndex; i < endIndex; i++) {
      const messageTokens = this.estimateTokens(this.getMessageText(messages[i]));
      if (currentTokens + messageTokens > maxTokens * 0.8) { // Reserve 20% for metadata
        break;
      }
      currentTokens += messageTokens;
      actualEndIndex = i + 1;
    }
    
    const pageMessages = messages.slice(startIndex, actualEndIndex);
    const totalPages = Math.ceil(messages.length / pageSize);
    
    return {
      messages: pageMessages,
      pagination: {
        currentPage: page,
        pageSize: pageSize,
        totalMessages: messages.length,
        totalPages: totalPages,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1,
        estimatedTokens: currentTokens
      }
    };
  }

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
            targetFile = { file, conversation };
            break;
          }
        } catch (error) {
          continue; // Skip invalid files
        }
      }
      
      if (!targetFile) {
        return {
          content: [
            {
              type: 'text',
              text: `No conversation found with session ID: ${session_id}`
            }
          ]
        };
      }

      const { conversation } = targetFile;
      
      // Apply filters to messages
      const filterOptions = {
        content_types,
        exclude_long_messages,
        priority_messages
      };
      const filteredMessages = this.filterMessages(conversation.messages, filterOptions);
      
      // Apply pagination with token limiting
      const paginatedResult = this.paginateMessages(filteredMessages, page, page_size, max_tokens);
      const { messages: pageMessages, pagination } = paginatedResult;

      // Format conversation context
      let contextText = `# Conversation Context\n\n`;
      contextText += `**Project**: ${conversation.projectPath}\n`;
      contextText += `**Session ID**: ${conversation.sessionId}\n`;
      contextText += `**Duration**: ${new Date(conversation.startTime).toLocaleString()} - ${new Date(conversation.endTime).toLocaleString()}\n`;
      contextText += `**Messages**: ${conversation.messageCount}\n\n`;

      // Add pagination info
      contextText += `## Pagination Info\n`;
      contextText += `**Page**: ${pagination.currentPage} of ${pagination.totalPages}\n`;
      contextText += `**Showing**: ${pageMessages.length} messages (${pagination.totalMessages} total after filtering)\n`;
      contextText += `**Estimated Tokens**: ${pagination.estimatedTokens}\n`;
      if (pagination.hasNextPage) {
        contextText += `**Next Page Available**: Use page=${pagination.currentPage + 1}\n`;
      }
      if (pagination.hasPrevPage) {
        contextText += `**Previous Page Available**: Use page=${pagination.currentPage - 1}\n`;
      }
      contextText += `\n`;

      // Extract file references
      if (include_project_files) {
        const allFileRefs = new Set();
        conversation.messages.forEach(msg => {
          if (msg.content?.fileReferences) {
            msg.content.fileReferences.forEach(ref => allFileRefs.add(ref));
          }
        });
        
        if (allFileRefs.size > 0) {
          contextText += `## Files Referenced\n`;
          Array.from(allFileRefs).forEach(ref => {
            contextText += `- ${ref}\n`;
          });
          contextText += `\n`;
        }
      }

      // Show filtered messages
      contextText += `## Conversation Flow\n\n`;
      pageMessages.forEach((msg, i) => {
        if (msg.role && this.getMessageText(msg).length > 0) {
          const textContent = this.formatMessage(msg, summary_mode);
          contextText += `**${msg.role}**: ${textContent}\n\n`;
        }
      });

      // Add filtering summary if filters were applied
      if (content_types.length > 0 || exclude_long_messages || priority_messages.length > 0) {
        contextText += `## Filters Applied\n`;
        if (content_types.length > 0) {
          contextText += `- **Content Types**: ${content_types.join(', ')}\n`;
        }
        if (exclude_long_messages) {
          contextText += `- **Excluded**: Messages longer than 1000 characters\n`;
        }
        if (priority_messages.length > 0) {
          contextText += `- **Priority Messages**: ${priority_messages.join(', ')}\n`;
        }
        if (summary_mode !== 'full') {
          contextText += `- **Summary Mode**: ${summary_mode}\n`;
        }
      }

      return {
        content: [
          {
            type: 'text',
            text: contextText
          }
        ]
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `Error retrieving conversation context: ${error.message}`
          }
        ]
      };
    }
  }

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
          if (new Date(conversation.startTime) < cutoff) continue;
          
          // Apply project filter
          if (project_filter && conversation.projectPath) {
            const projectName = conversation.projectPath.split('/').pop();
            if (!projectName.toLowerCase().includes(project_filter.toLowerCase())) {
              continue;
            }
          }
          
          conversations.push(conversation);
        } catch (error) {
          continue; // Skip invalid files
        }
      }
      
      // Sort by start time (most recent first)
      conversations.sort((a, b) => new Date(b.startTime) - new Date(a.startTime));
      const limitedResults = conversations.slice(0, limit);
      
      const formattedResults = limitedResults.map((conv, i) => {
        const projectName = conv.projectPath ? conv.projectPath.split('/').pop() : 'Unknown';
        const duration = new Date(conv.endTime) - new Date(conv.startTime);
        const durationMin = Math.round(duration / (1000 * 60));
        
        return `${i + 1}. **${projectName}** (${conv.messageCount} messages, ${durationMin}m)\n` +
               `   Session: ${conv.sessionId}\n` +
               `   Time: ${new Date(conv.startTime).toLocaleString()}\n` +
               `   Preview: ${this.parser.getConversationPreview(conv)}\n`;
      }).join('\n');

      return {
        content: [
          {
            type: 'text',
            text: `Recent conversations ${timeframe ? `from ${timeframe}` : ''}:\n\n${formattedResults}`
          }
        ]
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `Error listing recent conversations: ${error.message}`
          }
        ]
      };
    }
  }

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
          previewWords.some(pWord => pWord.includes(word) || word.includes(pWord))
        ).length;
        
        const confidence = overlap / problemWords.length;
        
        return { ...result, confidence };
      }).filter(r => r.confidence >= confidence_threshold);
      
      // Sort by confidence
      scoredResults.sort((a, b) => b.confidence - a.confidence);
      
      const formattedResults = scoredResults.slice(0, 5).map((result, i) => {
        const projectName = result.projectPath ? result.projectPath.split('/').pop() : 'Unknown';
        const confidencePercent = Math.round(result.confidence * 100);
        
        return `${i + 1}. **${projectName}** (${confidencePercent}% match)\n` +
               `   Session: ${result.sessionId}\n` +
               `   Time: ${new Date(result.startTime).toLocaleString()}\n` +
               `   Context: ${result.preview}\n`;
      }).join('\n');

      return {
        content: [
          {
            type: 'text',
            text: `Similar solutions found for: "${problem_description}"\n\n${formattedResults || 'No similar solutions found with sufficient confidence.'}`
          }
        ]
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `Error finding similar solutions: ${error.message}`
          }
        ]
      };
    }
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('AI Memory MCP Server running on stdio');
  }
}

// Run the server
const server = new AIMemoryMCPServer();
server.run().catch(console.error);