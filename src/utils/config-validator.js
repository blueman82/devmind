import { promises as fs } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import { createLogger } from './logger.js';

const logger = createLogger('ConfigValidator');

/**
 * Configuration validation for AI Memory App
 * Validates environment variables, paths, and startup requirements
 */

export class ConfigValidator {
    constructor() {
        this.requiredPaths = [
            join(homedir(), '.claude'),
            join(homedir(), '.claude', 'ai-memory'),
            join(homedir(), '.claude', 'ai-memory', 'logs')
        ];
        
        this.optionalPaths = [
            join(homedir(), '.claude', 'projects')
        ];
    }

    /**
     * Validate all configuration requirements
     */
    async validate() {
        const results = {
            valid: true,
            errors: [],
            warnings: [],
            info: []
        };

        try {
            // Validate environment variables
            this.validateEnvironment(results);
            
            // Validate file system paths
            await this.validatePaths(results);
            
            // Validate database requirements
            await this.validateDatabase(results);
            
            // Log results
            this.logResults(results);
            
            return results;
            
        } catch (error) {
            logger.error('Configuration validation failed', { error: error.message, stack: error.stack });
            results.valid = false;
            results.errors.push(`Validation process failed: ${error.message}`);
            return results;
        }
    }

    /**
     * Validate environment variables
     */
    validateEnvironment(results) {
        const requiredEnvVars = [];
        const optionalEnvVars = [
            { name: 'LOG_LEVEL', default: 'info', description: 'Logging level (error, warn, info, debug)' },
            { name: 'DB_PATH', default: '~/.claude/ai-memory/conversations.db', description: 'SQLite database path' }
        ];

        // Check required environment variables
        for (const envVar of requiredEnvVars) {
            if (!process.env[envVar]) {
                results.valid = false;
                results.errors.push(`Required environment variable missing: ${envVar}`);
            }
        }

        // Report optional environment variables
        for (const envVar of optionalEnvVars) {
            const value = process.env[envVar.name];
            if (value) {
                results.info.push(`${envVar.name} = ${value}`);
                logger.debug('Environment variable set', { name: envVar.name, value });
            } else {
                results.info.push(`${envVar.name} = ${envVar.default} (default)`);
                logger.debug('Using default environment value', { name: envVar.name, default: envVar.default });
            }
        }
    }

    /**
     * Validate file system paths
     */
    async validatePaths(results) {
        // Create and validate required paths
        for (const path of this.requiredPaths) {
            try {
                await fs.mkdir(path, { recursive: true });
                await fs.access(path);
                results.info.push(`Required path exists: ${path}`);
                logger.debug('Required path validated', { path });
            } catch {
                results.valid = false;
                results.errors.push(`Cannot access required path: ${path}`);
                logger.error('Required path validation failed', { path, error: error.message });
            }
        }

        // Check optional paths
        for (const path of this.optionalPaths) {
            try {
                await fs.access(path);
                results.info.push(`Optional path exists: ${path}`);
                logger.debug('Optional path found', { path });
            } catch {
                results.warnings.push(`Optional path not found: ${path} (will be created when needed)`);
                logger.debug('Optional path not found', { path, note: 'will be created when needed' });
            }
        }
    }

    /**
     * Validate database requirements
     */
    async validateDatabase(results) {
        try {
            // Check if better-sqlite3 can be imported
            await import('better-sqlite3');
            results.info.push('Database library (better-sqlite3) available');
            logger.debug('Database library validated');
            
        } catch (error) {
            results.valid = false;
            results.errors.push(`Database library not available: ${error.message}`);
            logger.error('Database library validation failed', { error: error.message });
        }

        // Check database directory write permissions
        const dbDir = join(homedir(), '.claude', 'ai-memory');
        try {
            const testFile = join(dbDir, '.test-write');
            await fs.writeFile(testFile, 'test');
            await fs.unlink(testFile);
            results.info.push('Database directory writable');
            logger.debug('Database directory write permissions validated', { dbDir });
        } catch (error) {
            results.valid = false;
            results.errors.push(`Database directory not writable: ${dbDir} - ${error.message}`);
            logger.error('Database directory write validation failed', { dbDir, error: error.message });
        }
    }

    /**
     * Log validation results
     */
    logResults(results) {
        if (results.valid) {
            logger.info('Configuration validation passed', {
                errors: results.errors.length,
                warnings: results.warnings.length,
                info: results.info.length
            });
        } else {
            logger.error('Configuration validation failed', {
                errors: results.errors.length,
                warnings: results.warnings.length
            });
        }

        // Log individual messages at appropriate levels
        results.errors.forEach(error => logger.error('Config Error', { message: error }));
        results.warnings.forEach(warning => logger.warn('Config Warning', { message: warning }));
        results.info.forEach(info => logger.debug('Config Info', { message: info }));
    }

    /**
     * Validate configuration and exit on failure
     */
    async validateOrExit() {
        const results = await this.validate();
        
        if (!results.valid) {
            console.error('❌ Configuration validation failed:');
            results.errors.forEach(error => console.error(`  - ${error}`));
            
            if (results.warnings.length > 0) {
                console.warn('⚠️  Warnings:');
                results.warnings.forEach(warning => console.warn(`  - ${warning}`));
            }
            
            logger.error('Application startup aborted due to configuration errors');
            process.exit(1);
        }
        
        if (results.warnings.length > 0) {
            console.warn('⚠️  Configuration warnings:');
            results.warnings.forEach(warning => console.warn(`  - ${warning}`));
        }
        
        console.log('✅ Configuration validation passed');
        logger.info('Application startup validation successful');
        
        return results;
    }
}

export default ConfigValidator;