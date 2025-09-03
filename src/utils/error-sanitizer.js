import { createLogger } from './logger.js';

export class ErrorSanitizer {
  constructor() {
    this.logger = createLogger('ErrorSanitizer');
    
    this.sensitivePatterns = [
      /\/Users\/[^/\s]+/g,                    // macOS user paths
      /\/home\/[^/\s]+/g,                     // Linux user paths  
      /[A-Z]:\\Users\\[^\\/\s]+/g,            // Windows user paths
      /\/[a-zA-Z0-9_-]+@[a-zA-Z0-9.-]+/g,     // Email-like patterns in paths
      /([a-zA-Z]:[\\/])/g,                   // Drive letters
      /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g, // IP addresses
      /[a-f0-9]{32,}/gi,                      // Long hex strings (hashes, keys)
      /password[=:\s]+[^\s]*/gi,              // Password values
      /token[=:\s]+[^\s]*/gi,                 // Token values
      /key[=:\s]+[^\s]*/gi,                   // Key values
      /secret[=:\s]+[^\s]*/gi                 // Secret values
    ];
    
    this.replacementPatterns = {
      userPaths: '[USER_PATH]',
      ipAddresses: '[IP_ADDRESS]', 
      longHex: '[HASH_OR_KEY]',
      credentials: '[CREDENTIAL]'
    };
  }

  sanitizeError(error, context = {}) {
    try {
      if (!error) return 'Unknown error occurred';
      
      const errorMessage = typeof error === 'string' ? error : error.message || error.toString();
      let sanitizedMessage = errorMessage;
      
      sanitizedMessage = sanitizedMessage.replace(this.sensitivePatterns[0], this.replacementPatterns.userPaths);
      sanitizedMessage = sanitizedMessage.replace(this.sensitivePatterns[1], this.replacementPatterns.userPaths);
      sanitizedMessage = sanitizedMessage.replace(this.sensitivePatterns[2], this.replacementPatterns.userPaths);
      sanitizedMessage = sanitizedMessage.replace(this.sensitivePatterns[3], '[EMAIL_PATH]');
      sanitizedMessage = sanitizedMessage.replace(this.sensitivePatterns[4], '[DRIVE]:');
      sanitizedMessage = sanitizedMessage.replace(this.sensitivePatterns[5], this.replacementPatterns.ipAddresses);
      sanitizedMessage = sanitizedMessage.replace(this.sensitivePatterns[6], this.replacementPatterns.longHex);
      sanitizedMessage = sanitizedMessage.replace(this.sensitivePatterns[7], 'password=[HIDDEN]');
      sanitizedMessage = sanitizedMessage.replace(this.sensitivePatterns[8], 'token=[HIDDEN]');
      sanitizedMessage = sanitizedMessage.replace(this.sensitivePatterns[9], 'key=[HIDDEN]');
      sanitizedMessage = sanitizedMessage.replace(this.sensitivePatterns[10], 'secret=[HIDDEN]');
      
      const sanitizedLength = sanitizedMessage.length;
      const originalLength = errorMessage.length;
      const wasModified = sanitizedLength !== originalLength || sanitizedMessage !== errorMessage;
      
      if (wasModified) {
        this.logger.debug('Error message sanitized', {
          originalLength,
          sanitizedLength,
          context: context.operation || 'unknown',
          patternsMatched: originalLength - sanitizedLength > 0
        });
      }
      
      return sanitizedMessage;
      
    } catch (sanitizationError) {
      this.logger.error('Error sanitization failed', {
        sanitizationError: sanitizationError.message,
        context
      });
      return 'Error processing failed - details hidden for security';
    }
  }

  sanitizeGitError(gitError, operation = 'git_operation') {
    const sanitized = this.sanitizeError(gitError, { operation });
    
    const gitErrorMappings = {
      'not a git repository': 'Directory is not a git repository',
      'No such remote': 'Git remote not configured',
      'permission denied': 'Access denied to git repository',
      'command not found': 'Git command execution failed',
      'timeout': 'Git operation timed out',
      'fatal:': 'Git operation failed'
    };
    
    let mappedError = sanitized;
    Object.entries(gitErrorMappings).forEach(([pattern, replacement]) => {
      if (sanitized.toLowerCase().includes(pattern.toLowerCase())) {
        mappedError = replacement;
      }
    });
    
    return mappedError;
  }

  sanitizePathError(pathError, operation = 'path_operation') {
    const sanitized = this.sanitizeError(pathError, { operation });
    
    const pathErrorMappings = {
      'ENOENT': 'File or directory not found',
      'EACCES': 'Access denied', 
      'EPERM': 'Operation not permitted',
      'ENOTDIR': 'Path component is not a directory',
      'EISDIR': 'Expected file but found directory',
      'EMFILE': 'Too many open files',
      'ENAMETOOLONG': 'Path name too long'
    };
    
    let mappedError = sanitized;
    Object.entries(pathErrorMappings).forEach(([code, message]) => {
      if (sanitized.includes(code)) {
        mappedError = message;
      }
    });
    
    return mappedError;
  }

  createSafeErrorResponse(error, operation = 'operation', includeDetails = false) {
    const sanitizedMessage = this.sanitizeError(error, { operation });
    
    const response = {
      error: true,
      message: sanitizedMessage,
      operation,
      timestamp: new Date().toISOString()
    };
    
    if (includeDetails && process.env.NODE_ENV === 'development') {
      response.details = {
        originalError: typeof error === 'string' ? error : error.message,
        stack: error.stack ? this.sanitizeError(error.stack, { operation: 'stack_trace' }) : null
      };
    }
    
    return response;
  }
}

export default new ErrorSanitizer();