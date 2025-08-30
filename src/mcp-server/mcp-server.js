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
import { ToolHandlers } from './handlers/tool-handlers.js';

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
    this.toolHandlers = new ToolHandlers(this.parser);
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
                  description: 'Page number for pagination (1-based)',
                  default: 1,
                  minimum: 1
                },
                page_size: {
                  type: 'number',
                  description: 'Number of messages per page',
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
                  description: 'Filter by message types (empty = all types)'
                },
                summary_mode: {
                  type: 'string',
                  enum: ['full', 'condensed', 'key_points_only'],
                  description: 'Message compression level',
                  default: 'full'
                },
                max_tokens: {
                  type: 'number',
                  description: 'Maximum tokens per page (overrides page_size if needed)',
                  default: 20000,
                  minimum: 1000,
                  maximum: 50000
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
                  description: 'Always include these message types even when filtering'
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
                limit: {
                  type: 'number',
                  description: 'Maximum number of conversations to return',
                  default: 20
                },
                project_filter: {
                  type: 'string',
                  description: 'Optional project name or path to filter by'
                },
                timeframe: {
                  type: 'string',
                  description: 'Timeframe like "today", "yesterday", "2 days ago"',
                  default: 'today'
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
                confidence_threshold: {
                  type: 'number',
                  description: 'Minimum confidence score for matches (0.0-1.0)',
                  default: 0.6,
                  minimum: 0.0,
                  maximum: 1.0
                },
                exclude_current_project: {
                  type: 'boolean',
                  description: 'Exclude results from the current project',
                  default: true
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
            return await this.toolHandlers.handleSearchConversations(args);
            
          case 'get_conversation_context':
            return await this.toolHandlers.handleGetConversationContext(args);
            
          case 'list_recent_conversations':
            return await this.toolHandlers.handleListRecentConversations(args);
            
          case 'find_similar_solutions':
            return await this.toolHandlers.handleFindSimilarSolutions(args);
            
          default:
            throw new McpError(
              ErrorCode.MethodNotFound,
              `Unknown tool: ${name}`
            );
        }
      } catch (error) {
        console.error(`Error in ${name}:`, error);
        return {
          content: [{
            type: 'text',
            text: `Error: ${error.message}`
          }]
        };
      }
    });
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('AI Memory MCP Server running on stdio');
  }
}

// Start the server
const server = new AIMemoryMCPServer();
server.run().catch(console.error);