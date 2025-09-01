import { GitBaseHandler } from './git-base-handler.js';

/**
 * Git context handlers for MCP tools
 * Handles repository status and commit history operations
 */
export class GitContextHandlers extends GitBaseHandler {
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
      await this.ensureDatabaseInitialized();

      const {
        project_path,
        conversation_id = null,
        include_commit_history = true,
        include_working_status = true,
        commit_limit = 20,
        time_range = null,
        branch = null,
        subdirectory = null
      } = args;

      const pathValidation = this.validateProjectPath(project_path);
      if (!pathValidation.isValid) {
        return this.createErrorResponse(pathValidation.error);
      }

      const validatedProjectPath = pathValidation.normalizedPath;

      this.logger.debug('Getting git context', { 
        project_path: validatedProjectPath, 
        conversation_id,
        include_commit_history,
        include_working_status,
        branch,
        subdirectory
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
          working_directory_clean: null,
          is_monorepo_subdirectory: false,
          subdirectory_path: null
        }
      };

      const repository = await this.gitManager.discoverRepository(validatedProjectPath);
      if (!repository) {
        gitContext.summary.has_git = false;
        return this.createSuccessResponse(JSON.stringify(gitContext, null, 2));
      }

      gitContext.repository = {
        working_directory: repository.workingDirectory,
        git_directory: repository.gitDirectory,
        remote_url: repository.remoteUrl,
        current_branch: repository.currentBranch,
        latest_commit: repository.latestCommit,
        repository_root: repository.repositoryRoot,
        subdirectory_path: repository.subdirectoryPath,
        is_monorepo_subdirectory: repository.isMonorepoSubdirectory
      };

      gitContext.summary.has_git = true;
      gitContext.summary.current_branch = repository.currentBranch;
      gitContext.summary.is_monorepo_subdirectory = repository.isMonorepoSubdirectory;
      gitContext.summary.subdirectory_path = repository.subdirectoryPath;

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
        
        // Add branch parameter if specified
        if (branch) {
          options.branch = branch;
        }
        
        // Use subdirectory from repository or parameter
        const effectiveSubdirectory = subdirectory || 
          (repository.isMonorepoSubdirectory ? repository.subdirectoryPath : null);
        
        if (effectiveSubdirectory && effectiveSubdirectory !== '.') {
          options.subdirectory = effectiveSubdirectory;
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

      return this.createSuccessResponse(JSON.stringify(gitContext, null, 2));

    } catch (error) {
      this.logger.error('Failed to get git context', {
        args,
        error: error.message,
        stack: error.stack
      });

      return this.createErrorResponse(`getting git context: ${error.message}`);
    }
  }

  /**
   * Ensure repository exists in database
   * @param {string} projectPath - Project path
   * @param {Object} repository - Repository object
   */
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

  /**
   * Index commits if they don't exist in database
   * @param {string} projectPath - Project path
   * @param {Array} commits - Commits to index
   */
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

  /**
   * Get conversation git links
   * @param {string} conversationId - Conversation ID
   * @returns {Promise<Array>} Git links
   */
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