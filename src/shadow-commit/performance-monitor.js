/**
 * Performance Monitoring Utility
 * Phase 2c Priority 3 Implementation - Multi-Repository Performance Validation
 */

import { performance } from 'perf_hooks';
import { createLogger } from '../utils/logger.js';
import os from 'os';
import process from 'process';

class PerformanceMonitor {
    constructor(options = {}) {
        this.logger = createLogger('PerformanceMonitor');
        this.metrics = new Map();
        this.timers = new Map();
        this.resourceSnapshots = new Map();
        
        // Configuration
        this.config = {
            sampleInterval: options.sampleInterval || 1000, // 1 second
            maxHistorySize: options.maxHistorySize || 100,
            ...options
        };
        
        // Repository-specific metrics
        this.repositoryMetrics = new Map();
        
        // Global metrics
        this.globalMetrics = {
            startTime: Date.now(),
            totalCommits: 0,
            totalFileChanges: 0,
            totalErrors: 0,
            peakMemoryUsage: 0,
            averageLatency: 0
        };
        
        // Start resource monitoring
        this.startResourceMonitoring();
    }
    
    /**
     * Start timing an operation
     * @param {string} operationId - Unique identifier for the operation
     * @param {Object} metadata - Additional metadata about the operation
     */
    startOperation(operationId, metadata = {}) {
        this.timers.set(operationId, {
            startTime: performance.now(),
            metadata
        });
    }
    
    /**
     * End timing an operation and record metrics
     * @param {string} operationId - Unique identifier for the operation
     * @param {Object} result - Result metadata
     * @returns {number} Operation duration in milliseconds
     */
    endOperation(operationId, result = {}) {
        const timer = this.timers.get(operationId);
        if (!timer) {
            this.logger.warn('No timer found for operation', { operationId });
            return 0;
        }
        
        const duration = performance.now() - timer.startTime;
        this.timers.delete(operationId);
        
        // Record the metric
        const metric = {
            operationId,
            duration,
            timestamp: Date.now(),
            metadata: timer.metadata,
            result,
            success: result.error === undefined
        };
        
        // Store in history
        if (!this.metrics.has(timer.metadata.type || 'general')) {
            this.metrics.set(timer.metadata.type || 'general', []);
        }
        
        const history = this.metrics.get(timer.metadata.type || 'general');
        history.push(metric);
        
        // Maintain max history size
        if (history.length > this.config.maxHistorySize) {
            history.shift();
        }
        
        // Update repository-specific metrics if applicable
        if (timer.metadata.repository) {
            this.updateRepositoryMetrics(timer.metadata.repository, metric);
        }
        
        // Update global metrics
        this.updateGlobalMetrics(metric);
        
        return duration;
    }
    
    /**
     * Update repository-specific metrics
     * @param {string} repoPath - Repository path
     * @param {Object} metric - Metric data
     */
    updateRepositoryMetrics(repoPath, metric) {
        if (!this.repositoryMetrics.has(repoPath)) {
            this.repositoryMetrics.set(repoPath, {
                totalCommits: 0,
                totalFileChanges: 0,
                totalErrors: 0,
                averageLatency: 0,
                peakLatency: 0,
                memoryUsage: 0,
                lastActivity: Date.now()
            });
        }
        
        const repoMetrics = this.repositoryMetrics.get(repoPath);
        
        if (metric.metadata.type === 'commit') {
            repoMetrics.totalCommits++;
        } else if (metric.metadata.type === 'file-change') {
            repoMetrics.totalFileChanges++;
        }
        
        if (!metric.success) {
            repoMetrics.totalErrors++;
        }
        
        // Update latency metrics
        const latencies = this.getLatenciesForRepository(repoPath);
        repoMetrics.averageLatency = latencies.reduce((a, b) => a + b, 0) / latencies.length;
        repoMetrics.peakLatency = Math.max(repoMetrics.peakLatency, metric.duration);
        repoMetrics.lastActivity = Date.now();
    }
    
    /**
     * Get latencies for a specific repository
     * @param {string} repoPath - Repository path
     * @returns {Array<number>} Array of latencies
     */
    getLatenciesForRepository(repoPath) {
        const latencies = [];
        for (const [, metrics] of this.metrics) {
            const repoMetrics = metrics.filter(m => m.metadata.repository === repoPath);
            latencies.push(...repoMetrics.map(m => m.duration));
        }
        return latencies;
    }
    
    /**
     * Update global metrics
     * @param {Object} metric - Metric data
     */
    updateGlobalMetrics(metric) {
        if (metric.metadata.type === 'commit') {
            this.globalMetrics.totalCommits++;
        } else if (metric.metadata.type === 'file-change') {
            this.globalMetrics.totalFileChanges++;
        }
        
        if (!metric.success) {
            this.globalMetrics.totalErrors++;
        }
        
        // Update average latency
        const allLatencies = [];
        for (const [, metrics] of this.metrics) {
            allLatencies.push(...metrics.map(m => m.duration));
        }
        
        if (allLatencies.length > 0) {
            this.globalMetrics.averageLatency = 
                allLatencies.reduce((a, b) => a + b, 0) / allLatencies.length;
        }
    }
    
    /**
     * Start monitoring system resources
     */
    startResourceMonitoring() {
        this.resourceInterval = setInterval(() => {
            const snapshot = this.captureResourceSnapshot();
            this.resourceSnapshots.set(Date.now(), snapshot);
            
            // Update peak memory usage
            this.globalMetrics.peakMemoryUsage = Math.max(
                this.globalMetrics.peakMemoryUsage,
                snapshot.memoryUsage
            );
            
            // Clean old snapshots
            const cutoff = Date.now() - (this.config.maxHistorySize * this.config.sampleInterval);
            for (const [timestamp] of this.resourceSnapshots) {
                if (timestamp < cutoff) {
                    this.resourceSnapshots.delete(timestamp);
                }
            }
        }, this.config.sampleInterval);
    }
    
    /**
     * Capture current resource snapshot
     * @returns {Object} Resource snapshot
     */
    captureResourceSnapshot() {
        const memUsage = process.memoryUsage();
        
        return {
            timestamp: Date.now(),
            memoryUsage: memUsage.heapUsed / 1024 / 1024, // MB
            memoryTotal: memUsage.heapTotal / 1024 / 1024, // MB
            memoryExternal: memUsage.external / 1024 / 1024, // MB
            cpuUsage: process.cpuUsage(),
            systemMemory: {
                free: os.freemem() / 1024 / 1024, // MB
                total: os.totalmem() / 1024 / 1024, // MB
                used: (os.totalmem() - os.freemem()) / 1024 / 1024 // MB
            }
        };
    }
    
    /**
     * Get performance report
     * @returns {Object} Performance report
     */
    getReport() {
        const report = {
            global: {
                ...this.globalMetrics,
                uptime: Date.now() - this.globalMetrics.startTime,
                currentMemoryUsage: process.memoryUsage().heapUsed / 1024 / 1024,
                activeRepositories: this.repositoryMetrics.size
            },
            repositories: {},
            operations: {},
            performance: {
                averageCommitLatency: 0,
                p95CommitLatency: 0,
                p99CommitLatency: 0,
                memoryPerRepository: 0
            }
        };
        
        // Repository-specific metrics
        for (const [repo, metrics] of this.repositoryMetrics) {
            report.repositories[repo] = { ...metrics };
        }
        
        // Operation-specific metrics
        for (const [type, metrics] of this.metrics) {
            const latencies = metrics.map(m => m.duration);
            latencies.sort((a, b) => a - b);
            
            report.operations[type] = {
                count: metrics.length,
                averageLatency: latencies.reduce((a, b) => a + b, 0) / latencies.length,
                minLatency: Math.min(...latencies),
                maxLatency: Math.max(...latencies),
                p50Latency: this.percentile(latencies, 50),
                p95Latency: this.percentile(latencies, 95),
                p99Latency: this.percentile(latencies, 99),
                errorRate: metrics.filter(m => !m.success).length / metrics.length
            };
        }
        
        // Calculate performance metrics
        const commitMetrics = this.metrics.get('commit') || [];
        if (commitMetrics.length > 0) {
            const commitLatencies = commitMetrics.map(m => m.duration);
            commitLatencies.sort((a, b) => a - b);
            report.performance.averageCommitLatency = 
                commitLatencies.reduce((a, b) => a + b, 0) / commitLatencies.length;
            report.performance.p95CommitLatency = this.percentile(commitLatencies, 95);
            report.performance.p99CommitLatency = this.percentile(commitLatencies, 99);
        }
        
        // Memory per repository
        if (this.repositoryMetrics.size > 0) {
            report.performance.memoryPerRepository = 
                report.global.currentMemoryUsage / this.repositoryMetrics.size;
        }
        
        return report;
    }
    
    /**
     * Calculate percentile value
     * @param {Array<number>} sortedArray - Sorted array of numbers
     * @param {number} percentile - Percentile to calculate (0-100)
     * @returns {number} Percentile value
     */
    percentile(sortedArray, percentile) {
        if (sortedArray.length === 0) return 0;
        const index = Math.ceil((percentile / 100) * sortedArray.length) - 1;
        return sortedArray[Math.max(0, index)];
    }
    
    /**
     * Check if performance meets targets
     * @returns {Object} Performance validation results
     */
    validatePerformance() {
        const report = this.getReport();
        
        return {
            meetsLatencyTarget: report.performance.averageCommitLatency < 100, // < 100ms
            meetsMemoryTarget: report.performance.memoryPerRepository < 50, // < 50MB per repo
            meetsP95Target: report.performance.p95CommitLatency < 150, // < 150ms for p95
            globalMetrics: {
                averageLatency: report.performance.averageCommitLatency,
                memoryPerRepo: report.performance.memoryPerRepository,
                p95Latency: report.performance.p95CommitLatency,
                totalErrors: report.global.totalErrors,
                errorRate: report.global.totalErrors / (report.global.totalCommits || 1)
            },
            passed: report.performance.averageCommitLatency < 100 && 
                    report.performance.memoryPerRepository < 50
        };
    }
    
    /**
     * Stop resource monitoring
     */
    stop() {
        if (this.resourceInterval) {
            clearInterval(this.resourceInterval);
            this.resourceInterval = null;
        }
        
        this.logger.info('Performance monitoring stopped', {
            report: this.getReport()
        });
    }
    
    /**
     * Reset all metrics
     */
    reset() {
        this.metrics.clear();
        this.timers.clear();
        this.resourceSnapshots.clear();
        this.repositoryMetrics.clear();
        
        this.globalMetrics = {
            startTime: Date.now(),
            totalCommits: 0,
            totalFileChanges: 0,
            totalErrors: 0,
            peakMemoryUsage: 0,
            averageLatency: 0
        };
        
        this.logger.info('Performance metrics reset');
    }
}

export default PerformanceMonitor;