/**
 * Conversation Correlator
 * Finds and correlates Claude Code conversations with file changes
 * Phase 2 Implementation - AI Memory App
 */

import path from 'path';
import fs from 'fs/promises';
import { createLogger } from '../utils/logger.js';
import DatabaseManager from '../database/database-manager.js';

class ConversationCorrelator {
    constructor(options = {}) {
        this.logger = createLogger('ConversationCorrelator');
        this.db = new DatabaseManager();
        this.db.initialize(); // Ensure database is initialized
        
        // Configuration
        this.config = {
            claudeProjectsPath: options.claudeProjectsPath || path.join(process.env.HOME, '.claude', 'projects'),
            timeWindowMs: options.timeWindowMs || 10000, // 10 seconds
            minConfidence: options.minConfidence || 0.5,
            ...options
        };
        
        // Cache for recent correlations
        this.recentCorrelations = new Map();
        this.cacheExpiryMs = 60000; // 1 minute cache
    }

    /**
     * Find conversation context for a file change
     * @param {string} repoPath - Repository path
     * @param {string} filePath - Changed file path
     * @returns {Promise<{sessionId: string, description: string, confidence: number}|null>}
     */
    async findConversationContext(repoPath, filePath) {
        try {
            const startTime = Date.now();
            
            // Check cache first
            const cacheKey = `${repoPath}:${filePath}`;
            const cached = this.recentCorrelations.get(cacheKey);
            if (cached && (startTime - cached.timestamp) < this.cacheExpiryMs) {
                return cached.data;
            }
            
            // Search for recent tool_use events in Claude projects
            const toolUseEvent = await this.findRecentToolUse(filePath);
            
            if (!toolUseEvent) {
                return null;
            }
            
            // Calculate confidence based on time proximity
            const timeDiff = startTime - toolUseEvent.timestamp;
            const confidence = Math.max(0, 1 - (timeDiff / this.config.timeWindowMs));
            
            if (confidence < this.config.minConfidence) {
                return null;
            }
            
            // Extract conversation context
            const context = await this.extractConversationContext(toolUseEvent.sessionId);
            
            const result = {
                sessionId: toolUseEvent.sessionId,
                description: context.description,
                confidence: confidence,
                timestamp: toolUseEvent.timestamp,
                toolType: toolUseEvent.toolType
            };
            
            // Cache the result
            this.recentCorrelations.set(cacheKey, {
                data: result,
                timestamp: startTime
            });
            
            // Clean old cache entries
            this.cleanCache();
            
            return result;
        } catch (error) {
            this.logger.error('Failed to find conversation context', {
                error: error.message,
                filePath
            });
            return null;
        }
    }

    /**
     * Find recent tool_use event for a file
     * @param {string} filePath - File path to search for
     * @returns {Promise<{sessionId: string, timestamp: number, toolType: string}|null>}
     */
    async findRecentToolUse(filePath) {
        try {
            // Get list of project directories
            const projectDirs = await this.getProjectDirectories();
            
            const currentTime = Date.now();
            let mostRecentEvent = null;
            
            for (const projectDir of projectDirs) {
                const conversationsDir = path.join(projectDir, 'conversations');
                
                try {
                    const files = await fs.readdir(conversationsDir);
                    const jsonlFiles = files.filter(f => f.endsWith('.jsonl'));
                    
                    // Check recent JSONL files (modified within time window)
                    for (const file of jsonlFiles) {
                        const fullPath = path.join(conversationsDir, file);
                        const stats = await fs.stat(fullPath);
                        
                        // Skip if file hasn't been modified recently
                        if (currentTime - stats.mtimeMs > this.config.timeWindowMs * 2) {
                            continue;
                        }
                        
                        // Search for tool_use events
                        const event = await this.searchFileForToolUse(fullPath, filePath);
                        if (event && (!mostRecentEvent || event.timestamp > mostRecentEvent.timestamp)) {
                            mostRecentEvent = event;
                        }
                    }
                } catch {
                    // Skip inaccessible directories
                    continue;
                }
            }
            
            return mostRecentEvent;
        } catch (error) {
            this.logger.error('Failed to find recent tool use', {
                error: error.message,
                filePath
            });
            return null;
        }
    }

    /**
     * Search JSONL file for tool_use events matching file path
     * @param {string} jsonlPath - Path to JSONL file
     * @param {string} targetFilePath - File path to search for
     * @returns {Promise<{sessionId: string, timestamp: number, toolType: string}|null>}
     */
    async searchFileForToolUse(jsonlPath, targetFilePath) {
        try {
            const content = await fs.readFile(jsonlPath, 'utf-8');
            const lines = content.trim().split('\n');
            
            // Parse from end (most recent events first)
            for (let i = lines.length - 1; i >= 0; i--) {
                try {
                    const event = JSON.parse(lines[i]);
                    
                    // Check if it's a tool_use event
                    if (event.type === 'tool_use' || event.tool_name) {
                        const toolName = event.tool_name || event.name;
                        
                        // Check if it's a file-modifying tool
                        if (['Edit', 'Write', 'MultiEdit', 'NotebookEdit'].includes(toolName)) {
                            // Check if the file path matches
                            const params = event.parameters || event.input || {};
                            const eventFilePath = params.file_path || params.path;
                            
                            if (eventFilePath && eventFilePath.includes(path.basename(targetFilePath))) {
                                // Extract session ID from file name or event
                                const sessionId = this.extractSessionId(jsonlPath, event);
                                
                                return {
                                    sessionId,
                                    timestamp: event.timestamp || Date.now(),
                                    toolType: toolName
                                };
                            }
                        }
                    }
                } catch {
                    // Skip malformed JSON lines
                    continue;
                }
            }
            
            return null;
        } catch (error) {
            this.logger.error('Failed to search JSONL file', {
                error: error.message,
                jsonlPath
            });
            return null;
        }
    }

    /**
     * Extract session ID from JSONL file name or event
     * @param {string} jsonlPath - Path to JSONL file
     * @param {Object} event - Event object
     * @returns {string}
     */
    extractSessionId(jsonlPath, event) {
        // Try to extract from event first
        if (event.session_id || event.sessionId) {
            return event.session_id || event.sessionId;
        }
        
        // Extract from file name (typically UUID.jsonl)
        const fileName = path.basename(jsonlPath, '.jsonl');
        const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        
        if (uuidPattern.test(fileName)) {
            return fileName;
        }
        
        // Generate a pseudo-ID from file name
        return `file-${fileName}`;
    }

    /**
     * Extract conversation context from database
     * @param {string} sessionId - Conversation session ID
     * @returns {Promise<{description: string}>}
     */
    async extractConversationContext(sessionId) {
        try {
            // Try to get conversation from database
            const query = `
                SELECT summary, first_user_message, last_user_message
                FROM conversations
                WHERE session_id = ?
            `;
            
            const row = this.db.db.prepare(query).get(sessionId);
            
            if (row && row.summary) {
                return {
                    description: row.summary
                };
            }
            
            // Fallback to basic description
            if (row && row.first_user_message) {
                const firstMessage = row.first_user_message.substring(0, 100);
                return {
                    description: `Working on: ${firstMessage}...`
                };
            }
            
            return {
                description: 'File modified during Claude Code session'
            };
        } catch (error) {
            this.logger.error('Failed to extract conversation context', {
                error: error.message,
                sessionId
            });
            return {
                description: 'File modified during Claude Code session'
            };
        }
    }

    /**
     * Get list of Claude project directories
     * @returns {Promise<Array<string>>}
     */
    async getProjectDirectories() {
        try {
            const dirs = [];
            
            // Check if Claude projects directory exists
            try {
                await fs.access(this.config.claudeProjectsPath);
                const projects = await fs.readdir(this.config.claudeProjectsPath);
                
                for (const project of projects) {
                    const projectPath = path.join(this.config.claudeProjectsPath, project);
                    const stats = await fs.stat(projectPath);
                    
                    if (stats.isDirectory()) {
                        dirs.push(projectPath);
                    }
                }
            } catch {
                this.logger.debug('Claude projects directory not found', {
                    path: this.config.claudeProjectsPath
                });
            }
            
            return dirs;
        } catch (error) {
            this.logger.error('Failed to get project directories', {
                error: error.message
            });
            return [];
        }
    }

    /**
     * Save correlation to database
     * @param {string} sessionId - Conversation session ID
     * @param {string} commitHash - Git commit hash
     * @param {string} repoPath - Repository path
     * @param {number} confidence - Correlation confidence
     * @returns {Promise<void>}
     */
    async saveCorrelation(sessionId, commitHash, repoPath, confidence) {
        try {
            const query = `
                INSERT INTO conversation_git_correlations 
                (conversation_session_id, commit_hash, repository_path, correlation_confidence)
                VALUES (?, ?, ?, ?)
            `;
            
            this.db.db.prepare(query).run(sessionId, commitHash, repoPath, confidence);
            
            this.logger.info('Saved conversation-git correlation', {
                sessionId,
                commitHash,
                confidence
            });
        } catch (error) {
            this.logger.error('Failed to save correlation', {
                error: error.message,
                sessionId,
                commitHash
            });
        }
    }

    /**
     * Clean old cache entries
     */
    cleanCache() {
        const now = Date.now();
        const expiredKeys = [];
        
        for (const [key, value] of this.recentCorrelations.entries()) {
            if (now - value.timestamp > this.cacheExpiryMs) {
                expiredKeys.push(key);
            }
        }
        
        for (const key of expiredKeys) {
            this.recentCorrelations.delete(key);
        }
    }

    /**
     * Get correlation statistics
     * @returns {Object}
     */
    getStatistics() {
        const query = `
            SELECT 
                COUNT(*) as total_correlations,
                AVG(correlation_confidence) as avg_confidence,
                COUNT(DISTINCT conversation_session_id) as unique_sessions,
                COUNT(DISTINCT repository_path) as unique_repos
            FROM conversation_git_correlations
            WHERE created_at > datetime('now', '-7 days')
        `;
        
        try {
            return this.db.db.prepare(query).get();
        } catch (error) {
            this.logger.error('Failed to get statistics', { error: error.message });
            return {
                total_correlations: 0,
                avg_confidence: 0,
                unique_sessions: 0,
                unique_repos: 0
            };
        }
    }
}

export default ConversationCorrelator;