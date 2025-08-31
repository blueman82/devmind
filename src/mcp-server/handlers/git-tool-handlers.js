import GitManager from '../../git/git-manager.js';
import GitSchema from '../../database/git-schema.js';
import { createLogger } from '../../utils/logger.js';

export class GitToolHandlers {
  constructor(dbManager) {
    this.dbManager = dbManager;
    this.gitManager = new GitManager();
    this.logger = createLogger('GitToolHandlers');
    this.initialized = false;
  }

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

      this.logger.debug('Getting git context', { 
        project_path, 
        conversation_id,
        include_commit_history,
        include_working_status
      });

      const gitContext = {
        project_path,
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

      const repository = await this.gitManager.discoverRepository(project_path);
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

      await this.ensureRepositoryInDatabase(project_path, repository);

      if (include_working_status) {
        const workingStatus = await this.gitManager.getWorkingDirectoryStatus(project_path);
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

        const commits = await this.gitManager.getCommitHistory(project_path, options);
        gitContext.commit_history = commits;
        gitContext.summary.total_commits = commits.length;

        await this.indexCommitsIfNeeded(project_path, commits);
      }

      if (conversation_id) {
        const links = await this.getConversationGitLinks(conversation_id);
        gitContext.conversation_links = links;
      }

      this.logger.info('Git context retrieved successfully', {
        project_path,
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

      for (const commit of newCommits) {
        const commitDetails = await this.gitManager.getCommitDetails(projectPath, commit.hash);
        if (commitDetails) {
          await this.gitSchema.insertCommit(repository.id, commitDetails);
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
}