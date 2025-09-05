import { GitBaseHandler } from './git-base-handler.js';
import errorSanitizer from '../../utils/error-sanitizer.js';

/**
 * Restore point handlers for MCP tools
 * Handles restore point listing and creation operations
 */
export class RestorePointHandlers extends GitBaseHandler {
  /**
   * Handle list_restore_points MCP tool request
   * @param {Object} args - Tool arguments
   * @param {string} args.project_path - Path to the project directory
   * @param {string} [args.timeframe] - Filter by timeframe (e.g., "last week")
   * @param {boolean} [args.include_auto_generated=true] - Include auto-generated restore points
   * @param {number} [args.limit=50] - Maximum number of restore points to return
   * @returns {Promise<{content: Array<{type: string, text: string}>}>} MCP response
   */
  async handleListRestorePoints(args) {
    const { project_path, timeframe, include_auto_generated = true, limit = 50 } = args;

    try {
      const pathValidation = this.validateProjectPath(project_path);
      if (!pathValidation.isValid) {
        return this.createErrorResponse(`Invalid project path - ${pathValidation.error}`);
      }

      await this.ensureDatabaseInitialized();

      // Get repository from database
      const getRepoStmt = this.dbManager.db.prepare(`
        SELECT id, working_directory, git_directory, remote_url, current_branch
        FROM git_repositories
        WHERE project_path = ?
      `);
      
      const repository = getRepoStmt.get(pathValidation.normalizedPath);
      
      if (!repository) {
        // Repository not indexed yet
        return this.createSuccessResponse(JSON.stringify({
          project_path: pathValidation.normalizedPath,
          restore_points: [],
          message: "No git repository found for this project. Run get_git_context first to index the repository."
        }, null, 2));
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

      return this.createSuccessResponse(JSON.stringify({
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
      }, null, 2));

    } catch (error) {
      const sanitizedError = errorSanitizer.sanitizeError(error.message, { 
        operation: 'list_restore_points' 
      });
      
      this.logger.error('Failed to list restore points', {
        project_path,
        error: sanitizedError,
        stack: error.stack
      });

      return this.createErrorResponse(`listing restore points: ${sanitizedError}`);
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
      description = null, 
      auto_generated = false,
      test_status = 'unknown'
    } = args;

    try {
      // Validate required parameters
      if (!project_path) {
        return this.createErrorResponse('project_path is required');
      }
      if (!label || !label.trim()) {
        return this.createErrorResponse('label is required');
      }

      const pathValidation = this.validateProjectPath(project_path);
      if (!pathValidation.isValid) {
        return this.createErrorResponse(`Invalid project path - ${pathValidation.error}`);
      }

      const validatedProjectPath = pathValidation.normalizedPath;

      await this.ensureDatabaseInitialized();

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
          return this.createSuccessResponse(JSON.stringify({
            error: 'Not a git repository',
            project_path: validatedProjectPath,
            message: 'The specified path is not a git repository. Initialize git first.'
          }, null, 2));
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
        return this.createSuccessResponse(JSON.stringify({
          error: 'No commits found',
          project_path: validatedProjectPath,
          message: 'Repository has no commits. Make at least one commit before creating a restore point.'
        }, null, 2));
      }

      // Check if a restore point with the same label already exists
      const checkExistingStmt = this.dbManager.db.prepare(`
        SELECT id, commit_hash, created_at
        FROM restore_points
        WHERE repository_id = ? AND label = ?
      `);
      
      const existing = checkExistingStmt.get(repository.id, label);
      if (existing) {
        return this.createSuccessResponse(JSON.stringify({
          error: 'Duplicate label',
          project_path: validatedProjectPath,
          existing_restore_point: {
            id: existing.id,
            label: label,
            commit_hash: existing.commit_hash,
            created_at: existing.created_at
          },
          message: `A restore point with label "${label}" already exists. Use a different label or delete the existing one.`
        }, null, 2));
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

      return this.createSuccessResponse(JSON.stringify({
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
      }, null, 2));

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

      return this.createErrorResponse(`creating restore point: ${sanitizedError}`);
    }
  }

  /**
   * Ensure repository exists in database
   * @param {string} projectPath - Project path
   * @param {Object} repository - Repository object
   */
  async ensureRepositoryInDatabase(projectPath, repository) {
    try {
      // Ensure gitSchema is initialized
      if (!this.gitSchema) {
        console.error('[RestorePointHandlers] gitSchema not initialized!');
        await this.initialize(); // Try to initialize if not done
        if (!this.gitSchema) {
          throw new Error('GitSchema not available after initialization');
        }
      }
      
      const repositoryData = {
        projectPath,
        workingDirectory: repository.workingDirectory,
        gitDirectory: repository.gitDirectory,
        repositoryRoot: repository.repositoryRoot,
        subdirectoryPath: repository.subdirectoryPath || '.',
        isMonorepoSubdirectory: repository.isMonorepoSubdirectory || false,
        remoteUrl: repository.remoteUrl,
        currentBranch: repository.currentBranch
      };

      console.log('[RestorePointHandlers] Upserting repository:', repositoryData.projectPath);
      const result = await this.gitSchema.upsertRepository(repositoryData);
      console.log('[RestorePointHandlers] Upsert result:', result);
      
      this.logger.debug('Repository ensured in database', { projectPath });
    } catch (error) {
      console.error('[RestorePointHandlers] Failed to ensure repository in database:', error.message);
      this.logger.error('Failed to ensure repository in database', {
        projectPath,
        error: error.message,
        stack: error.stack
      });
      // Re-throw to propagate the error
      throw error;
    }
  }

  /**
   * Parse time range string to Date
   * @param {string} timeRange - Time range string
   * @returns {Date|null} Parsed date or null
   */
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
}