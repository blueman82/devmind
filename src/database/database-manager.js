import Database from 'better-sqlite3';
import { promises as fs } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { homedir } from 'os';
import PerformanceMetrics from '../utils/performance-metrics.js';
import { createLogger } from '../utils/logger.js';
import GitSchema from './git-schema.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * DatabaseManager - Handles all SQLite operations for AI Memory App
 * Provides conversation indexing, FTS5 search, and data persistence
 */
export class DatabaseManager {
    constructor(dbPath = null, options = {}) {
        // Default database location as specified in PRD
        this.dbPath = dbPath || join(homedir(), '.claude', 'ai-memory', 'conversations.db');
        this.db = null;
        this.isInitialized = false;
        
        // Initialize structured logging
        this.logger = createLogger('DatabaseManager');
        
        // Initialize performance metrics if enabled
        this.metricsEnabled = options.enableMetrics !== false; // Default to true
        this.performanceMetrics = this.metricsEnabled ? new PerformanceMetrics() : null;
        
        // Initialize git schema (will be set up after database connection)
        this.gitSchema = null;
    }

    /**
     * Initialize database connection and apply schema
     */
    async initialize() {
        try {
            // Ensure database directory exists
            await fs.mkdir(dirname(this.dbPath), { recursive: true });

            // Open database connection
            this.db = new Database(this.dbPath);
            
            // Performance and concurrency optimizations
            this.db.pragma('journal_mode = WAL'); // Better concurrency
            this.db.pragma('foreign_keys = ON'); // Enforce foreign keys
            this.db.pragma('synchronous = NORMAL'); // Better performance vs FULL
            this.db.pragma('cache_size = -64000'); // 64MB cache
            this.db.pragma('mmap_size = 268435456'); // 256MB memory mapping
            
            // Apply schema
            await this.applySchema();
            
            // Initialize git schema
            this.gitSchema = new GitSchema(this.db);
            await this.gitSchema.initialize();
            
            this.isInitialized = true;
            console.log(`Database initialized at: ${this.dbPath}`);
            
            return true;
        } catch (error) {
            console.error('Database initialization failed:', error);
            this.logger.error('Database initialization failed', { error: error.message, stack: error.stack, dbPath: this.dbPath });
            throw error;
        }
    }

    /**
     * Apply database schema from schema.sql file
     */
    async applySchema() {
        try {
            const schemaPath = join(__dirname, 'schema.sql');
            const schemaSQL = await fs.readFile(schemaPath, 'utf-8');
            
            // Parse SQL statements properly, handling triggers with BEGIN/END blocks
            const statements = this.parseSQLStatements(schemaSQL);
                
            for (const statement of statements) {
                if (statement.trim()) {
                    try {
                        this.db.exec(statement);
                    } catch (execError) {
                        // Skip statements that might fail (like INSERT OR IGNORE)
                        if (!execError.message.includes('UNIQUE constraint failed')) {
                            console.warn('Schema statement warning:', execError.message);
                        }
                    }
                }
            }
            
            console.log('Database schema applied successfully');
        } catch (error) {
            console.error('Schema application failed:', error);
            this.logger.error('Schema application failed', { error: error.message, stack: error.stack });
            throw error;
        }
    }

    /**
     * Parse SQL statements properly, handling multi-line statements and triggers
     */
    parseSQLStatements(sql) {
        const statements = [];
        let current = '';
        let inTrigger = false;
        let parenDepth = 0;
        
        const lines = sql.split('\n');
        
        for (const line of lines) {
            const trimmed = line.trim();
            
            // Skip comments and empty lines
            if (!trimmed || trimmed.startsWith('--')) {
                continue;
            }
            
            current += line + '\n';
            
            // Track if we're inside a trigger with BEGIN/END
            if (trimmed.includes('CREATE TRIGGER')) {
                inTrigger = true;
            }
            
            // Track parentheses depth for CREATE TABLE statements
            parenDepth += (line.match(/\(/g) || []).length;
            parenDepth -= (line.match(/\)/g) || []).length;
            
            // Check for statement end
            let isStatementEnd = false;
            
            if (inTrigger && trimmed === 'END;') {
                isStatementEnd = true;
                inTrigger = false;
            } else if (!inTrigger && parenDepth === 0 && trimmed.endsWith(';')) {
                isStatementEnd = true;
            }
            
            if (isStatementEnd) {
                statements.push(current.trim());
                current = '';
                parenDepth = 0;
            }
        }
        
        // Add any remaining statement
        if (current.trim()) {
            statements.push(current.trim());
        }
        
        return statements.filter(stmt => stmt.length > 0);
    }

    /**
     * Insert or update a conversation record
     */
    async upsertConversation(conversationData) {
        this.ensureInitialized();
        
        const startTime = Date.now();
        const stmt = this.db.prepare(`
            INSERT INTO conversations (
                session_id, project_hash, project_name, project_path,
                created_at, updated_at, message_count, file_references,
                topics, keywords, total_tokens
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(session_id) DO UPDATE SET
                project_name = excluded.project_name,
                project_path = excluded.project_path,
                updated_at = excluded.updated_at,
                message_count = excluded.message_count,
                file_references = excluded.file_references,
                topics = excluded.topics,
                keywords = excluded.keywords,
                total_tokens = excluded.total_tokens
        `);

        const result = stmt.run(
            conversationData.session_id,
            conversationData.project_hash,
            conversationData.project_name,
            conversationData.project_path,
            conversationData.created_at,
            conversationData.updated_at || new Date().toISOString(),
            conversationData.message_count || 0,
            JSON.stringify(conversationData.file_references || []),
            JSON.stringify(conversationData.topics || []),
            JSON.stringify(conversationData.keywords || []),
            conversationData.total_tokens || 0
        );

        // Always query for the conversation ID to avoid lastInsertRowid issues
        // ON CONFLICT UPDATE can cause lastInsertRowid to contain incorrect values
        const getIdStmt = this.db.prepare('SELECT id FROM conversations WHERE session_id = ?');
        const row = getIdStmt.get(conversationData.session_id);
        const conversationId = row ? row.id : null;
        
        // Error logging for troubleshooting
        if (!conversationId) {
            const errorDetails = {
                session_id: conversationData.session_id,
                lastInsertRowid: result.lastInsertRowid,
                changes: result.changes,
                row: row
            };
            console.error('Failed to get conversation ID:', errorDetails);
            
            // Log to structured logging system  
            if (this.logger) {
                this.logger.error('Failed to retrieve conversation ID after upsert', errorDetails);
            }
            
            // Throw error to prevent invalid foreign key references
            throw new Error(`Failed to get conversation ID for session ${conversationData.session_id}`);
        }

        // Record performance metrics
        if (this.performanceMetrics) {
            this.performanceMetrics.recordDatabaseQuery('upsertConversation', Date.now() - startTime, 1);
        }

        return { ...result, conversationId };
    }

    /**
     * Insert a message into the database
     */
    async insertMessage(messageData) {
        this.ensureInitialized();
        
        const stmt = this.db.prepare(`
            INSERT INTO messages (
                conversation_id, message_index, uuid, timestamp, role,
                content_type, content, content_summary, tool_calls,
                file_references, tokens
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        return stmt.run(
            messageData.conversation_id,
            messageData.message_index,
            messageData.uuid,
            messageData.timestamp,
            messageData.role,
            messageData.content_type || 'text',
            messageData.content,
            messageData.content_summary || null,
            JSON.stringify(messageData.tool_calls || []),
            JSON.stringify(messageData.file_references || []),
            messageData.tokens || 0
        );
    }

    /**
     * Batch insert messages for better performance
     */
    async insertMessages(messages) {
        this.ensureInitialized();
        
        const stmt = this.db.prepare(`
            INSERT INTO messages (
                conversation_id, message_index, uuid, timestamp, role,
                content_type, content, content_summary, tool_calls,
                file_references, tokens
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        const transaction = this.db.transaction((messages) => {
            for (const msg of messages) {
                // Validate conversation_id before insert
                if (!msg.conversation_id) {
                    const errorDetails = {
                        conversation_id: msg.conversation_id,
                        message_index: msg.message_index,
                        uuid: msg.uuid,
                        role: msg.role
                    };
                    this.logger.error('CRITICAL: Attempting to insert message with null/undefined conversation_id', errorDetails);
                    throw new Error(`Cannot insert message: conversation_id is ${msg.conversation_id}`);
                }
                
                try {
                    stmt.run(
                        msg.conversation_id,
                        msg.message_index,
                        msg.uuid,
                        msg.timestamp,
                        msg.role,
                        msg.content_type || 'text',
                        msg.content,
                        msg.content_summary || null,
                        JSON.stringify(msg.tool_calls || []),
                        JSON.stringify(msg.file_references || []),
                        msg.tokens || 0
                    );
                } catch (error) {
                    const errorDetails = {
                        error: error.message,
                        code: error.code,
                        conversation_id: msg.conversation_id,
                        message_index: msg.message_index,
                        uuid: msg.uuid,
                        role: msg.role
                    };
                    this.logger.error('Database constraint error during message insert', errorDetails);
                    throw error;
                }
            }
        });

        try {
            const result = transaction(messages);
            this.logger.info('Successfully inserted messages', { count: messages.length, conversation_id: messages[0]?.conversation_id });
            return result;
        } catch (error) {
            this.logger.error('Transaction failed during message insert', { 
                error: error.message, 
                code: error.code,
                messageCount: messages.length,
                firstConversationId: messages[0]?.conversation_id
            });
            throw error;
        }
    }

    /**
     * Search conversations using FTS5 full-text search
     */
    searchConversations(query, options = {}) {
        this.ensureInitialized();
        
        const startTime = Date.now();
        const {
            limit = 50,
            offset = 0,
            projectFilter = null,
            timeframe = null,
            searchMode = 'mixed' // 'fuzzy', 'exact', 'mixed'
        } = options;

        // Build FTS5 query based on search mode
        const ftsQuery = this.buildFTSQuery(query, searchMode);
        
        let sql = `
            SELECT DISTINCT
                c.id,
                c.session_id,
                c.project_name,
                c.project_path,
                c.created_at,
                c.updated_at,
                c.message_count,
                c.topics,
                c.keywords,
                c.total_tokens,
                snippet(messages_fts, 1, '<mark>', '</mark>', '...', 32) as snippet,
                bm25(messages_fts) as relevance_score
            FROM conversations c
            JOIN messages m ON m.conversation_id = c.id  
            JOIN messages_fts ON messages_fts.message_id = m.id
            WHERE messages_fts MATCH ?
        `;

        const params = [ftsQuery];

        // Add project filter
        if (projectFilter) {
            sql += ` AND c.project_path LIKE ?`;
            params.push(`%${projectFilter}%`);
        }

        // Add timeframe filter
        if (timeframe) {
            const timeCondition = this.parseTimeframe(timeframe);
            if (timeCondition) {
                sql += ` AND c.created_at >= ?`;
                params.push(timeCondition.toISOString());
            }
        }

        sql += ` ORDER BY relevance_score DESC LIMIT ? OFFSET ?`;
        params.push(limit, offset);

        const stmt = this.db.prepare(sql);
        const results = stmt.all(...params);

        // Record performance metrics
        if (this.performanceMetrics) {
            this.performanceMetrics.recordSearchOperation(
                'conversationSearch',
                query,
                Date.now() - startTime,
                results.length,
                { searchMode, limit, projectFilter: !!projectFilter, timeframe: !!timeframe }
            );
        }

        return results;
    }

    /**
     * Get conversation context by session ID with pagination
     */
    getConversationContext(sessionId, options = {}) {
        this.ensureInitialized();
        
        const startTime = Date.now();
        const {
            page = 1,
            pageSize = 50,
            maxTokens = 20000,
            contentTypes = null,
            summaryMode = 'full'
        } = options;

        // First get conversation metadata
        const conversation = this.db.prepare(`
            SELECT * FROM conversations WHERE session_id = ?
        `).get(sessionId);

        if (!conversation) {
            // Record performance metrics for failed lookup
            if (this.performanceMetrics) {
                this.performanceMetrics.recordDatabaseQuery('getConversationContext', Date.now() - startTime, 0);
            }
            return null;
        }

        // Build messages query with filters
        let messagesSql = `
            SELECT * FROM messages 
            WHERE conversation_id = ?
        `;
        const params = [conversation.id];

        if (contentTypes && contentTypes.length > 0) {
            messagesSql += ` AND role IN (${contentTypes.map(() => '?').join(',')})`;
            params.push(...contentTypes);
        }

        messagesSql += ` ORDER BY message_index ASC`;

        const messages = this.db.prepare(messagesSql).all(...params);

        // Apply pagination and token limits
        const paginatedMessages = this.paginateMessages(
            messages, page, pageSize, maxTokens, summaryMode
        );

        // Record performance metrics
        if (this.performanceMetrics) {
            this.performanceMetrics.recordDatabaseQuery(
                'getConversationContext', 
                Date.now() - startTime, 
                messages.length
            );
        }

        return {
            conversation: {
                ...conversation,
                topics: JSON.parse(conversation.topics || '[]'),
                keywords: JSON.parse(conversation.keywords || '[]'),
                file_references: JSON.parse(conversation.file_references || '[]')
            },
            messages: paginatedMessages.messages,
            pagination: paginatedMessages.pagination
        };
    }

    /**
     * Build FTS5 query string based on search mode
     */
    buildFTSQuery(query, mode = 'mixed') {
        if (mode === 'exact') {
            return `"${query}"`;
        }
        
        // For mixed/fuzzy modes, split query into terms
        const terms = query.trim().split(/\s+/);
        
        if (terms.length === 1) {
            return terms[0];
        }

        // Use OR logic by default for better results
        return terms.join(' OR ');
    }

    /**
     * Parse timeframe string into Date object
     */
    parseTimeframe(timeframe) {
        const now = new Date();
        const lowerFrame = timeframe.toLowerCase();
        
        if (lowerFrame.includes('hour')) {
            const hours = parseInt(lowerFrame) || 1;
            return new Date(now.getTime() - (hours * 60 * 60 * 1000));
        }
        
        if (lowerFrame.includes('day')) {
            const days = parseInt(lowerFrame) || 1;
            return new Date(now.getTime() - (days * 24 * 60 * 60 * 1000));
        }
        
        if (lowerFrame.includes('week')) {
            const weeks = parseInt(lowerFrame) || 1;
            return new Date(now.getTime() - (weeks * 7 * 24 * 60 * 60 * 1000));
        }
        
        return null;
    }

    /**
     * Paginate messages with token awareness
     */
    paginateMessages(messages, page, pageSize, maxTokens, summaryMode) {
        const startIndex = (page - 1) * pageSize;
        let totalTokens = 0;
        const resultMessages = [];
        
        for (let i = startIndex; i < messages.length && resultMessages.length < pageSize; i++) {
            const msg = messages[i];
            const tokens = msg.tokens || Math.ceil(msg.content.length / 4);
            
            if (totalTokens + tokens > maxTokens && resultMessages.length > 0) {
                break;
            }
            
            resultMessages.push(this.formatMessage(msg, summaryMode));
            totalTokens += tokens;
        }
        
        return {
            messages: resultMessages,
            pagination: {
                page,
                pageSize,
                totalMessages: messages.length,
                totalPages: Math.ceil(messages.length / pageSize),
                totalTokens,
                hasNextPage: (page * pageSize) < messages.length
            }
        };
    }

    /**
     * Format message based on summary mode
     */
    formatMessage(message, summaryMode) {
        const formatted = {
            ...message,
            tool_calls: JSON.parse(message.tool_calls || '[]'),
            file_references: JSON.parse(message.file_references || '[]')
        };

        if (summaryMode === 'condensed' && message.content.length > 200) {
            formatted.content = message.content.substring(0, 200) + '...';
        } else if (summaryMode === 'key_points_only') {
            formatted.content = message.content_summary || 
                              message.content.substring(0, 100) + '...';
        }

        return formatted;
    }

    /**
     * Update statistics table
     */
    updateStats(statName, statValue) {
        this.ensureInitialized();
        
        const stmt = this.db.prepare(`
            INSERT OR REPLACE INTO index_stats (stat_name, stat_value, updated_at)
            VALUES (?, ?, CURRENT_TIMESTAMP)
        `);
        
        return stmt.run(statName, statValue.toString());
    }

    /**
     * Get database statistics
     */
    getStats() {
        this.ensureInitialized();
        
        const stats = this.db.prepare('SELECT stat_name, stat_value FROM index_stats').all();
        return Object.fromEntries(stats.map(s => [s.stat_name, s.stat_value]));
    }

    /**
     * Get performance metrics report
     */
    getPerformanceReport(timeWindow = 60000) {
        if (!this.performanceMetrics) {
            return null;
        }
        return this.performanceMetrics.getPerformanceReport(timeWindow);
    }

    /**
     * Get performance metrics instance
     */
    getPerformanceMetrics() {
        return this.performanceMetrics;
    }

    /**
     * Close database connection
     */
    close() {
        // Stop performance metrics collection
        if (this.performanceMetrics) {
            this.performanceMetrics.stopSystemMetricsCollection();
        }
        
        if (this.db) {
            this.db.close();
            this.db = null;
            this.isInitialized = false;
        }
    }

    /**
     * Ensure database is initialized
     */
    ensureInitialized() {
        if (!this.isInitialized || !this.db) {
            throw new Error('Database not initialized. Call initialize() first.');
        }
    }
}

export default DatabaseManager;