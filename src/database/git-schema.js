import { createLogger } from '../utils/logger.js';

export default class GitSchema {
  constructor(database) {
    this.db = database;
    this.logger = createLogger('GitSchema');
    this.statements = {}; // Cache for prepared statements
  }

  async initialize() {
    try {
      this.logger.info('Initializing git database schema');
      
      await this.createTables();
      await this.createIndexes();
      await this.createTriggers();
      this.prepareStatements(); // Prepare and cache statements
      
      this.logger.info('Git database schema initialized successfully');
    } catch (error) {
      this.logger.error('Failed to initialize git schema', { 
        error: error.message,
        stack: error.stack 
      });
      throw error;
    }
  }

  prepareStatements() {
    // Cache frequently used prepared statements
    this.statements = {
      upsertRepo: this.db.prepare(`
        INSERT INTO git_repositories 
        (project_path, working_directory, git_directory, repository_root, subdirectory_path, is_monorepo_subdirectory, remote_url, current_branch, last_scanned)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(project_path) DO UPDATE SET
          working_directory = excluded.working_directory,
          git_directory = excluded.git_directory,
          repository_root = excluded.repository_root,
          subdirectory_path = excluded.subdirectory_path,
          is_monorepo_subdirectory = excluded.is_monorepo_subdirectory,
          remote_url = excluded.remote_url,
          current_branch = excluded.current_branch,
          last_scanned = CURRENT_TIMESTAMP
      `),
      
      getRepoId: this.db.prepare('SELECT id FROM git_repositories WHERE project_path = ?'),
      
      insertCommit: this.db.prepare(`
        INSERT INTO git_commits 
        (repository_id, commit_hash, branch_name, commit_date, author_name, author_email, message, parent_hashes, is_merge, insertions, deletions, files_changed_count)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(repository_id, commit_hash) DO UPDATE SET
          branch_name = excluded.branch_name,
          commit_date = excluded.commit_date,
          author_name = excluded.author_name,
          author_email = excluded.author_email,
          message = excluded.message
      `),
      
      insertCommitFile: this.db.prepare(`
        INSERT INTO git_commit_files 
        (commit_id, file_path, change_status)
        VALUES (?, ?, ?)
      `),
      
      createRestorePoint: this.db.prepare(`
        INSERT INTO restore_points 
        (repository_id, commit_hash, label, description, auto_generated, test_status)
        VALUES (?, ?, ?, ?, ?, ?)
      `),
      
      linkConversationGit: this.db.prepare(`
        INSERT INTO conversation_git_links 
        (conversation_id, repository_id, commit_id, link_type, confidence)
        VALUES (?, ?, ?, ?, ?)
      `)
    };
    
    this.logger.debug('Prepared statements cached', { 
      statementCount: Object.keys(this.statements).length 
    });
  }

  async createTables() {
    const tables = [
      {
        name: 'git_repositories',
        sql: `
          CREATE TABLE IF NOT EXISTS git_repositories (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            project_path TEXT UNIQUE NOT NULL,
            working_directory TEXT NOT NULL,
            git_directory TEXT NOT NULL,
            repository_root TEXT,
            subdirectory_path TEXT DEFAULT '.',
            is_monorepo_subdirectory BOOLEAN DEFAULT FALSE,
            remote_url TEXT,
            current_branch TEXT,
            last_scanned DATETIME DEFAULT CURRENT_TIMESTAMP,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
          )
        `
      },
      {
        name: 'git_commits',
        sql: `
          CREATE TABLE IF NOT EXISTS git_commits (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            repository_id INTEGER NOT NULL,
            commit_hash TEXT NOT NULL,
            branch_name TEXT,
            commit_date DATETIME NOT NULL,
            author_name TEXT NOT NULL,
            author_email TEXT NOT NULL,
            message TEXT NOT NULL,
            parent_hashes TEXT,
            is_merge BOOLEAN DEFAULT FALSE,
            insertions INTEGER DEFAULT 0,
            deletions INTEGER DEFAULT 0,
            files_changed_count INTEGER DEFAULT 0,
            indexed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (repository_id) REFERENCES git_repositories(id) ON DELETE CASCADE,
            UNIQUE(repository_id, commit_hash)
          )
        `
      },
      {
        name: 'git_commit_files',
        sql: `
          CREATE TABLE IF NOT EXISTS git_commit_files (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            commit_id INTEGER NOT NULL,
            file_path TEXT NOT NULL,
            change_status TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (commit_id) REFERENCES git_commits(id) ON DELETE CASCADE
          )
        `
      },
      {
        name: 'restore_points',
        sql: `
          CREATE TABLE IF NOT EXISTS restore_points (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            repository_id INTEGER NOT NULL,
            commit_hash TEXT NOT NULL,
            label TEXT NOT NULL,
            description TEXT,
            auto_generated BOOLEAN DEFAULT FALSE,
            test_status TEXT DEFAULT 'unknown',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            created_by TEXT DEFAULT 'system',
            FOREIGN KEY (repository_id) REFERENCES git_repositories(id) ON DELETE CASCADE
          )
        `
      },
      {
        name: 'conversation_git_links',
        sql: `
          CREATE TABLE IF NOT EXISTS conversation_git_links (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            conversation_id INTEGER NOT NULL,
            repository_id INTEGER NOT NULL,
            commit_id INTEGER,
            link_type TEXT NOT NULL,
            confidence REAL DEFAULT 1.0,
            time_correlation REAL DEFAULT 0.0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
            FOREIGN KEY (repository_id) REFERENCES git_repositories(id) ON DELETE CASCADE,
            FOREIGN KEY (commit_id) REFERENCES git_commits(id) ON DELETE SET NULL
          )
        `
      }
    ];

    for (const table of tables) {
      this.db.exec(table.sql);
      this.logger.debug(`Created table: ${table.name}`);
    }
  }

  async createIndexes() {
    const indexes = [
      // Primary table lookups
      'CREATE INDEX IF NOT EXISTS idx_git_repositories_project_path ON git_repositories(project_path)',
      'CREATE INDEX IF NOT EXISTS idx_git_commits_repository_id ON git_commits(repository_id)',
      'CREATE INDEX IF NOT EXISTS idx_git_commits_hash ON git_commits(commit_hash)',
      'CREATE INDEX IF NOT EXISTS idx_git_commits_date ON git_commits(commit_date)',
      'CREATE INDEX IF NOT EXISTS idx_git_commit_files_commit_id ON git_commit_files(commit_id)',
      'CREATE INDEX IF NOT EXISTS idx_restore_points_repository_id ON restore_points(repository_id)',
      'CREATE INDEX IF NOT EXISTS idx_restore_points_commit_hash ON restore_points(commit_hash)',
      'CREATE INDEX IF NOT EXISTS idx_conversation_git_links_conversation_id ON conversation_git_links(conversation_id)',
      'CREATE INDEX IF NOT EXISTS idx_conversation_git_links_repository_id ON conversation_git_links(repository_id)',
      
      // Performance-optimized compound indexes for common query patterns
      'CREATE INDEX IF NOT EXISTS idx_git_commits_repo_date ON git_commits(repository_id, commit_date DESC)',
      'CREATE INDEX IF NOT EXISTS idx_git_commits_repo_author ON git_commits(repository_id, author_name)',
      'CREATE INDEX IF NOT EXISTS idx_git_commits_hash_repo ON git_commits(commit_hash, repository_id)',
      'CREATE INDEX IF NOT EXISTS idx_restore_points_repo_created ON restore_points(repository_id, created_at DESC)',
      'CREATE INDEX IF NOT EXISTS idx_conversation_git_links_conv_repo ON conversation_git_links(conversation_id, repository_id)',
      
      // File-based query optimization
      'CREATE INDEX IF NOT EXISTS idx_git_commit_files_path ON git_commit_files(file_path)',
      'CREATE INDEX IF NOT EXISTS idx_git_commit_files_status ON git_commit_files(change_status)',
      
      // Author and time-based queries
      'CREATE INDEX IF NOT EXISTS idx_git_commits_author_date ON git_commits(author_name, commit_date DESC)',
      'CREATE INDEX IF NOT EXISTS idx_git_repositories_updated ON git_repositories(last_scanned DESC)',
      
      // Restore point optimization
      'CREATE INDEX IF NOT EXISTS idx_restore_points_auto_generated ON restore_points(auto_generated, repository_id)'
    ];

    for (const index of indexes) {
      this.db.exec(index);
    }
    
    this.logger.debug('Created git database indexes');
  }

  async createTriggers() {
    const triggers = [
      `
        CREATE TRIGGER IF NOT EXISTS update_git_repositories_timestamp
        AFTER UPDATE ON git_repositories
        BEGIN
          UPDATE git_repositories SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
        END
      `
    ];

    for (const trigger of triggers) {
      this.db.exec(trigger);
    }
    
    this.logger.debug('Created git database triggers');
  }

  /**
   * Upsert a git repository to the database
   * @param {Object} repositoryData - Repository information
   * @param {string} repositoryData.projectPath - Project path
   * @param {string} repositoryData.workingDirectory - Working directory path
   * @param {string} repositoryData.gitDirectory - Git directory path
   * @param {string} [repositoryData.remoteUrl] - Remote repository URL
   * @param {string} [repositoryData.currentBranch] - Current branch name
   * @returns {Promise<Object>} Result with repository ID
   */
  async upsertRepository(repositoryData) {
    try {
      const {
        projectPath,
        workingDirectory,
        gitDirectory,
        repositoryRoot,
        subdirectoryPath = '.',
        isMonorepoSubdirectory = false,
        remoteUrl,
        currentBranch
      } = repositoryData;

      // Use cached prepared statement (convert boolean to integer for SQLite)
      const result = this.statements.upsertRepo.run(
        projectPath, workingDirectory, gitDirectory, repositoryRoot, subdirectoryPath, isMonorepoSubdirectory ? 1 : 0, remoteUrl, currentBranch
      );
      
      let repositoryId;
      if (result.lastInsertRowid && result.lastInsertRowid > 0) {
        repositoryId = result.lastInsertRowid;
      } else {
        // Use cached prepared statement
        const row = this.statements.getRepoId.get(projectPath);
        repositoryId = row ? row.id : null;
      }

      this.logger.debug('Repository upserted', { 
        projectPath,
        repositoryId,
        changes: result.changes
      });

      return { ...result, repositoryId };
    } catch (error) {
      this.logger.error('Failed to upsert repository', { 
        repositoryData,
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  /**
   * Insert a commit into the database
   * @param {number} repositoryId - Repository ID
   * @param {Object} commitData - Commit information
   * @param {string} commitData.hash - Commit hash
   * @param {Date|string} commitData.date - Commit date
   * @param {string} commitData.authorName - Author name
   * @param {string} commitData.authorEmail - Author email
   * @param {string} commitData.message - Commit message
   * @param {Array<string>} [commitData.parents] - Parent commit hashes
   * @param {boolean} [commitData.isMerge] - Is merge commit
   * @param {number} [commitData.insertions] - Number of insertions
   * @param {number} [commitData.deletions] - Number of deletions
   * @param {Array<Object>} [commitData.filesChanged] - Files changed in commit
   * @returns {Promise<Object>} Insert result
   */
  async insertCommit(repositoryId, commitData) {
    try {
      const {
        hash,
        branchName,
        date,
        authorName,
        authorEmail,
        message,
        parents,
        isMerge,
        insertions,
        deletions,
        filesChanged
      } = commitData;

      const parentHashesJson = parents ? JSON.stringify(parents) : null;
      const filesChangedCount = filesChanged ? filesChanged.length : 0;

      // Use cached prepared statement (note: using insertCommit which has ON CONFLICT UPDATE)
      const result = this.statements.insertCommit.run(
        repositoryId, hash, branchName, date instanceof Date ? date.toISOString() : date, authorName, authorEmail,
        message, parentHashesJson, isMerge ? 1 : 0,
        insertions || 0, deletions || 0, filesChangedCount
      );

      if (result.changes > 0 && filesChanged && filesChanged.length > 0) {
        const commitId = result.lastInsertRowid;
        await this.insertCommitFiles(commitId, filesChanged);
      }

      this.logger.debug('Commit inserted', { 
        repositoryId,
        commitHash: hash,
        changes: result.changes
      });

      return result;
    } catch (error) {
      this.logger.error('Failed to insert commit', { 
        repositoryId,
        commitHash: commitData.hash,
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  async insertCommitFiles(commitId, filesChanged) {
    try {
      // Use cached prepared statement
      for (const file of filesChanged) {
        this.statements.insertCommitFile.run(commitId, file.path, file.status);
      }

      this.logger.debug('Commit files inserted', { 
        commitId,
        fileCount: filesChanged.length
      });
    } catch (error) {
      this.logger.error('Failed to insert commit files', { 
        commitId,
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  async getRepositoryByPath(projectPath) {
    try {
      const stmt = this.db.prepare(`
        SELECT * FROM git_repositories 
        WHERE project_path = ?
      `);
      
      const repository = stmt.get(projectPath);
      
      if (repository) {
        this.logger.debug('Repository found', { projectPath, repositoryId: repository.id });
      }
      
      return repository;
    } catch (error) {
      this.logger.error('Failed to get repository by path', { 
        projectPath,
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  async getCommitHistory(repositoryId, options = {}) {
    try {
      const {
        limit = 50,
        since = null,
        until = null,
        author = null
      } = options;

      let sql = `
        SELECT c.*, r.project_path, r.working_directory
        FROM git_commits c
        JOIN git_repositories r ON r.id = c.repository_id
        WHERE c.repository_id = ?
      `;

      const params = [repositoryId];

      if (since) {
        sql += ' AND c.commit_date >= ?';
        params.push(since);
      }

      if (until) {
        sql += ' AND c.commit_date <= ?';
        params.push(until);
      }

      if (author) {
        sql += ' AND (c.author_name LIKE ? OR c.author_email LIKE ?)';
        params.push(`%${author}%`, `%${author}%`);
      }

      sql += ' ORDER BY c.commit_date DESC';

      if (limit) {
        sql += ' LIMIT ?';
        params.push(limit);
      }

      const stmt = this.db.prepare(sql);
      const commits = stmt.all(...params);

      this.logger.debug('Retrieved commit history', { 
        repositoryId,
        commitCount: commits.length,
        options
      });

      return commits;
    } catch (error) {
      this.logger.error('Failed to get commit history', { 
        repositoryId,
        options,
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  async linkConversationToGit(conversationId, repositoryId, commitId = null, linkType = 'temporal') {
    try {
      const stmt = this.db.prepare(`
        INSERT OR REPLACE INTO conversation_git_links 
        (conversation_id, repository_id, commit_id, link_type, confidence)
        VALUES (?, ?, ?, ?, ?)
      `);

      const result = stmt.run(conversationId, repositoryId, commitId, linkType, 1.0);

      this.logger.debug('Conversation linked to git', { 
        conversationId,
        repositoryId,
        commitId,
        linkType
      });

      return result;
    } catch (error) {
      this.logger.error('Failed to link conversation to git', { 
        conversationId,
        repositoryId,
        commitId,
        linkType,
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }
}