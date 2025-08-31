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
import { GitToolHandlers } from './handlers/git-tool-handlers.js';
import ConfigValidator from '../utils/config-validator.js';
import HealthChecker from '../utils/health-check.js';
import { createLogger } from '../utils/logger.js';

class AIMemoryMCPServer {
  constructor() {
    this.logger = createLogger('MCPServer');
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
    this.gitToolHandlers = new GitToolHandlers(this.toolHandlers.dbManager);
    this.healthChecker = null; // Initialized after database setup
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
                },
                max_tokens: {
                  type: 'number',
                  minimum: 1000,
                  maximum: 10000,
                  description: 'Maximum tokens for response (default: 3000) - enables massive token savings',
                  default: 3000
                },
                include_snippets: {
                  type: 'boolean',
                  description: 'Include content snippets in results (default: true)',
                  default: true
                },
                snippet_length: {
                  type: 'number',
                  minimum: 50,
                  maximum: 500,
                  description: 'Maximum tokens per snippet (default: 150)',
                  default: 150
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
          },
          {
            name: 'health_check',
            description: 'Get system health status and diagnostics',
            inputSchema: {
              type: 'object',
              properties: {
                detailed: {
                  type: 'boolean',
                  description: 'Return detailed health check results',
                  default: false
                }
              }
            }
          },
          {
            name: 'performance_metrics',
            description: 'Get performance metrics and analytics',
            inputSchema: {
              type: 'object',
              properties: {
                category: {
                  type: 'string',
                  description: 'Specific category to get metrics for (database, search, indexing, system)',
                  enum: ['database', 'search', 'indexing', 'system']
                },
                timeWindow: {
                  type: 'number',
                  description: 'Time window in milliseconds for metrics aggregation',
                  default: 60000
                }
              }
            }
          },
          {
            name: 'get_git_context',
            description: 'Get git repository context including commit history and working directory status for a project',
            inputSchema: {
              type: 'object',
              properties: {
                project_path: {
                  type: 'string',
                  description: 'Path to the project directory'
                },
                conversation_id: {
                  type: 'string',
                  description: 'Optional conversation ID to get git links for'
                },
                include_commit_history: {
                  type: 'boolean',
                  description: 'Include recent commit history',
                  default: true
                },
                include_working_status: {
                  type: 'boolean', 
                  description: 'Include working directory status (staged, modified, untracked files)',
                  default: true
                },
                commit_limit: {
                  type: 'number',
                  description: 'Maximum number of commits to return',
                  default: 20,
                  minimum: 1,
                  maximum: 100
                },
                time_range: {
                  type: 'string',
                  description: 'Time range for commit history (e.g., "1 week ago", "today", "2 days ago")'
                }
              },
              required: ['project_path']
            }
          },
          {
            name: 'list_restore_points',
            description: 'List available restore points (tagged working states) for a project',
            inputSchema: {
              type: 'object',
              properties: {
                project_path: {
                  type: 'string',
                  description: 'Path to the project directory'
                },
                timeframe: {
                  type: 'string',
                  description: 'Filter restore points by timeframe (e.g., "last week", "2 days ago", "today")'
                },
                include_auto_generated: {
                  type: 'boolean',
                  description: 'Include automatically generated restore points',
                  default: false
                },
                limit: {
                  type: 'number',
                  description: 'Maximum number of restore points to return',
                  default: 50,
                  minimum: 1,
                  maximum: 100
                }
              },
              required: ['project_path']
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
            
          case 'health_check':
            return await this.handleHealthCheck(args);
            
          case 'performance_metrics':
            return await this.handlePerformanceMetrics(args);
            
          case 'get_git_context':
            return await this.gitToolHandlers.handleGetGitContext(args);
            
          case 'list_restore_points':
            return await this.gitToolHandlers.handleListRestorePoints(args);
            
          default:
            throw new McpError(
              ErrorCode.MethodNotFound,
              `Unknown tool: ${name}`
            );
        }
      } catch (error) {
        this.logger.error('MCP tool execution failed', { 
          toolName: name, 
          error: error.message, 
          stack: error.stack,
          args: Object.keys(args || {})
        });
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

  /**
   * Handle health check requests
   */
  async handleHealthCheck(args) {
    try {
      if (!this.healthChecker) {
        return {
          content: [{
            type: 'text',
            text: 'Health checker not initialized'
          }]
        };
      }

      const detailed = args?.detailed || false;
      
      let healthResult;
      if (detailed) {
        healthResult = await this.healthChecker.runHealthCheck();
      } else {
        healthResult = await this.healthChecker.getHealthStatus();
      }

      return {
        content: [{
          type: 'text',
          text: JSON.stringify(healthResult, null, 2)
        }]
      };

    } catch (error) {
      this.logger.error('Health check failed', { error: error.message, stack: error.stack });
      return {
        content: [{
          type: 'text',
          text: `Health check error: ${error.message}`
        }]
      };
    }
  }

  /**
   * Handle performance metrics requests
   */
  async handlePerformanceMetrics(args) {
    try {
      if (!this.toolHandlers.dbManager || !this.toolHandlers.dbManager.getPerformanceMetrics()) {
        return {
          content: [{
            type: 'text',
            text: 'Performance metrics not available - metrics collection may be disabled'
          }]
        };
      }

      const timeWindow = args?.timeWindow || 60000;
      const category = args?.category;

      const performanceMetrics = this.toolHandlers.dbManager.getPerformanceMetrics();
      
      let metricsResult;
      if (category) {
        // Get analytics for specific category
        metricsResult = performanceMetrics.getAnalytics(category, timeWindow);
        if (!metricsResult) {
          return {
            content: [{
              type: 'text',
              text: `No metrics available for category: ${category}`
            }]
          };
        }
      } else {
        // Get comprehensive performance report
        metricsResult = performanceMetrics.getPerformanceReport(timeWindow);
      }

      return {
        content: [{
          type: 'text',
          text: JSON.stringify(metricsResult, null, 2)
        }]
      };

    } catch (error) {
      this.logger.error('Performance metrics request failed', { error: error.message, stack: error.stack });
      return {
        content: [{
          type: 'text',
          text: `Performance metrics error: ${error.message}`
        }]
      };
    }
  }

  async run() {
    // Validate configuration before starting
    const validator = new ConfigValidator();
    await validator.validateOrExit();
    
    // Initialize health checker (needs database from tool handlers)
    if (this.toolHandlers.dbManager) {
      this.healthChecker = new HealthChecker({
        dbManager: this.toolHandlers.dbManager
      });
      this.logger.info('Health checker initialized');
    }
    
    this.logger.info('MCP Server starting up');
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    this.logger.info('MCP Server connected on stdio transport');
    console.error('AI Memory MCP Server running on stdio');
  }
}

// Start the server with configuration validation
const server = new AIMemoryMCPServer();
server.run().catch((error) => {
  const logger = createLogger('MCPServer');
  logger.error('MCP Server startup failed', { error: error.message, stack: error.stack });
  console.error('MCP Server startup failed:', error);
  process.exit(1);
});