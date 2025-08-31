import { GitContextHandlers } from './git-context-handlers.js';
import { RestorePointHandlers } from './restore-point-handlers.js';
import { PreviewHandlers } from './preview-handlers.js';
import { RestoreHandlers } from './restore-handlers.js';

/**
 * Git tool handlers coordinator for MCP tools
 * Delegates to specialized handler classes
 */
export class GitToolHandlers {
  /**
   * @param {import('../../database/database-manager.js').default} dbManager - Database manager instance
   */
  constructor(dbManager) {
    this.contextHandlers = new GitContextHandlers(dbManager);
    this.restorePointHandlers = new RestorePointHandlers(dbManager);
    this.previewHandlers = new PreviewHandlers(dbManager);
    this.restoreHandlers = new RestoreHandlers(dbManager);
    this.initialized = false;
  }

  /**
   * Initialize all handler components
   * @returns {Promise<void>}
   */
  async initialize() {
    if (this.initialized) return;
    
    await Promise.all([
      this.contextHandlers.initialize(),
      this.restorePointHandlers.initialize(),
      this.previewHandlers.initialize(),
      this.restoreHandlers.initialize()
    ]);
    
    this.initialized = true;
  }

  /**
   * Handle get_git_context MCP tool request
   * @param {Object} args - Tool arguments
   * @returns {Promise<{content: Array<{type: string, text: string}>}>} MCP response
   */
  async handleGetGitContext(args) {
    return this.contextHandlers.handleGetGitContext(args);
  }

  /**
   * Handle list_restore_points MCP tool request
   * @param {Object} args - Tool arguments
   * @returns {Promise<{content: Array<{type: string, text: string}>}>} MCP response
   */
  async handleListRestorePoints(args) {
    return this.restorePointHandlers.handleListRestorePoints(args);
  }

  /**
   * Handle create_restore_point MCP tool request
   * @param {Object} args - Tool arguments
   * @returns {Promise<{content: Array<{type: string, text: string}>}>} MCP response
   */
  async handleCreateRestorePoint(args) {
    return this.restorePointHandlers.handleCreateRestorePoint(args);
  }

  /**
   * Handle preview_restore MCP tool request
   * @param {Object} args - Tool arguments
   * @returns {Promise<{content: Array<{type: string, text: string}>}>} MCP response
   */
  async handlePreviewRestore(args) {
    return this.previewHandlers.handlePreviewRestore(args);
  }

  /**
   * Handle restore_project_state MCP tool request
   * @param {Object} args - Tool arguments
   * @returns {Promise<{content: Array<{type: string, text: string}>}>} MCP response
   */
  async handleRestoreProjectState(args) {
    return this.restoreHandlers.handleRestoreProjectState(args);
  }
}