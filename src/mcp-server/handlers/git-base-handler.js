import GitManager from '../../git/git-manager.js';
import GitSchema from '../../database/git-schema.js';
import { createLogger } from '../../utils/logger.js';
import pathValidator from '../../utils/path-validator.js';
import errorSanitizer from '../../utils/error-sanitizer.js';

/**
 * Base class for Git MCP tool handlers
 * Provides common initialization and utility methods
 */
export class GitBaseHandler {
  /**
   * @param {import('../../database/database-manager.js').default} dbManager - Database manager instance
   */
  constructor(dbManager) {
    this.dbManager = dbManager;
    this.gitManager = new GitManager();
    this.logger = createLogger('GitBaseHandler');
    this.initialized = false;
  }

  /**
   * Initialize the git tool handlers
   * @returns {Promise<void>}
   */
  async initialize() {
    if (this.initialized) return;
    
    try {
      // Use the git schema from the database manager (already initialized)
      if (!this.dbManager.gitSchema) {
        throw new Error('Database manager git schema not initialized');
      }
      this.gitSchema = this.dbManager.gitSchema;
      this.initialized = true;
      this.logger.info('Git base handler initialized');
    } catch (error) {
      this.logger.error('Failed to initialize git base handler', {
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  /**
   * Validate and normalize project path
   * @param {string} projectPath - Raw project path
   * @returns {{isValid: boolean, normalizedPath?: string, error?: string}}
   */
  validateProjectPath(projectPath) {
    if (!projectPath) {
      return { isValid: false, error: 'project_path is required' };
    }

    const pathValidation = pathValidator.validateProjectPath(projectPath);
    if (!pathValidation.isValid) {
      this.logger.error('Path validation failed', {
        originalPath: projectPath,
        error: pathValidation.error
      });
      return { isValid: false, error: `Invalid project path - ${pathValidation.error}` };
    }

    return { isValid: true, normalizedPath: pathValidation.normalizedPath };
  }

  /**
   * Ensure database is initialized
   * @returns {Promise<void>}
   */
  async ensureDatabaseInitialized() {
    if (!this.dbManager.isInitialized) {
      await this.dbManager.initialize();
    }
    await this.initialize();
  }

  /**
   * Create error response for MCP tools
   * @param {string} message - Error message
   * @returns {{content: Array<{type: string, text: string}>}}
   */
  createErrorResponse(message) {
    return {
      content: [{
        type: 'text',
        text: `Error: ${message}`
      }]
    };
  }

  /**
   * Create success response for MCP tools
   * @param {string} text - Response text
   * @returns {{content: Array<{type: string, text: string}>}}
   */
  createSuccessResponse(text) {
    return {
      content: [{
        type: 'text',
        text: text
      }]
    };
  }
}