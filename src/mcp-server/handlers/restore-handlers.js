import { GitBaseHandler } from './git-base-handler.js';
import errorSanitizer from '../../utils/error-sanitizer.js';

/**
 * Restore handlers for MCP tools
 * Handles project restoration operations
 */
export class RestoreHandlers extends GitBaseHandler {
  /**
   * Handle restore_project_state MCP tool request
   * @param {Object} args - Tool arguments
   * @param {string} args.project_path - Path to the project directory
   * @param {number} [args.restore_point_id] - ID of the restore point to restore to
   * @param {string} [args.commit_hash] - Commit hash to restore to (alternative to restore_point_id)
   * @param {string} [args.restore_method='safe'] - Restoration method: 'safe', 'stash', 'force'
   * @param {boolean} [args.create_backup=true] - Create backup branch before restoration
   * @param {boolean} [args.dry_run=false] - Generate commands without execution instructions
   * @returns {Promise<{content: Array<{type: string, text: string}>}>} MCP response
   */
  async handleRestoreProjectState(args) {
    const { 
      project_path, 
      restore_point_id,
      commit_hash,
      restore_method = 'safe',
      create_backup = true,
      dry_run = false
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

      // Validate restore method
      const validMethods = ['safe', 'stash', 'force'];
      if (!validMethods.includes(restore_method)) {
        return this.createErrorResponse(`Invalid restore_method. Must be one of: ${validMethods.join(', ')}`);
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
            rp.test_status,
            gc.author_name,
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
          status: 'already_at_target',
          message: 'Project is already at the target commit',
          current_commit: currentCommitHash,
          target_commit: targetCommitHash,
          restore_point: restorePointData ? {
            id: restorePointData.id,
            label: restorePointData.label
          } : null
        }, null, 2));
      }

      // Get working directory status
      const workingStatus = await this.gitManager.getWorkingDirectoryStatus(validatedProjectPath);
      const hasUncommittedChanges = !workingStatus?.clean;

      // Generate restore commands based on method
      const commands = [];
      const warnings = [];
      const preChecks = [];

      // Add pre-restoration checks
      preChecks.push({
        description: 'Verify current branch and commit',
        command: 'git status && git rev-parse HEAD'
      });

      if (hasUncommittedChanges && restore_method === 'safe') {
        warnings.push({
          type: 'uncommitted_changes',
          severity: 'HIGH',
          message: 'Working directory has uncommitted changes. Use stash or force method, or commit changes first.',
          modified_files: workingStatus?.modifiedFiles || [],
          untracked_files: workingStatus?.untrackedFiles || []
        });

        // Provide alternative commands
        commands.push({
          description: 'Option 1: Commit your changes first',
          commands: [
            'git add -A',
            'git commit -m "WIP: Changes before restoration"'
          ]
        });

        commands.push({
          description: 'Option 2: Use stash method instead',
          commands: [
            `# Re-run with restore_method: 'stash'`
          ]
        });

        return this.createSuccessResponse(JSON.stringify({
          status: 'blocked',
          reason: 'uncommitted_changes',
          restore_method: restore_method,
          warnings,
          alternatives: commands,
          working_directory: {
            clean: false,
            modified_files: workingStatus?.modifiedFiles?.length || 0,
            untracked_files: workingStatus?.untrackedFiles?.length || 0
          }
        }, null, 2));
      }

      // Generate backup branch name
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const backupBranchName = `backup-before-restore-${timestamp}`;

      // Build restoration commands
      if (create_backup) {
        commands.push({
          description: 'Create backup branch at current position',
          commands: [
            `git branch ${backupBranchName}`,
            `echo "Backup branch created: ${backupBranchName}"`
          ]
        });
      }

      if (restore_method === 'stash' && hasUncommittedChanges) {
        commands.push({
          description: 'Stash uncommitted changes',
          commands: [
            `git stash push -m "Stashed before restore to ${targetCommitHash.substring(0, 7)}"`,
            'echo "Changes stashed successfully"'
          ]
        });
      }

      if (restore_method === 'force' && hasUncommittedChanges) {
        warnings.push({
          type: 'data_loss_warning',
          severity: 'CRITICAL',
          message: 'Force restoration will permanently discard all uncommitted changes!'
        });

        commands.push({
          description: 'Force clean working directory (DESTRUCTIVE)',
          commands: [
            'git reset --hard HEAD',
            'git clean -fd',
            'echo "Working directory cleaned (uncommitted changes lost)"'
          ]
        });
      }

      // Main restoration command
      commands.push({
        description: 'Restore to target commit',
        commands: [
          `git reset --hard ${targetCommitHash}`,
          `echo "Successfully restored to commit ${targetCommitHash.substring(0, 7)}"`
        ]
      });

      // Post-restoration actions
      commands.push({
        description: 'Verify restoration',
        commands: [
          'git log -1 --oneline',
          'git status'
        ]
      });

      // Create comprehensive response
      const response = {
        status: dry_run ? 'dry_run' : 'ready',
        restoration_plan: {
          project_path: validatedProjectPath,
          current_commit: currentCommitHash,
          target_commit: targetCommitHash,
          restore_method: restore_method,
          create_backup: create_backup,
          backup_branch: create_backup ? backupBranchName : null
        },
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
        working_directory: {
          clean: workingStatus?.clean || false,
          modified_files: workingStatus?.modifiedFiles?.length || 0,
          untracked_files: workingStatus?.untrackedFiles?.length || 0
        },
        pre_checks: preChecks,
        restoration_commands: commands,
        warnings: warnings,
        rollback_instructions: create_backup ? {
          description: 'To rollback if needed',
          commands: [
            `git checkout ${backupBranchName}`,
            `git branch -D ${repository.current_branch}`,
            `git checkout -b ${repository.current_branch}`
          ]
        } : null,
        execution_notes: dry_run ? 
          'DRY RUN: Commands generated but not marked for execution. Review and run manually.' :
          'IMPORTANT: This tool generates commands but does NOT execute them. Copy and run the commands in your terminal.'
      };

      this.logger.info('Restore commands generated', {
        project_path: validatedProjectPath,
        current_commit: currentCommitHash,
        target_commit: targetCommitHash,
        restore_method,
        dry_run
      });

      return this.createSuccessResponse(JSON.stringify(response, null, 2));

    } catch (error) {
      const sanitizedError = errorSanitizer.sanitizeError(error.message, { 
        operation: 'restore_project_state' 
      });
      
      this.logger.error('Failed to generate restore commands', {
        project_path,
        restore_point_id,
        commit_hash,
        error: sanitizedError,
        stack: error.stack
      });

      return this.createErrorResponse(`generating restore commands: ${sanitizedError}`);
    }
  }
}