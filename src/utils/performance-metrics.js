import { createLogger } from './logger.js';

const logger = createLogger('PerformanceMetrics');

/**
 * Performance metrics collection and analysis for AI Memory App
 * Tracks database queries, search performance, indexing operations
 */

export class PerformanceMetrics {
    constructor(options = {}) {
        this.metrics = new Map();
        this.maxHistorySize = options.maxHistorySize || 1000;
        this.aggregationWindow = options.aggregationWindow || 60000; // 1 minute
        this.startTime = Date.now();
        
        // Initialize metric categories
        this.categories = {
            database: new Map(), // Query execution times
            search: new Map(),   // Search operation metrics
            indexing: new Map(), // File indexing metrics
            system: new Map()    // System performance metrics
        };

        // Initialize counters
        this.counters = {
            totalQueries: 0,
            totalSearches: 0,
            totalIndexOperations: 0,
            totalErrors: 0
        };

        logger.debug('Performance metrics initialized', { maxHistorySize: this.maxHistorySize });
    }

    /**
     * Record database query performance
     */
    recordDatabaseQuery(queryType, executionTime, recordCount = null) {
        const timestamp = Date.now();
        const metric = {
            timestamp,
            type: 'database',
            operation: queryType,
            executionTime,
            recordCount,
            metadata: {}
        };

        this.addMetric('database', metric);
        this.counters.totalQueries++;

        // Log slow queries
        if (executionTime > 100) {
            logger.warn('Slow database query detected', {
                queryType,
                executionTime: `${executionTime}ms`,
                recordCount
            });
        }

        logger.debug('Database query recorded', { queryType, executionTime, recordCount });
    }

    /**
     * Record search operation performance
     */
    recordSearchOperation(searchType, query, executionTime, resultCount, options = {}) {
        const timestamp = Date.now();
        const metric = {
            timestamp,
            type: 'search',
            operation: searchType,
            executionTime,
            resultCount,
            metadata: {
                queryLength: query.length,
                searchMode: options.searchMode || 'unknown',
                limit: options.limit || null,
                hasFilters: !!options.projectFilter || !!options.timeframe
            }
        };

        this.addMetric('search', metric);
        this.counters.totalSearches++;

        // Analyze search performance
        if (executionTime > 500) {
            logger.warn('Slow search operation detected', {
                searchType,
                query: query.substring(0, 50) + (query.length > 50 ? '...' : ''),
                executionTime: `${executionTime}ms`,
                resultCount
            });
        }

        logger.debug('Search operation recorded', { 
            searchType, 
            executionTime, 
            resultCount, 
            queryLength: query.length 
        });
    }

    /**
     * Record file indexing performance
     */
    recordIndexingOperation(operationType, filePath, executionTime, messageCount = null) {
        const timestamp = Date.now();
        const metric = {
            timestamp,
            type: 'indexing',
            operation: operationType,
            executionTime,
            messageCount,
            metadata: {
                fileName: filePath.split('/').pop(),
                fileSize: null // Could be added later
            }
        };

        this.addMetric('indexing', metric);
        this.counters.totalIndexOperations++;

        // Log slow indexing operations
        if (executionTime > 1000) {
            logger.warn('Slow indexing operation detected', {
                operationType,
                filePath: metric.metadata.fileName,
                executionTime: `${executionTime}ms`,
                messageCount
            });
        }

        logger.debug('Indexing operation recorded', { 
            operationType, 
            fileName: metric.metadata.fileName, 
            executionTime, 
            messageCount 
        });
    }

    /**
     * Record system performance metrics
     */
    recordSystemMetrics() {
        const timestamp = Date.now();
        const memUsage = process.memoryUsage();
        
        const metric = {
            timestamp,
            type: 'system',
            operation: 'memory_snapshot',
            executionTime: null,
            metadata: {
                rss: Math.round(memUsage.rss / 1024 / 1024), // MB
                heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024),
                heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024),
                external: Math.round(memUsage.external / 1024 / 1024),
                uptime: timestamp - this.startTime
            }
        };

        this.addMetric('system', metric);
        logger.debug('System metrics recorded', metric.metadata);
    }

    /**
     * Add metric to appropriate category with size management
     */
    addMetric(category, metric) {
        if (!this.categories[category]) {
            this.categories[category] = new Map();
        }

        const categoryMetrics = this.categories[category];
        const key = `${metric.timestamp}_${Math.random()}`;
        
        categoryMetrics.set(key, metric);

        // Manage size by removing oldest entries
        if (categoryMetrics.size > this.maxHistorySize) {
            const oldest = Array.from(categoryMetrics.keys()).sort()[0];
            categoryMetrics.delete(oldest);
        }
    }

    /**
     * Get performance analytics for a category
     */
    getAnalytics(category, timeWindow = this.aggregationWindow) {
        const categoryMetrics = this.categories[category];
        if (!categoryMetrics) {
            return null;
        }

        const now = Date.now();
        const cutoff = now - timeWindow;
        
        // Filter metrics within time window
        const recentMetrics = Array.from(categoryMetrics.values())
            .filter(m => m.timestamp >= cutoff);

        if (recentMetrics.length === 0) {
            return {
                category,
                timeWindow,
                operationCount: 0,
                avgExecutionTime: 0,
                minExecutionTime: 0,
                maxExecutionTime: 0,
                operations: {}
            };
        }

        // Calculate aggregated statistics
        const executionTimes = recentMetrics
            .filter(m => m.executionTime !== null)
            .map(m => m.executionTime);

        const analytics = {
            category,
            timeWindow,
            timeWindowHuman: `${timeWindow / 1000}s`,
            operationCount: recentMetrics.length,
            avgExecutionTime: executionTimes.length > 0 ? 
                Math.round(executionTimes.reduce((a, b) => a + b, 0) / executionTimes.length) : 0,
            minExecutionTime: executionTimes.length > 0 ? Math.min(...executionTimes) : 0,
            maxExecutionTime: executionTimes.length > 0 ? Math.max(...executionTimes) : 0,
            operations: {}
        };

        // Group by operation type
        const operationGroups = {};
        for (const metric of recentMetrics) {
            const op = metric.operation;
            if (!operationGroups[op]) {
                operationGroups[op] = [];
            }
            operationGroups[op].push(metric);
        }

        // Calculate per-operation statistics
        for (const [operation, metrics] of Object.entries(operationGroups)) {
            const opExecutionTimes = metrics
                .filter(m => m.executionTime !== null)
                .map(m => m.executionTime);

            analytics.operations[operation] = {
                count: metrics.length,
                avgExecutionTime: opExecutionTimes.length > 0 ? 
                    Math.round(opExecutionTimes.reduce((a, b) => a + b, 0) / opExecutionTimes.length) : 0,
                minExecutionTime: opExecutionTimes.length > 0 ? Math.min(...opExecutionTimes) : 0,
                maxExecutionTime: opExecutionTimes.length > 0 ? Math.max(...opExecutionTimes) : 0
            };
        }

        return analytics;
    }

    /**
     * Get comprehensive performance report
     */
    getPerformanceReport(timeWindow = this.aggregationWindow) {
        const report = {
            timestamp: new Date().toISOString(),
            timeWindow: timeWindow,
            timeWindowHuman: `${timeWindow / 1000}s`,
            uptime: Date.now() - this.startTime,
            uptimeHuman: this.formatUptime(Date.now() - this.startTime),
            counters: { ...this.counters },
            categories: {}
        };

        // Get analytics for each category
        for (const category of Object.keys(this.categories)) {
            report.categories[category] = this.getAnalytics(category, timeWindow);
        }

        // Calculate performance indicators
        report.performanceIndicators = this.calculatePerformanceIndicators(report);

        return report;
    }

    /**
     * Calculate overall performance indicators
     */
    calculatePerformanceIndicators(report) {
        const indicators = {
            status: 'healthy',
            issues: [],
            recommendations: []
        };

        // Check database performance
        const dbAnalytics = report.categories.database;
        if (dbAnalytics && dbAnalytics.avgExecutionTime > 50) {
            indicators.status = 'warning';
            indicators.issues.push(`Average database query time high: ${dbAnalytics.avgExecutionTime}ms`);
            indicators.recommendations.push('Consider database optimization or indexing improvements');
        }

        // Check search performance
        const searchAnalytics = report.categories.search;
        if (searchAnalytics && searchAnalytics.avgExecutionTime > 200) {
            indicators.status = 'warning';
            indicators.issues.push(`Average search time high: ${searchAnalytics.avgExecutionTime}ms`);
            indicators.recommendations.push('Consider search query optimization or FTS5 tuning');
        }

        // Check system memory
        const systemMetrics = this.categories.system;
        if (systemMetrics.size > 0) {
            const latestMemory = Array.from(systemMetrics.values())
                .sort((a, b) => b.timestamp - a.timestamp)[0];
            
            if (latestMemory && latestMemory.metadata.rss > 512) {
                indicators.status = latestMemory.metadata.rss > 1024 ? 'critical' : 'warning';
                indicators.issues.push(`High memory usage: ${latestMemory.metadata.rss}MB RSS`);
                indicators.recommendations.push('Monitor for memory leaks or optimize data structures');
            }
        }

        return indicators;
    }

    /**
     * Format uptime duration
     */
    formatUptime(ms) {
        const seconds = Math.floor(ms / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);
        const days = Math.floor(hours / 24);

        if (days > 0) {
            return `${days}d ${hours % 24}h ${minutes % 60}m`;
        } else if (hours > 0) {
            return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
        } else if (minutes > 0) {
            return `${minutes}m ${seconds % 60}s`;
        } else {
            return `${seconds}s`;
        }
    }

    /**
     * Clear all metrics
     */
    clearMetrics() {
        for (const category of Object.values(this.categories)) {
            category.clear();
        }
        
        Object.keys(this.counters).forEach(key => {
            this.counters[key] = 0;
        });
        
        logger.info('Performance metrics cleared');
    }

    /**
     * Start automatic system metrics collection
     */
    startSystemMetricsCollection(interval = 30000) {
        if (this.systemMetricsInterval) {
            return; // Already running
        }

        logger.info('Starting automatic system metrics collection', { interval });
        
        this.systemMetricsInterval = setInterval(() => {
            this.recordSystemMetrics();
        }, interval);
    }

    /**
     * Stop automatic system metrics collection
     */
    stopSystemMetricsCollection() {
        if (this.systemMetricsInterval) {
            clearInterval(this.systemMetricsInterval);
            this.systemMetricsInterval = null;
            logger.info('Stopped automatic system metrics collection');
        }
    }
}

export default PerformanceMetrics;