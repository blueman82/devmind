import path from 'path';
import fs from 'fs';
import { createLogger } from './logger.js';

export class PathValidator {
  constructor() {
    this.logger = createLogger('PathValidator');
  }

  validateProjectPath(projectPath) {
    try {
      if (!projectPath || typeof projectPath !== 'string') {
        throw new Error('Project path must be a non-empty string');
      }

      const normalizedPath = path.resolve(projectPath);
      
      if (normalizedPath.includes('..')) {
        throw new Error('Path traversal patterns are not allowed');
      }

      if (normalizedPath.length < 3) {
        throw new Error('Path too short to be valid');
      }

      if (normalizedPath.includes('\0')) {
        throw new Error('Null bytes are not allowed in paths');
      }

      const allowedPatterns = [
        /^\/Users\/[^/]+\/[^/]/,              // macOS user directories
        /^\/home\/[^/]+\/[^/]/,               // Linux user directories  
        /^[A-Za-z]:\\Users\\[^\\]+\\[^\\]/,   // Windows user directories
        /^\/tmp\/[^/]/,                       // Temporary directories
        /^\/var\/tmp\/[^/]/,                  // System temp directories
        /^\/var\/folders\/[^/]+\/[^/]+\/T/    // macOS system temp directories (tmpdir)
      ];

      const isAllowedPath = allowedPatterns.some(pattern => pattern.test(normalizedPath));
      
      if (!isAllowedPath) {
        throw new Error('Path is outside allowed directory patterns');
      }

      try {
        const stats = fs.statSync(normalizedPath);
        if (!stats.isDirectory()) {
          throw new Error('Path must point to a directory');
        }
      } catch (fsError) {
        if (fsError.code === 'ENOENT') {
          throw new Error('Directory does not exist');
        } else if (fsError.code === 'EACCES') {
          throw new Error('Access denied to directory');
        } else {
          throw new Error('Unable to access directory');
        }
      }

      const maxPathLength = 500;
      if (normalizedPath.length > maxPathLength) {
        throw new Error(`Path exceeds maximum length of ${maxPathLength} characters`);
      }

      this.logger.debug('Path validation successful', { 
        originalPath: projectPath,
        normalizedPath,
        pathLength: normalizedPath.length
      });

      return {
        isValid: true,
        normalizedPath,
        originalPath: projectPath
      };

    } catch (error) {
      this.logger.warn('Path validation failed', { 
        projectPath,
        error: error.message,
        stack: error.stack
      });

      return {
        isValid: false,
        error: error.message,
        originalPath: projectPath
      };
    }
  }

  sanitizePath(projectPath) {
    if (!projectPath) return null;
    
    return projectPath
      .replace(/[^\w\s\-_./\\]/g, '')
      .replace(/\.{2,}/g, '')
      .trim();
  }

  isWithinAllowedDirectory(projectPath, allowedParentDirs = []) {
    try {
      const normalizedPath = path.resolve(projectPath);
      
      if (allowedParentDirs.length === 0) {
        return true;
      }

      return allowedParentDirs.some(allowedDir => {
        const normalizedAllowedDir = path.resolve(allowedDir);
        return normalizedPath.startsWith(normalizedAllowedDir + path.sep) || 
               normalizedPath === normalizedAllowedDir;
      });
    } catch (error) {
      this.logger.error('Directory boundary check failed', { 
        projectPath,
        allowedParentDirs,
        error: error.message
      });
      return false;
    }
  }
}

export default new PathValidator();