import GitManager from '../../git/git-manager.js';
import GitSchema from '../../database/git-schema.js';
import { createLogger } from '../../utils/logger.js';
import pathValidator from '../../utils/path-validator.js';
import errorSanitizer from '../../utils/error-sanitizer.js';

export class GitToolHandlers {
  /**
   * @param {import('../../database/database-manager.js').default} dbManager - Database manager instance
   */
  constructor(dbManager) {
    this.dbManager = dbManager;
    this.gitManager = new GitManager();
    this.logger = createLogger('GitToolHandlers');
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
      this.logger.info('Git tool handlers initialized');
    } catch (error) {
      this.logger.error('Failed to initialize git tool handlers', {
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  /**
   * Handle get_git_context MCP tool request
   * @param {Object} args - Tool arguments
   * @param {string} args.project_path - Path to the project directory
   * @param {string} [args.conversation_id] - Optional conversation ID for linking
   * @param {boolean} [args.include_commit_history=true] - Include commit history
   * @param {boolean} [args.include_working_status=true] - Include working directory status
   * @param {number} [args.commit_limit=20] - Maximum number of commits to return
   * @param {string} [args.time_range] - Time range for filtering commits
   * @returns {Promise<{content: Array<{type: string, text: string}>}>} MCP response
   */
  async handleGetGitContext(args) {
    try {
      // Ensure database is initialized first
      if (!this.dbManager.isInitialized) {
        await this.dbManager.initialize();
      }
      
      await this.initialize();

      const {
        project_path,
        conversation_id = null,
        include_commit_history = true,
        include_working_status = true,
        commit_limit = 20,
        time_range = null
      } = args;

      if (!project_path) {
        return {
          content: [{
            type: 'text',
            text: 'Error: project_path is required'
          }]
        };
      }

      const pathValidation = pathValidator.validateProjectPath(project_path);
      if (!pathValidation.isValid) {
        this.logger.error('Path validation failed for git context', {
          originalPath: project_path,
          error: pathValidation.error
        });
        return {
          content: [{
            type: 'text',
            text: `Error: Invalid project path - ${pathValidation.error}`
          }]
        };
      }

      const validatedProjectPath = pathValidation.normalizedPath;

      this.logger.debug('Getting git context', { 
        project_path: validatedProjectPath, 
        conversation_id,
        include_commit_history,
        include_working_status
      });

      const gitContext = {
        project_path: validatedProjectPath,
        repository: null,
        working_status: null,
        commit_history: [],
        conversation_links: [],
        summary: {
          has_git: false,
          total_commits: 0,
          current_branch: null,
          last_commit_date: null,
          working_directory_clean: null
        }
      };

      const repository = await this.gitManager.discoverRepository(validatedProjectPath);
      if (!repository) {
        gitContext.summary.has_git = false;
        return {
          content: [{
            type: 'text',
            text: JSON.stringify(gitContext, null, 2)
          }]
        };
      }

      gitContext.repository = {
        working_directory: repository.workingDirectory,
        git_directory: repository.gitDirectory,
        remote_url: repository.remoteUrl,
        current_branch: repository.currentBranch,
        latest_commit: repository.latestCommit
      };

      gitContext.summary.has_git = true;
      gitContext.summary.current_branch = repository.currentBranch;

      if (repository.latestCommit) {
        gitContext.summary.last_commit_date = repository.latestCommit.date;
      }

      await this.ensureRepositoryInDatabase(validatedProjectPath, repository);

      if (include_working_status) {
        const workingStatus = await this.gitManager.getWorkingDirectoryStatus(validatedProjectPath);
        gitContext.working_status = workingStatus;
        gitContext.summary.working_directory_clean = workingStatus ? workingStatus.clean : null;
      }

      if (include_commit_history) {
        const options = { limit: commit_limit };
        if (time_range) {
          const timeRangeDate = this.parseTimeRange(time_range);
          if (timeRangeDate) {
            options.since = timeRangeDate.toISOString();
          }
        }

        const commits = await this.gitManager.getCommitHistory(validatedProjectPath, options);
        gitContext.commit_history = commits;
        gitContext.summary.total_commits = commits.length;

        await this.indexCommitsIfNeeded(validatedProjectPath, commits);
      }

      if (conversation_id) {
        const links = await this.getConversationGitLinks(conversation_id);
        gitContext.conversation_links = links;
      }

      this.logger.info('Git context retrieved successfully', {
        project_path: validatedProjectPath,
        has_git: gitContext.summary.has_git,
        commit_count: gitContext.summary.total_commits
      });

      return {
        content: [{
          type: 'text',
          text: JSON.stringify(gitContext, null, 2)
        }]
      };

    } catch (error) {
      this.logger.error('Failed to get git context', {
        args,
        error: error.message,
        stack: error.stack
      });

      return {
        content: [{
          type: 'text',
          text: `Error getting git context: ${error.message}`
        }]
      };
    }
  }

  async ensureRepositoryInDatabase(projectPath, repository) {
    try {
      const repositoryData = {
        projectPath,
        workingDirectory: repository.workingDirectory,
        gitDirectory: repository.gitDirectory,
        remoteUrl: repository.remoteUrl,
        currentBranch: repository.currentBranch
      };

      await this.gitSchema.upsertRepository(repositoryData);
      
      this.logger.debug('Repository ensured in database', { projectPath });
    } catch (error) {
      this.logger.error('Failed to ensure repository in database', {
        projectPath,
        error: error.message,
        stack: error.stack
      });
    }
  }

  async indexCommitsIfNeeded(projectPath, commits) {
    try {
      const repository = await this.gitSchema.getRepositoryByPath(projectPath);
      if (!repository) {
        this.logger.warn('Repository not found in database for commit indexing', { projectPath });
        return;
      }

      const existingCommits = await this.gitSchema.getCommitHistory(repository.id, { limit: 1000 });
      const existingHashes = new Set(existingCommits.map(c => c.commit_hash));

      const newCommits = commits.filter(c => !existingHashes.has(c.hash));

      if (newCommits.length === 0) {
        this.logger.debug('No new commits to index', { projectPath });
        return;
      }

      // Process commits in parallel batches for better performance
      const BATCH_SIZE = 5; // Process 5 commits at a time to avoid overwhelming the system
      
      for (let i = 0; i < newCommits.length; i += BATCH_SIZE) {
        const batch = newCommits.slice(i, i + BATCH_SIZE);
        
        // Fetch commit details in parallel
        const commitDetailsPromises = batch.map(commit => 
          this.gitManager.getCommitDetails(projectPath, commit.hash)
            .catch(error => {
              this.logger.warn('Failed to get commit details', { 
                commitHash: commit.hash, 
                error: error.message 
              });
              return null;
            })
        );
        
        const commitDetailsBatch = await Promise.all(commitDetailsPromises);
        
        // Insert commits sequentially (database operations)
        for (const commitDetails of commitDetailsBatch) {
          if (commitDetails) {
            await this.gitSchema.insertCommit(repository.id, commitDetails);
          }
        }
      }

      this.logger.info('New commits indexed', { 
        projectPath,
        newCommitCount: newCommits.length
      });

    } catch (error) {
      this.logger.error('Failed to index commits', {
        projectPath,
        error: error.message,
        stack: error.stack
      });
    }
  }

  async getConversationGitLinks(conversationId) {
    try {
      const stmt = this.dbManager.db.prepare(`
        SELECT cgl.*, gr.project_path, gr.working_directory,
               gc.commit_hash, gc.commit_date, gc.message as commit_message
        FROM conversation_git_links cgl
        JOIN git_repositories gr ON gr.id = cgl.repository_id
        LEFT JOIN git_commits gc ON gc.id = cgl.commit_id
        WHERE cgl.conversation_id = ?
        ORDER BY cgl.created_at DESC
      `);

      const links = stmt.all(conversationId);
      
      this.logger.debug('Retrieved conversation git links', { 
        conversationId,
        linkCount: links.length
      });

      return links;
    } catch (error) {
      this.logger.error('Failed to get conversation git links', {
        conversationId,
        error: error.message,
        stack: error.stack
      });
      return [];
    }
  }

  parseTimeRange(timeRange) {
    try {
      const now = new Date();
      const normalizedRange = timeRange.toLowerCase().trim();

      if (normalizedRange.includes('hour')) {
        const hours = parseInt(normalizedRange) || 1;
        return new Date(now.getTime() - (hours * 60 * 60 * 1000));
      }

      if (normalizedRange.includes('day')) {
        const days = parseInt(normalizedRange) || 1;
        return new Date(now.getTime() - (days * 24 * 60 * 60 * 1000));
      }

      if (normalizedRange.includes('week')) {
        const weeks = parseInt(normalizedRange) || 1;
        return new Date(now.getTime() - (weeks * 7 * 24 * 60 * 60 * 1000));
      }

      if (normalizedRange.includes('month')) {
        const months = parseInt(normalizedRange) || 1;
        const date = new Date(now);
        date.setMonth(date.getMonth() - months);
        return date;
      }

      if (normalizedRange === 'today') {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        return today;
      }

      if (normalizedRange === 'yesterday') {
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        yesterday.setHours(0, 0, 0, 0);
        return yesterday;
      }

      const parsedDate = new Date(timeRange);
      if (!isNaN(parsedDate.getTime())) {
        return parsedDate;
      }

      return null;
    } catch (error) {
      this.logger.warn('Failed to parse time range', { timeRange, error: error.message });
      return null;
    }
  }

  /**
   * Handle list_restore_points MCP tool request
   * @param {Object} args - Tool arguments
   * @param {string} args.project_path - Path to the project directory
   * @param {string} [args.timeframe] - Filter by timeframe (e.g., "last week")
   * @param {boolean} [args.include_auto_generated=false] - Include auto-generated restore points
   * @param {number} [args.limit=50] - Maximum number of restore points to return
   * @returns {Promise<{content: Array<{type: string, text: string}>}>} MCP response
   */
  async handleListRestorePoints(args) {
    const { project_path, timeframe, include_auto_generated = false, limit = 50 } = args;

    try {
      // Validate project path
      const pathValidation = pathValidator.validateProjectPath(project_path);
      if (!pathValidation.isValid) {
        return {
          content: [{
            type: 'text',
            text: `Error: Invalid project path - ${pathValidation.error}`
          }]
        };
      }

      // Ensure database is initialized
      if (!this.dbManager?.db) {
        await this.dbManager.initialize();
      }

      // Get repository from database
      const getRepoStmt = this.dbManager.db.prepare(`
        SELECT id, working_directory, git_directory, remote_url, current_branch
        FROM git_repositories
        WHERE project_path = ?
      `);
      
      const repository = getRepoStmt.get(pathValidation.normalizedPath);
      
      if (!repository) {
        // Repository not indexed yet
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              project_path: pathValidation.normalizedPath,
              restore_points: [],
              message: "No git repository found for this project. Run get_git_context first to index the repository."
            }, null, 2)
          }]
        };
      }

      // Build query for restore points
      let query = `
        SELECT 
          rp.id,
          rp.commit_hash,
          rp.created_at,
          rp.label,
          rp.description,
          rp.auto_generated,
          rp.test_status,
          gc.author_name,
          gc.author_email,
          gc.commit_date,
          gc.message as commit_message
        FROM restore_points rp
        LEFT JOIN git_commits gc ON gc.commit_hash = rp.commit_hash 
          AND gc.repository_id = rp.repository_id
        WHERE rp.repository_id = ?
      `;

      const queryParams = [repository.id];

      // Apply auto_generated filter
      if (!include_auto_generated) {
        query += ' AND rp.auto_generated = 0';
      }

      // Apply timeframe filter if specified
      if (timeframe) {
        const sinceDate = this.parseTimeRange(timeframe);
        if (sinceDate) {
          query += ' AND rp.created_at >= ?';
          queryParams.push(sinceDate.toISOString());
        }
      }

      // Order by creation date and apply limit
      query += ' ORDER BY rp.created_at DESC LIMIT ?';
      queryParams.push(Math.min(limit, 100));

      const restorePointsStmt = this.dbManager.db.prepare(query);
      const restorePoints = restorePointsStmt.all(...queryParams);

      // Format response
      const formattedPoints = restorePoints.map(point => ({
        id: point.id,
        commit_hash: point.commit_hash,
        label: point.label,
        description: point.description,
        created_at: point.created_at,
        auto_generated: Boolean(point.auto_generated),
        test_status: point.test_status,
        commit_info: point.commit_date ? {
          date: point.commit_date,
          author: point.author_name,
          email: point.author_email,
          message: point.commit_message
        } : null
      }));

      this.logger.info('Restore points retrieved', {
        project_path: pathValidation.normalizedPath,
        repository_id: repository.id,
        points_found: formattedPoints.length,
        filters: { timeframe, include_auto_generated }
      });

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            project_path: pathValidation.normalizedPath,
            repository: {
              working_directory: repository.working_directory,
              git_directory: repository.git_directory,
              remote_url: repository.remote_url,
              current_branch: repository.current_branch
            },
            restore_points: formattedPoints,
            total_points: formattedPoints.length,
            filters_applied: {
              timeframe: timeframe || null,
              include_auto_generated,
              limit
            }
          }, null, 2)
        }]
      };

    } catch (error) {
      const sanitizedError = errorSanitizer.sanitizeError(error.message, { 
        operation: 'list_restore_points' 
      });
      
      this.logger.error('Failed to list restore points', {
        project_path,
        error: sanitizedError,
        stack: error.stack
      });

      return {
        content: [{
          type: 'text',
          text: `Error listing restore points: ${sanitizedError}`
        }]
      };
    }
  }

  /**
   * Handle create_restore_point MCP tool request
   * @param {Object} args - Tool arguments
   * @param {string} args.project_path - Path to the project directory
   * @param {string} args.label - Label for the restore point
   * @param {string} [args.description] - Optional description of the restore point
   * @param {boolean} [args.auto_generated=false] - Whether this is auto-generated
   * @param {string} [args.test_status='unknown'] - Test status at time of creation
   * @returns {Promise<{content: Array<{type: string, text: string}>}>} MCP response
   */
  async handleCreateRestorePoint(args) {
    const { 
      project_path, 
      label, 
      description = '', 
      auto_generated = false,
      test_status = 'unknown'
    } = args;

    try {
      // Validate required parameters
      if (!project_path || !label) {
        return {
          content: [{
            type: 'text',
            text: 'Error: project_path and label are required'
          }]
        };
      }

      // Validate project path
      const pathValidation = pathValidator.validateProjectPath(project_path);
      if (!pathValidation.isValid) {
        return {
          content: [{
            type: 'text',
            text: `Error: Invalid project path - ${pathValidation.error}`
          }]
        };
      }

      const validatedProjectPath = pathValidation.normalizedPath;

      // Ensure database is initialized
      if (!this.dbManager?.db) {
        await this.dbManager.initialize();
      }

      // Get repository from database
      const getRepoStmt = this.dbManager.db.prepare(`
        SELECT id, working_directory, git_directory, remote_url, current_branch
        FROM git_repositories
        WHERE project_path = ?
      `);
      
      let repository = getRepoStmt.get(validatedProjectPath);
      
      // If repository not found, try to discover and index it
      if (!repository) {
        this.logger.info('Repository not found in database, attempting to discover', {
          project_path: validatedProjectPath
        });

        const discoveredRepo = await this.gitManager.discoverRepository(validatedProjectPath);
        if (!discoveredRepo) {
          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                error: 'Not a git repository',
                project_path: validatedProjectPath,
                message: 'The specified path is not a git repository. Initialize git first.'
              }, null, 2)
            }]
          };
        }

        // Index the repository
        await this.ensureRepositoryInDatabase(validatedProjectPath, discoveredRepo);
        
        // Retrieve the newly indexed repository
        repository = getRepoStmt.get(validatedProjectPath);
        if (!repository) {
          throw new Error('Failed to index repository in database');
        }
      }

      // Get current commit hash
      const currentCommit = await this.gitManager.getCurrentCommitHash(validatedProjectPath);
      if (!currentCommit) {
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              error: 'No commits found',
              project_path: validatedProjectPath,
              message: 'Repository has no commits. Make at least one commit before creating a restore point.'
            }, null, 2)
          }]
        };
      }

      // Check if a restore point with the same label already exists
      const checkExistingStmt = this.dbManager.db.prepare(`
        SELECT id, commit_hash, created_at
        FROM restore_points
        WHERE repository_id = ? AND label = ?
      `);
      
      const existing = checkExistingStmt.get(repository.id, label);
      if (existing) {
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              error: 'Duplicate label',
              project_path: validatedProjectPath,
              existing_restore_point: {
                id: existing.id,
                label: label,
                commit_hash: existing.commit_hash,
                created_at: existing.created_at
              },
              message: `A restore point with label "${label}" already exists. Use a different label or delete the existing one.`
            }, null, 2)
          }]
        };
      }

      // Create the restore point
      const insertStmt = this.dbManager.db.prepare(`
        INSERT INTO restore_points (
          repository_id,
          commit_hash,
          label,
          description,
          auto_generated,
          test_status,
          created_at
        ) VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
      `);

      const result = insertStmt.run(
        repository.id,
        currentCommit,
        label,
        description,
        auto_generated ? 1 : 0,
        test_status
      );

      if (!result.lastInsertRowid) {
        throw new Error('Failed to create restore point');
      }

      // Get the created restore point with commit details
      const getCreatedStmt = this.dbManager.db.prepare(`
        SELECT 
          rp.id,
          rp.commit_hash,
          rp.created_at,
          rp.label,
          rp.description,
          rp.auto_generated,
          rp.test_status,
          gc.author_name,
          gc.author_email,
          gc.commit_date,
          gc.message as commit_message
        FROM restore_points rp
        LEFT JOIN git_commits gc ON gc.commit_hash = rp.commit_hash 
          AND gc.repository_id = rp.repository_id
        WHERE rp.id = ?
      `);

      const createdPoint = getCreatedStmt.get(result.lastInsertRowid);

      // Get working directory status for additional context
      const workingStatus = await this.gitManager.getWorkingDirectoryStatus(validatedProjectPath);

      this.logger.info('Restore point created successfully', {
        project_path: validatedProjectPath,
        restore_point_id: result.lastInsertRowid,
        label,
        commit_hash: currentCommit,
        auto_generated
      });

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            success: true,
            project_path: validatedProjectPath,
            restore_point: {
              id: createdPoint.id,
              label: createdPoint.label,
              description: createdPoint.description,
              commit_hash: createdPoint.commit_hash,
              created_at: createdPoint.created_at,
              auto_generated: Boolean(createdPoint.auto_generated),
              test_status: createdPoint.test_status,
              commit_info: createdPoint.commit_date ? {
                date: createdPoint.commit_date,
                author: createdPoint.author_name,
                email: createdPoint.author_email,
                message: createdPoint.commit_message
              } : null
            },
            working_directory: {
              clean: workingStatus?.clean || false,
              modified_files: workingStatus?.modifiedFiles?.length || 0,
              untracked_files: workingStatus?.untrackedFiles?.length || 0
            },
            message: `Restore point "${label}" created successfully at commit ${currentCommit.substring(0, 7)}`
          }, null, 2)
        }]
      };

    } catch (error) {
      const sanitizedError = errorSanitizer.sanitizeError(error.message, { 
        operation: 'create_restore_point' 
      });
      
      this.logger.error('Failed to create restore point', {
        project_path,
        label,
        error: sanitizedError,
        stack: error.stack
      });

      return {
        content: [{
          type: 'text',
          text: `Error creating restore point: ${sanitizedError}`
        }]
      };
    }
  }
}