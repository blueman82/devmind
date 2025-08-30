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
            description: 'Retrieve full context from a specific conversation including messages and project info',
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

  async handleGetConversationContext(args) {
    const { session_id, include_project_files = true } = args;
    
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
      
      // Format conversation context
      let contextText = `# Conversation Context\n\n`;
      contextText += `**Project**: ${conversation.projectPath}\n`;
      contextText += `**Session ID**: ${conversation.sessionId}\n`;
      contextText += `**Duration**: ${new Date(conversation.startTime).toLocaleString()} - ${new Date(conversation.endTime).toLocaleString()}\n`;
      contextText += `**Messages**: ${conversation.messageCount}\n\n`;

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

      // Show key messages
      contextText += `## Conversation Flow\n\n`;
      conversation.messages.forEach((msg, i) => {
        if (msg.role && msg.content?.text?.length > 0) {
          const textContent = msg.content.text.join(' ').substring(0, 200);
          contextText += `**${msg.role}**: ${textContent}${textContent.length >= 200 ? '...' : ''}\n\n`;
        }
      });

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