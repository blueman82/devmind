import { execSync } from 'child_process';
import path from 'path';
import fs from 'fs';
import { createLogger } from '../utils/logger.js';

export default class GitManager {
  constructor() {
    this.logger = createLogger('GitManager');
    this.repositoryCache = new Map();
  }

  async discoverRepository(projectPath) {
    try {
      if (!projectPath || typeof projectPath !== 'string') {
        this.logger.warn('Invalid project path provided', { projectPath });
        return null;
      }

      if (this.repositoryCache.has(projectPath)) {
        const cached = this.repositoryCache.get(projectPath);
        if (Date.now() - cached.timestamp < 300000) { // 5 min cache
          return cached.repository;
        }
      }

      const normalizedPath = path.resolve(projectPath);
      
      if (!fs.existsSync(normalizedPath)) {
        this.logger.debug('Project path does not exist', { projectPath: normalizedPath });
        return null;
      }

      const repository = await this.findGitRoot(normalizedPath);
      
      if (repository) {
        this.repositoryCache.set(projectPath, {
          repository,
          timestamp: Date.now()
        });
        this.logger.debug('Repository discovered and cached', { 
          projectPath: normalizedPath,
          gitRoot: repository.gitRoot
        });
      }

      return repository;
    } catch (error) {
      this.logger.error('Repository discovery failed', { 
        projectPath, 
        error: error.message,
        stack: error.stack
      });
      return null;
    }
  }

  async findGitRoot(startPath) {
    let currentPath = startPath;
    
    while (currentPath !== path.dirname(currentPath)) {
      const gitPath = path.join(currentPath, '.git');
      
      if (fs.existsSync(gitPath)) {
        try {
          const stats = fs.statSync(gitPath);
          if (stats.isDirectory()) {
            return await this.parseRepositoryInfo(currentPath, gitPath);
          } else if (stats.isFile()) {
            const gitFile = fs.readFileSync(gitPath, 'utf8').trim();
            if (gitFile.startsWith('gitdir: ')) {
              const actualGitPath = gitFile.replace('gitdir: ', '');
              const resolvedGitPath = path.isAbsolute(actualGitPath) 
                ? actualGitPath 
                : path.resolve(currentPath, actualGitPath);
              
              if (fs.existsSync(resolvedGitPath)) {
                return await this.parseRepositoryInfo(currentPath, resolvedGitPath);
              }
            }
          }
        } catch (error) {
          this.logger.debug('Error checking git directory', { gitPath, error: error.message });
        }
      }
      
      currentPath = path.dirname(currentPath);
    }
    
    return null;
  }

  async parseRepositoryInfo(workingDirectory, gitDirectory) {
    try {
      const repository = {
        workingDirectory,
        gitDirectory,
        gitRoot: workingDirectory
      };

      try {
        const remoteUrl = execSync('git remote get-url origin', { 
          cwd: workingDirectory, 
          encoding: 'utf8',
          timeout: 5000
        }).trim();
        repository.remoteUrl = remoteUrl;
      } catch (error) {
        this.logger.debug('No remote origin found', { workingDirectory });
        repository.remoteUrl = null;
      }

      try {
        const currentBranch = execSync('git branch --show-current', { 
          cwd: workingDirectory, 
          encoding: 'utf8',
          timeout: 5000
        }).trim();
        repository.currentBranch = currentBranch || 'HEAD';
      } catch (error) {
        this.logger.debug('Could not determine current branch', { workingDirectory });
        repository.currentBranch = 'HEAD';
      }

      try {
        const latestCommit = execSync('git log -1 --format="%H|%ad|%an|%s" --date=iso', { 
          cwd: workingDirectory, 
          encoding: 'utf8',
          timeout: 5000
        }).trim();
        
        if (latestCommit) {
          const [hash, date, author, message] = latestCommit.split('|');
          repository.latestCommit = {
            hash,
            date: new Date(date),
            author,
            message
          };
        }
      } catch (error) {
        this.logger.debug('Could not get latest commit info', { workingDirectory });
        repository.latestCommit = null;
      }

      return repository;
    } catch (error) {
      this.logger.error('Failed to parse repository info', { 
        workingDirectory,
        gitDirectory,
        error: error.message,
        stack: error.stack
      });
      return null;
    }
  }

  async getCommitHistory(projectPath, options = {}) {
    try {
      const repository = await this.discoverRepository(projectPath);
      if (!repository) {
        return [];
      }

      const {
        limit = 50,
        since = null,
        until = null,
        author = null,
        grep = null
      } = options;

      let gitCommand = 'git log --format="%H|%ad|%an|%ae|%s|%P" --date=iso';
      
      if (limit) gitCommand += ` -${limit}`;
      if (since) gitCommand += ` --since="${since}"`;
      if (until) gitCommand += ` --until="${until}"`;
      if (author) gitCommand += ` --author="${author}"`;
      if (grep) gitCommand += ` --grep="${grep}"`;

      const output = execSync(gitCommand, { 
        cwd: repository.workingDirectory, 
        encoding: 'utf8',
        timeout: 10000
      });

      const commits = output.trim().split('\n')
        .filter(line => line.trim())
        .map(line => {
          const [hash, date, authorName, authorEmail, message, parents] = line.split('|');
          return {
            hash,
            date: new Date(date),
            authorName,
            authorEmail,
            message,
            parents: parents ? parents.split(' ').filter(p => p) : [],
            isMerge: parents && parents.split(' ').length > 1
          };
        });

      this.logger.debug('Retrieved commit history', { 
        projectPath,
        commitCount: commits.length,
        options
      });

      return commits;
    } catch (error) {
      this.logger.error('Failed to get commit history', { 
        projectPath,
        options,
        error: error.message,
        stack: error.stack
      });
      return [];
    }
  }

  async getCommitDetails(projectPath, commitHash) {
    try {
      const repository = await this.discoverRepository(projectPath);
      if (!repository) {
        return null;
      }

      const commitInfo = execSync(
        `git show --format="%H|%ad|%an|%ae|%s|%P" --name-status ${commitHash}`,
        { 
          cwd: repository.workingDirectory, 
          encoding: 'utf8',
          timeout: 10000
        }
      );

      const lines = commitInfo.trim().split('\n');
      const [hash, date, authorName, authorEmail, message, parents] = lines[0].split('|');
      
      const filesChanged = lines.slice(1)
        .filter(line => line.trim())
        .map(line => {
          const [status, ...pathParts] = line.split('\t');
          return {
            status,
            path: pathParts.join('\t')
          };
        });

      const stats = execSync(
        `git show --stat --format="" ${commitHash}`,
        { 
          cwd: repository.workingDirectory, 
          encoding: 'utf8',
          timeout: 10000
        }
      );

      const statsMatch = stats.match(/(\d+) files? changed(?:, (\d+) insertions?\(\+\))?(?:, (\d+) deletions?\(-\))?/);
      const insertions = statsMatch ? parseInt(statsMatch[2] || '0') : 0;
      const deletions = statsMatch ? parseInt(statsMatch[3] || '0') : 0;

      return {
        hash,
        date: new Date(date),
        authorName,
        authorEmail,
        message,
        parents: parents ? parents.split(' ').filter(p => p) : [],
        isMerge: parents && parents.split(' ').length > 1,
        filesChanged,
        insertions,
        deletions,
        repository: repository.workingDirectory
      };
    } catch (error) {
      this.logger.error('Failed to get commit details', { 
        projectPath,
        commitHash,
        error: error.message,
        stack: error.stack
      });
      return null;
    }
  }

  async getWorkingDirectoryStatus(projectPath) {
    try {
      const repository = await this.discoverRepository(projectPath);
      if (!repository) {
        return null;
      }

      const status = execSync('git status --porcelain', { 
        cwd: repository.workingDirectory, 
        encoding: 'utf8',
        timeout: 5000
      });

      const staged = [];
      const modified = [];
      const untracked = [];

      status.trim().split('\n')
        .filter(line => line.trim())
        .forEach(line => {
          const statusCode = line.substring(0, 2);
          const filePath = line.substring(3);
          
          if (statusCode[0] !== ' ') {
            staged.push({ status: statusCode[0], path: filePath });
          }
          if (statusCode[1] !== ' ') {
            if (statusCode[1] === '?') {
              untracked.push({ path: filePath });
            } else {
              modified.push({ status: statusCode[1], path: filePath });
            }
          }
        });

      return {
        repository: repository.workingDirectory,
        branch: repository.currentBranch,
        staged,
        modified,
        untracked,
        clean: staged.length === 0 && modified.length === 0 && untracked.length === 0
      };
    } catch (error) {
      this.logger.error('Failed to get working directory status', { 
        projectPath,
        error: error.message,
        stack: error.stack
      });
      return null;
    }
  }

  clearCache() {
    this.repositoryCache.clear();
    this.logger.debug('Repository cache cleared');
  }
}