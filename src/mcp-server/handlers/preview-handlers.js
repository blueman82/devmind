import { GitBaseHandler } from './git-base-handler.js';
import errorSanitizer from '../../utils/error-sanitizer.js';
import secureGitExecutor from '../../utils/secure-git-executor.js';

/**
 * Preview handlers for MCP tools
 * Handles restore preview operations
 */
export class PreviewHandlers extends GitBaseHandler {
  /**
   * Handle preview_restore MCP tool request
   * @param {Object} args - Tool arguments
   * @param {string} args.project_path - Path to the project directory
   * @param {number} [args.restore_point_id] - ID of the restore point to preview
   * @param {string} [args.commit_hash] - Commit hash to preview (alternative to restore_point_id)
   * @param {boolean} [args.include_file_contents=false] - Include file content diffs
   * @param {number} [args.max_files=100] - Maximum number of files to show
   * @returns {Promise<{content: Array<{type: string, text: string}>}>} MCP response
   */
  async handlePreviewRestore(args) {
    const { 
      project_path, 
      restore_point_id,
      commit_hash,
      include_file_contents = false,
      max_files = 100
    } = args;

    try {
      // Validate required parameters
      if (!project_path) {
        return this.createErrorResponse('project_path is required');
      }

      if (!restore_point_id && !commit_hash) {
        return this.createErrorResponse('Either restore_point_id or commit_hash is required');
      }

      // Validate commit hash format if provided
      if (commit_hash && !/^[a-f0-9]{7,40}$/.test(commit_hash)) {
        return this.createErrorResponse('Invalid commit hash format. Must be 7-40 hexadecimal characters.');
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
      
      const repository = getRepoStmt.get(validatedProjectPath);
      
      if (!repository) {
        return this.createSuccessResponse(JSON.stringify({
          error: 'Repository not found',
          project_path: validatedProjectPath,
          message: 'Repository not found in database. Run get_git_context first to index the repository.'
        }, null, 2));
      }

      // Get target commit hash
      let targetCommitHash = commit_hash;
      let restorePointData = null;

      if (restore_point_id) {
        // Get restore point from database
        const getRestorePointStmt = this.dbManager.db.prepare(`
          SELECT 
            rp.id,
            rp.commit_hash,
            rp.label,
            rp.description,
            rp.created_at,
            rp.auto_generated,
            rp.test_status,
            gc.author_name,
            gc.author_email,
            gc.commit_date,
            gc.message as commit_message
          FROM restore_points rp
          LEFT JOIN git_commits gc ON gc.commit_hash = rp.commit_hash 
            AND gc.repository_id = rp.repository_id
          WHERE rp.id = ? AND rp.repository_id = ?
        `);
        
        restorePointData = getRestorePointStmt.get(restore_point_id, repository.id);
        
        if (!restorePointData) {
          return this.createSuccessResponse(JSON.stringify({
            error: 'Restore point not found',
            restore_point_id,
            project_path: validatedProjectPath,
            message: 'The specified restore point does not exist for this repository.'
          }, null, 2));
        }
        
        targetCommitHash = restorePointData.commit_hash;
      }

      // Get current commit hash
      const currentCommitHash = await this.gitManager.getCurrentCommitHash(validatedProjectPath);
      if (!currentCommitHash) {
        return this.createSuccessResponse(JSON.stringify({
          error: 'No current commit',
          project_path: validatedProjectPath,
          message: 'Could not determine current commit. Repository may have no commits.'
        }, null, 2));
      }

      // Check if already at target commit
      if (currentCommitHash === targetCommitHash) {
        return this.createSuccessResponse(JSON.stringify({
          preview: {
            status: 'no_changes',
            message: 'Already at the target commit',
            current_commit: currentCommitHash,
            target_commit: targetCommitHash,
            restore_point: restorePointData ? {
              id: restorePointData.id,
              label: restorePointData.label,
              description: restorePointData.description
            } : null
          }
        }, null, 2));
      }

      // Get file changes between current and target commits
      const fileChanges = await this.getFileChangesBetweenCommits(
        validatedProjectPath,
        currentCommitHash,
        targetCommitHash
      );

      // Get working directory status
      const workingStatus = await this.gitManager.getWorkingDirectoryStatus(validatedProjectPath);

      // Prepare preview response
      const preview = {
        project_path: validatedProjectPath,
        restore_point: restorePointData ? {
          id: restorePointData.id,
          label: restorePointData.label,
          description: restorePointData.description,
          created_at: restorePointData.created_at,
          test_status: restorePointData.test_status,
          commit_info: restorePointData.commit_date ? {
            date: restorePointData.commit_date,
            author: restorePointData.author_name,
            message: restorePointData.commit_message
          } : null
        } : null,
        current_state: {
          commit_hash: currentCommitHash,
          working_directory_clean: workingStatus?.clean || false,
          modified_files: workingStatus?.modifiedFiles?.length || 0,
          untracked_files: workingStatus?.untrackedFiles?.length || 0
        },
        target_state: {
          commit_hash: targetCommitHash
        },
        changes_preview: {
          total_files_affected: Math.min(fileChanges.length, max_files),
          files_truncated: fileChanges.length > max_files,
          files: fileChanges.slice(0, max_files).map(file => ({
            path: file.path,
            change_type: file.changeType,
            additions: file.additions,
            deletions: file.deletions
          }))
        },
        warnings: []
      };

      // Add warnings if working directory is not clean
      if (!workingStatus?.clean) {
        preview.warnings.push({
          type: 'uncommitted_changes',
          message: 'Working directory has uncommitted changes that may be lost',
          modified_files: workingStatus?.modifiedFiles || [],
          untracked_files: workingStatus?.untrackedFiles || []
        });
      }

      // Add restore commands
      preview.restore_commands = {
        safe_restore: [
          `# Create a backup branch at current position`,
          `git branch backup-$(date +%Y%m%d-%H%M%S)`,
          `# Restore to target commit`,
          `git reset --hard ${targetCommitHash}`
        ],
        with_stash: [
          `# Stash any uncommitted changes`,
          `git stash push -m "Before restore to ${targetCommitHash}"`,
          `# Restore to target commit`,
          `git reset --hard ${targetCommitHash}`
        ]
      };

      this.logger.info('Restore preview generated', {
        project_path: validatedProjectPath,
        current_commit: currentCommitHash,
        target_commit: targetCommitHash,
        files_affected: fileChanges.length
      });

      return this.createSuccessResponse(JSON.stringify(preview, null, 2));

    } catch (error) {
      const sanitizedError = errorSanitizer.sanitizeError(error.message, { 
        operation: 'preview_restore' 
      });
      
      this.logger.error('Failed to preview restore', {
        project_path,
        restore_point_id,
        commit_hash,
        error: sanitizedError,
        stack: error.stack
      });

      return this.createErrorResponse(`previewing restore: ${sanitizedError}`);
    }
  }

  /**
   * Get file changes between two commits
   * @param {string} projectPath - Project path
   * @param {string} fromCommit - From commit hash
   * @param {string} toCommit - To commit hash
   * @returns {Promise<Array>} Array of file changes
   */
  async getFileChangesBetweenCommits(projectPath, fromCommit, toCommit) {
    try {
      // Ensure gitSchema is initialized
      if (!this.gitSchema) {
        console.error('[PreviewHandlers] gitSchema not initialized!');
        await this.initialize(); // Try to initialize if not done
        if (!this.gitSchema) {
          throw new Error('GitSchema not available after initialization');
        }
      }
      
      // Query database for file changes
      const repository = await this.gitSchema.getRepositoryByPath(projectPath);
      if (!repository) {
        return [];
      }

      // Get files from both commits
      const getFilesStmt = this.dbManager.db.prepare(`
        SELECT 
          gcf.file_path,
          gcf.change_type,
          gcf.additions,
          gcf.deletions,
          gc.commit_hash
        FROM git_commit_files gcf
        JOIN git_commits gc ON gc.id = gcf.commit_id
        WHERE gc.repository_id = ? 
          AND gc.commit_hash IN (?, ?)
        ORDER BY gcf.file_path
      `);

      const files = getFilesStmt.all(repository.id, fromCommit, toCommit);

      // Group by file path to determine changes
      const fileMap = new Map();
      files.forEach(file => {
        if (!fileMap.has(file.file_path)) {
          fileMap.set(file.file_path, {});
        }
        const fileData = fileMap.get(file.file_path);
        if (file.commit_hash === fromCommit) {
          fileData.from = file;
        } else {
          fileData.to = file;
        }
      });

      // Determine change types
      const changes = [];
      for (const [path, data] of fileMap) {
        if (data.from && !data.to) {
          changes.push({
            path,
            changeType: 'deleted',
            additions: 0,
            deletions: data.from.additions || 0
          });
        } else if (!data.from && data.to) {
          changes.push({
            path,
            changeType: 'added',
            additions: data.to.additions || 0,
            deletions: 0
          });
        } else if (data.from && data.to) {
          changes.push({
            path,
            changeType: 'modified',
            additions: data.to.additions || 0,
            deletions: data.to.deletions || 0
          });
        }
      }

      // If no indexed data, fall back to git diff (limited)
      if (changes.length === 0) {
        this.logger.debug('No indexed file changes, attempting git diff', {
          projectPath,
          fromCommit,
          toCommit
        });

        // Use secure git executor for diff summary
        const diffSummary = secureGitExecutor.executeGitCommand(
          'diff',
          ['--name-status', `${fromCommit}..${toCommit}`],
          { cwd: projectPath, timeout: 10000 }
        );

        const lines = diffSummary.trim().split('\n').filter(line => line);
        lines.forEach(line => {
          const [status, ...pathParts] = line.split('\t');
          const path = pathParts.join('\t');
          
          let changeType = 'modified';
          if (status === 'A') changeType = 'added';
          else if (status === 'D') changeType = 'deleted';
          else if (status === 'R') changeType = 'renamed';
          
          changes.push({
            path,
            changeType,
            additions: 0,
            deletions: 0
          });
        });
      }

      return changes;
    } catch (error) {
      this.logger.error('Failed to get file changes between commits', {
        projectPath,
        fromCommit,
        toCommit,
        error: error.message
      });
      return [];
    }
  }
}