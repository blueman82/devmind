import winston from 'winston';
import { join } from 'path';
import { homedir } from 'os';

/**
 * Structured logging configuration for AI Memory App
 * Provides consistent logging across all components
 */

const logDir = join(homedir(), '.claude', 'ai-memory', 'logs');

// Define log levels and colors
const logLevels = {
    error: 0,
    warn: 1,
    info: 2,
    debug: 3
};

const logColors = {
    error: 'red',
    warn: 'yellow', 
    info: 'green',
    debug: 'blue'
};

winston.addColors(logColors);

// Custom format for console output
const consoleFormat = winston.format.combine(
    winston.format.colorize({ all: true }),
    winston.format.timestamp({ format: 'HH:mm:ss' }),
    winston.format.printf(({ timestamp, level, message, component, ...meta }) => {
        let logLine = `${timestamp} [${level}]`;
        if (component) {
            logLine += ` [${component}]`;
        }
        logLine += `: ${message}`;
        
        // Add metadata if present
        if (Object.keys(meta).length > 0) {
            logLine += ` ${JSON.stringify(meta)}`;
        }
        
        return logLine;
    })
);

// Create logger instance
const logger = winston.createLogger({
    levels: logLevels,
    level: process.env.LOG_LEVEL || 'info',
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.json()
    ),
    transports: [
        // Console transport with colors
        new winston.transports.Console({
            format: consoleFormat
        }),
        
        // File transport for errors
        new winston.transports.File({
            filename: join(logDir, 'error.log'),
            level: 'error',
            maxsize: 5242880, // 5MB
            maxFiles: 5
        }),
        
        // File transport for all logs
        new winston.transports.File({
            filename: join(logDir, 'combined.log'),
            maxsize: 5242880, // 5MB
            maxFiles: 5
        })
    ]
});

/**
 * Create component-specific logger
 */
export function createLogger(component) {
    return {
        error: (message, meta = {}) => logger.error(message, { component, ...meta }),
        warn: (message, meta = {}) => logger.warn(message, { component, ...meta }),
        info: (message, meta = {}) => logger.info(message, { component, ...meta }),
        debug: (message, meta = {}) => logger.debug(message, { component, ...meta })
    };
}

export default logger;