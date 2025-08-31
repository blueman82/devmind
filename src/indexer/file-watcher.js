import { watch } from 'fs';
import { promises as fs } from 'fs';
import { join, extname, basename } from 'path';
import { homedir } from 'os';
import DatabaseManager from '../database/database-manager.js';
import ConversationParser from '../parser/conversation-parser.js';
import { createLogger } from '../utils/logger.js';

/**
 * FileWatcher - Real-time monitoring of Claude projects directory
 * Uses fs.watch() to detect JSONL file changes and trigger immediate indexing
 */
export class FileWatcher {
    constructor(options = {}) {
        this.claudeProjectsPath = options.claudeProjectsPath || 
                                  join(homedir(), '.claude', 'projects');
        this.dbManager = new DatabaseManager(options.dbPath);
        this.parser = new ConversationParser();
        this.watchers = new Map(); // Track active watchers
        this.indexingQueue = new Set(); // Prevent duplicate indexing
        this.isRunning = false;
        
        // Debouncing to handle rapid file changes
        this.debounceDelay = options.debounceDelay || 1000; // 1 second
        this.pendingIndexes = new Map();
        
        this.logger = createLogger('FileWatcher');
        this.logger.info('FileWatcher initialized', { claudeProjectsPath: this.claudeProjectsPath });
        console.log(`FileWatcher initialized for: ${this.claudeProjectsPath}`);
    }

    /**
     * Start real-time file monitoring
     */
    async start() {
        try {
            // Initialize database
            await this.dbManager.initialize();
            
            // Check if Claude projects directory exists
            try {
                await fs.access(this.claudeProjectsPath);
            } catch (error) {
                console.log(`Claude projects directory not found: ${this.claudeProjectsPath}`);
                console.log('Waiting for Claude projects to be created...');
                
                // Watch parent directory for creation
                await this.watchParentDirectory();
                return;
            }

            // Discover existing project directories
            const projectDirs = await this.discoverProjectDirectories();
            console.log(`Found ${projectDirs.length} project directories to monitor`);

            // Start watching each project directory
            for (const projectDir of projectDirs) {
                await this.watchProjectDirectory(projectDir);
            }

            // Watch main projects directory for new project creations
            await this.watchProjectsDirectory();

            this.isRunning = true;
            console.log('FileWatcher started successfully');
            
        } catch (error) {
            console.error('Failed to start FileWatcher:', error);
            throw error;
        }
    }

    /**
     * Discover all existing project directories
     */
    async discoverProjectDirectories() {
        try {
            const entries = await fs.readdir(this.claudeProjectsPath, { withFileTypes: true });
            const projectDirs = [];

            for (const entry of entries) {
                if (entry.isDirectory()) {
                    const projectPath = join(this.claudeProjectsPath, entry.name);
                    
                    // Check if directory contains JSONL files
                    const hasJsonlFiles = await this.checkForJsonlFiles(projectPath);
                    if (hasJsonlFiles) {
                        projectDirs.push(projectPath);
                    }
                }
            }

            return projectDirs;
        } catch (error) {
            console.error('Failed to discover project directories:', error);
            return [];
        }
    }

    /**
     * Check if directory contains JSONL files
     */
    async checkForJsonlFiles(directoryPath) {
        try {
            const files = await fs.readdir(directoryPath);
            return files.some(file => extname(file) === '.jsonl');
        } catch (error) {
            return false;
        }
    }

    /**
     * Watch the main projects directory for new project creation
     */
    async watchProjectsDirectory() {
        try {
            const watcher = watch(this.claudeProjectsPath, { recursive: false }, 
                async (eventType, filename) => {
                    if (eventType === 'rename' && filename) {
                        const newProjectPath = join(this.claudeProjectsPath, filename);
                        
                        try {
                            const stat = await fs.stat(newProjectPath);
                            if (stat.isDirectory()) {
                                console.log(`New project directory detected: ${filename}`);
                                
                                // Wait a bit for the directory to be fully created
                                setTimeout(async () => {
                                    const hasJsonl = await this.checkForJsonlFiles(newProjectPath);
                                    if (hasJsonl) {
                                        await this.watchProjectDirectory(newProjectPath);
                                    }
                                }, 2000);
                            }
                        } catch (error) {
                            // Directory might have been deleted, ignore
                        }
                    }
                });

            this.watchers.set('main', watcher);
            console.log('Monitoring main projects directory for new projects');
        } catch (error) {
            console.error(`Failed to watch main projects directory ${this.claudeProjectsPath}:`, error);
            // Ensure any partial watcher is cleaned up
            const existingWatcher = this.watchers.get('main');
            if (existingWatcher) {
                try {
                    existingWatcher.close();
                } catch (closeError) {
                    console.error('Error closing failed main directory watcher:', closeError);
                }
                this.watchers.delete('main');
            }
            throw error;
        }
    }

    /**
     * Watch a specific project directory for JSONL changes
     */
    async watchProjectDirectory(projectPath) {
        const projectName = basename(projectPath);
        
        try {
            // Skip if already watching
            if (this.watchers.has(projectPath)) {
                return;
            }

            const watcher = watch(projectPath, { recursive: false }, 
                async (eventType, filename) => {
                    if (!filename || extname(filename) !== '.jsonl') {
                        return;
                    }

                    const filePath = join(projectPath, filename);
                    
                    if (eventType === 'rename') {
                        // File created or deleted
                        try {
                            await fs.access(filePath);
                            console.log(`New conversation file: ${filename} in ${projectName}`);
                            this.scheduleIndexing(filePath);
                        } catch (error) {
                            // File was deleted
                            console.log(`Conversation file deleted: ${filename} in ${projectName}`);
                        }
                    } else if (eventType === 'change') {
                        // File modified
                        console.log(`Conversation file updated: ${filename} in ${projectName}`);
                        this.scheduleIndexing(filePath);
                    }
                });

            this.watchers.set(projectPath, watcher);
            console.log(`Watching project directory: ${projectName}`);

        } catch (error) {
            console.error(`Failed to watch project directory ${projectPath}:`, error);
            // Ensure any partial watcher is cleaned up
            const existingWatcher = this.watchers.get(projectPath);
            if (existingWatcher) {
                try {
                    existingWatcher.close();
                } catch (closeError) {
                    console.error(`Error closing failed project watcher for ${projectName}:`, closeError);
                }
                this.watchers.delete(projectPath);
            }
            throw error;
        }
    }

    /**
     * Watch parent directory when projects directory doesn't exist
     */
    async watchParentDirectory() {
        const parentDir = join(homedir(), '.claude');
        
        try {
            const watcher = watch(parentDir, { recursive: false }, 
                async (eventType, filename) => {
                    if (filename === 'projects' && eventType === 'rename') {
                        try {
                            await fs.access(this.claudeProjectsPath);
                            console.log('Claude projects directory created, starting monitoring...');
                            watcher.close();
                            await this.start(); // Restart monitoring
                        } catch (error) {
                            // Directory not ready yet
                        }
                    }
                });

            this.watchers.set('parent', watcher);
            console.log('Monitoring parent directory for projects creation');
            
        } catch (error) {
            console.error('Failed to watch parent directory:', error);
            // Ensure any partial watcher is cleaned up
            const existingWatcher = this.watchers.get('parent');
            if (existingWatcher) {
                try {
                    existingWatcher.close();
                } catch (closeError) {
                    console.error('Error closing failed parent directory watcher:', closeError);
                }
                this.watchers.delete('parent');
            }
            throw error;
        }
    }

    /**
     * Schedule file indexing with debouncing
     */
    scheduleIndexing(filePath) {
        // Clear existing timeout for this file
        if (this.pendingIndexes.has(filePath)) {
            clearTimeout(this.pendingIndexes.get(filePath));
        }

        // Schedule new indexing with debounce
        const timeoutId = setTimeout(async () => {
            this.pendingIndexes.delete(filePath);
            await this.indexFile(filePath);
        }, this.debounceDelay);

        this.pendingIndexes.set(filePath, timeoutId);
    }

    /**
     * Index a specific JSONL file
     */
    async indexFile(filePath) {
        // Prevent duplicate indexing
        if (this.indexingQueue.has(filePath)) {
            return;
        }

        this.indexingQueue.add(filePath);
        
        try {
            // Initialize database if not already initialized
            if (!this.dbManager.isInitialized) {
                await this.dbManager.initialize();
            }
            
            console.log(`Indexing conversation file: ${basename(filePath)}`);
            
            // Parse conversation file
            const conversations = await this.parser.parseJsonlFile(filePath);
            
            if (conversations.length === 0) {
                console.log(`No conversations found in: ${basename(filePath)}`);
                return;
            }

            // Index each conversation
            for (const conversation of conversations) {
                await this.indexConversation(conversation);
            }

            console.log(`Successfully indexed ${conversations.length} conversations from: ${basename(filePath)}`);
            
            // Update statistics
            await this.dbManager.updateStats('last_incremental_index', new Date().toISOString());
            
        } catch (error) {
            console.error(`Failed to index file ${filePath}:`, error);
            
            // Skip corrupted files as per requirements
            if (error.message.includes('JSON') || error.message.includes('parse')) {
                console.log(`Skipping corrupted file: ${basename(filePath)}`);
            }
        } finally {
            this.indexingQueue.delete(filePath);
        }
    }

    /**
     * Index a single conversation into SQLite
     */
    async indexConversation(conversation) {
        try {
            // Upsert conversation record
            const result = await this.dbManager.upsertConversation({
                session_id: conversation.session_id,
                project_hash: conversation.project_hash,
                project_name: conversation.project_name,
                project_path: conversation.project_path,
                created_at: conversation.startTime,
                updated_at: conversation.lastUpdated,
                message_count: conversation.message_count,
                file_references: conversation.file_references,
                topics: conversation.topics,
                keywords: conversation.keywords,
                total_tokens: conversation.total_tokens
            });

            const conversationId = result.lastInsertRowid || result.changes;

            // Insert messages if this is a new conversation
            if (result.changes > 0 && conversation.messages.length > 0) {
                const messages = conversation.messages.map((msg, index) => {
                    // Extract text content from the parsed content structure
                    let textContent = '';
                    let toolCalls = [];
                    let fileReferences = [];
                    
                    if (msg.content) {
                        textContent = Array.isArray(msg.content.text) ? 
                            msg.content.text.join('\n') : '';
                        toolCalls = msg.content.toolCalls || [];
                        fileReferences = msg.content.fileReferences || [];
                    }
                    
                    return {
                        conversation_id: conversationId,
                        message_index: index,
                        uuid: msg.uuid,
                        timestamp: msg.timestamp,
                        role: msg.role,
                        content_type: msg.type || 'text',
                        content: textContent || '',
                        content_summary: textContent.length > 200 ? 
                            textContent.substring(0, 200) + '...' : null,
                        tool_calls: toolCalls,
                        file_references: fileReferences,
                        tokens: Math.ceil(textContent.length / 4) // Rough token estimate
                    };
                });

                await this.dbManager.insertMessages(messages);
            }

        } catch (error) {
            console.error(`Failed to index conversation ${conversation.sessionId}:`, error);
            throw error;
        }
    }

    /**
     * Perform full index of all existing conversations
     */
    async performFullIndex() {
        console.log('Starting full index of existing conversations...');
        
        try {
            // Initialize database if not already initialized
            if (!this.dbManager.isInitialized) {
                await this.dbManager.initialize();
            }
            
            const projectDirs = await this.discoverProjectDirectories();
            let totalConversations = 0;

            for (const projectDir of projectDirs) {
                const files = await fs.readdir(projectDir);
                const jsonlFiles = files.filter(file => extname(file) === '.jsonl');

                for (const file of jsonlFiles) {
                    const filePath = join(projectDir, file);
                    await this.indexFile(filePath);
                    totalConversations++;
                }
            }

            await this.dbManager.updateStats('last_full_index', new Date().toISOString());
            await this.dbManager.updateStats('total_conversations', totalConversations);
            
            console.log(`Full index completed. Processed ${totalConversations} conversation files.`);
            
        } catch (error) {
            console.error('Full index failed:', error);
            throw error;
        }
    }

    /**
     * Stop file monitoring
     */
    stop() {
        // Close all watchers
        for (const [path, watcher] of this.watchers) {
            try {
                watcher.close();
            } catch (error) {
                console.error(`Error closing watcher for ${path}:`, error);
            }
        }

        // Clear pending timeouts
        for (const timeoutId of this.pendingIndexes.values()) {
            clearTimeout(timeoutId);
        }

        this.watchers.clear();
        this.pendingIndexes.clear();
        this.indexingQueue.clear();
        this.isRunning = false;

        // Close database
        this.dbManager.close();

        console.log('FileWatcher stopped');
    }

    /**
     * Get monitoring status
     */
    getStatus() {
        return {
            isRunning: this.isRunning,
            watchedDirectories: Array.from(this.watchers.keys()),
            pendingIndexes: this.pendingIndexes.size,
            activeIndexing: this.indexingQueue.size
        };
    }
}

export default FileWatcher;