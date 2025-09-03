/**
 * Enhanced Error Handling & Recovery System
 * Phase 2c Priority 2 Implementation - AI Memory App
 */

import { createLogger } from '../utils/logger.js';
import { EventEmitter } from 'events';

class ErrorHandler extends EventEmitter {
    constructor(options = {}) {
        super();
        this.logger = createLogger('ErrorHandler');
        this.retryAttempts = new Map(); // Track retry attempts per operation
        this.maxRetries = options.maxRetries || 3;
        this.baseDelay = options.baseDelay || 1000; // 1 second base delay
        this.maxDelay = options.maxDelay || 30000; // 30 seconds max delay
        this.notificationCallback = options.notificationCallback || null;
    }

    /**
     * Comprehensive error classification
     * @param {Error} error - The error to classify
     * @param {Object} context - Additional context about the error
     * @returns {Object} Error classification
     */
    classifyError(error, context = {}) {
        const classification = {
            type: 'unknown',
            severity: 'medium',
            recoverable: true,
            requiresUserAction: false,
            category: 'system',
            message: error.message,
            code: error.code,
            context
        };

        // Git operation errors
        if (context.operation?.startsWith('git')) {
            classification.category = 'git';
            
            if (error.message.includes('SPAWN EBADF') || error.code === 'EBADF') {
                classification.type = 'git_spawn_error';
                classification.severity = 'high';
                classification.recoverable = true;
                classification.description = 'Git command execution failed - process communication error';
            } else if (error.message.includes('not a git repository')) {
                classification.type = 'git_invalid_repo';
                classification.severity = 'medium';
                classification.recoverable = false;
                classification.requiresUserAction = true;
                classification.description = 'Directory is not a valid git repository';
            } else if (error.message.includes('uncommitted changes')) {
                classification.type = 'git_dirty_state';
                classification.severity = 'low';
                classification.recoverable = true;
                classification.description = 'Repository has uncommitted changes blocking operation';
            } else if (error.message.includes('branch already exists')) {
                classification.type = 'git_branch_exists';
                classification.severity = 'low';
                classification.recoverable = true;
                classification.description = 'Shadow branch already exists';
            }
        }

        // File system errors
        else if (error.code?.startsWith('E')) {
            classification.category = 'filesystem';
            
            switch (error.code) {
                case 'ENOENT':
                    classification.type = 'file_not_found';
                    classification.severity = 'medium';
                    classification.recoverable = true;
                    classification.description = 'File or directory not found';
                    break;
                case 'EACCES':
                case 'EPERM':
                    classification.type = 'permission_denied';
                    classification.severity = 'high';
                    classification.recoverable = false;
                    classification.requiresUserAction = true;
                    classification.description = 'Insufficient permissions to access file/directory';
                    break;
                case 'EMFILE':
                case 'ENFILE':
                    classification.type = 'resource_limit';
                    classification.severity = 'high';
                    classification.recoverable = true;
                    classification.description = 'System resource limit reached (file handles)';
                    break;
                case 'ENOSPC':
                    classification.type = 'disk_full';
                    classification.severity = 'critical';
                    classification.recoverable = false;
                    classification.requiresUserAction = true;
                    classification.description = 'Insufficient disk space';
                    break;
            }
        }

        // Database errors
        else if (context.operation?.startsWith('db') || error.message.includes('database')) {
            classification.category = 'database';
            
            if (error.message.includes('SQLITE_BUSY') || error.message.includes('database is locked')) {
                classification.type = 'db_locked';
                classification.severity = 'medium';
                classification.recoverable = true;
                classification.description = 'Database is temporarily locked by another process';
            } else if (error.message.includes('no such table')) {
                classification.type = 'db_schema_error';
                classification.severity = 'critical';
                classification.recoverable = true;
                classification.description = 'Database schema is missing or corrupted';
            } else if (error.message.includes('disk I/O error')) {
                classification.type = 'db_io_error';
                classification.severity = 'critical';
                classification.recoverable = false;
                classification.requiresUserAction = true;
                classification.description = 'Database disk I/O error - possible hardware issue';
            }
        }

        // Network/Service errors
        else if (context.service || error.message.includes('connect') || error.code === 'ECONNREFUSED') {
            classification.category = 'service';
            classification.type = 'service_unavailable';
            classification.severity = 'high';
            classification.recoverable = true;
            classification.description = 'Service connection failed or unavailable';
        }

        // Memory/Resource errors
        else if (error.message.includes('out of memory') || error.code === 'ENOMEM') {
            classification.category = 'resource';
            classification.type = 'memory_exhausted';
            classification.severity = 'critical';
            classification.recoverable = true;
            classification.description = 'System memory exhausted';
        }

        return classification;
    }

    /**
     * Execute operation with retry logic and exponential backoff
     * @param {Function} operation - The operation to execute
     * @param {Object} options - Retry options
     * @returns {Promise<*>} Operation result
     */
    async executeWithRetry(operation, options = {}) {
        const operationId = options.operationId || `${operation.name}-${Date.now()}`;
        const maxRetries = options.maxRetries || this.maxRetries;
        const baseDelay = options.baseDelay || this.baseDelay;
        
        let attempt = 0;
        let lastError;

        while (attempt <= maxRetries) {
            try {
                // Reset retry counter on success
                if (attempt > 0) {
                    this.retryAttempts.delete(operationId);
                    this.logger.info('Operation succeeded after retry', {
                        operationId,
                        attempt,
                        totalAttempts: attempt + 1
                    });
                }

                return await operation();
            } catch (error) {
                lastError = error;
                attempt++;

                const classification = this.classifyError(error, options.context || {});
                
                this.logger.warn('Operation failed', {
                    operationId,
                    attempt,
                    maxRetries,
                    error: {
                        message: error.message,
                        code: error.code,
                        classification
                    }
                });

                // Don't retry if error is not recoverable
                if (!classification.recoverable) {
                    this.logger.error('Non-recoverable error - aborting retry', {
                        operationId,
                        classification
                    });
                    break;
                }

                // Don't retry if we've exceeded max attempts
                if (attempt > maxRetries) {
                    this.logger.error('Max retry attempts exceeded', {
                        operationId,
                        attempt,
                        maxRetries
                    });
                    break;
                }

                // Calculate exponential backoff delay
                const delay = Math.min(
                    baseDelay * Math.pow(2, attempt - 1),
                    this.maxDelay
                );

                // Add jitter to prevent thundering herd
                const jitteredDelay = delay + (Math.random() * 1000);

                this.logger.info('Retrying operation after delay', {
                    operationId,
                    attempt,
                    delay: jitteredDelay,
                    nextAttempt: attempt + 1
                });

                // Track retry attempt
                this.retryAttempts.set(operationId, {
                    attempts: attempt,
                    lastError: classification,
                    nextRetry: Date.now() + jitteredDelay
                });

                // Wait before retry
                await this.sleep(jitteredDelay);
            }
        }

        // All retries exhausted
        const classification = this.classifyError(lastError, options.context || {});
        await this.handleFailedOperation(operationId, classification, attempt);
        throw lastError;
    }

    /**
     * Handle permanently failed operations
     * @param {string} operationId - Operation identifier
     * @param {Object} classification - Error classification
     * @param {number} attempts - Number of attempts made
     */
    async handleFailedOperation(operationId, classification, attempts) {
        this.logger.error('Operation permanently failed', {
            operationId,
            attempts,
            classification
        });

        // Emit failure event for monitoring
        this.emit('operation-failed', {
            operationId,
            classification,
            attempts,
            timestamp: new Date().toISOString()
        });

        // Send user notification if configured and error requires user action
        if (this.notificationCallback && classification.requiresUserAction) {
            await this.notificationCallback({
                title: 'Auto-Commit Error',
                body: `${classification.description}\n\nOperation: ${operationId}`,
                severity: classification.severity,
                requiresAction: true
            });
        }

        // Record failure metrics
        this.recordFailureMetrics(operationId, classification, attempts);
    }

    /**
     * Get current retry status for all operations
     * @returns {Object} Retry status summary
     */
    getRetryStatus() {
        const status = {
            activeRetries: this.retryAttempts.size,
            operations: []
        };

        for (const [operationId, retryInfo] of this.retryAttempts.entries()) {
            status.operations.push({
                operationId,
                attempts: retryInfo.attempts,
                lastError: retryInfo.lastError,
                nextRetry: new Date(retryInfo.nextRetry).toISOString(),
                timeUntilNextRetry: Math.max(0, retryInfo.nextRetry - Date.now())
            });
        }

        return status;
    }

    /**
     * Record failure metrics for monitoring
     * @param {string} operationId - Operation identifier
     * @param {Object} classification - Error classification
     * @param {number} attempts - Number of attempts made
     */
    recordFailureMetrics(operationId, classification, attempts) {
        // This could integrate with a metrics system like Prometheus
        // For now, we'll emit events that can be collected
        this.emit('metrics', {
            type: 'operation_failure',
            operationId,
            category: classification.category,
            errorType: classification.type,
            severity: classification.severity,
            attempts,
            recoverable: classification.recoverable,
            requiresUserAction: classification.requiresUserAction,
            timestamp: Date.now()
        });
    }

    /**
     * Sleep for specified duration
     * @param {number} ms - Milliseconds to sleep
     * @returns {Promise<void>}
     */
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Graceful shutdown - wait for pending retries
     * @param {number} timeout - Maximum time to wait for retries
     * @returns {Promise<boolean>} Whether shutdown completed cleanly
     */
    async gracefulShutdown(timeout = 30000) {
        const startTime = Date.now();
        
        this.logger.info('Starting graceful shutdown', {
            pendingRetries: this.retryAttempts.size,
            timeout
        });

        while (this.retryAttempts.size > 0 && (Date.now() - startTime) < timeout) {
            this.logger.debug('Waiting for pending retries to complete', {
                remaining: this.retryAttempts.size,
                elapsed: Date.now() - startTime
            });
            await this.sleep(1000);
        }

        const cleanShutdown = this.retryAttempts.size === 0;
        
        if (!cleanShutdown) {
            this.logger.warn('Forceful shutdown - some retries may be incomplete', {
                abandonedRetries: this.retryAttempts.size
            });
        }

        return cleanShutdown;
    }
}

export default ErrorHandler;