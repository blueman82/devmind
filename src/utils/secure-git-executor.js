import { execFileSync } from 'child_process';
import path from 'path';
import { createLogger } from './logger.js';
import errorSanitizer from './error-sanitizer.js';

export class SecureGitExecutor {
  constructor() {
    this.logger = createLogger('SecureGitExecutor');
    
    this.allowedCommands = new Set([
      'remote',
      'branch', 
      'log',
      'show',
      'status',
      'rev-parse',
      'config',
      'diff'
    ]);
    
    this.allowedSubcommands = new Map([
      ['remote', new Set(['get-url'])],
      ['branch', new Set(['--show-current'])],
      ['log', new Set(['-1', '--format=%H|%ad|%an|%ae|%s|%P', '--date=iso', '--since', '--until', '--author', '--grep', '--stat', '--'])],
      ['show', new Set(['--format=%H|%ad|%an|%ae|%s|%P', '--format=', '--name-status', '--stat'])],
      ['status', new Set(['--porcelain'])],
      ['rev-parse', new Set(['--show-toplevel', '--git-dir', 'HEAD'])],
      ['config', new Set(['--get', '--list'])],
      ['diff', new Set(['--name-status', '--stat', '--numstat'])]
    ]);
    
    this.maxTimeout = 10000; // 10 seconds max
    this.maxOutputSize = 1024 * 1024; // 1MB max output
  }

  validateCommand(command, args = []) {
    if (!command || typeof command !== 'string') {
      throw new Error('Invalid git command');
    }

    const sanitizedCommand = command.toLowerCase().trim();
    
    if (!this.allowedCommands.has(sanitizedCommand)) {
      throw new Error(`Git command '${sanitizedCommand}' is not allowed`);
    }

    if (args.length > 0) {
      for (const arg of args) {
        if (typeof arg !== 'string') {
          throw new Error('All git arguments must be strings');
        }
        
        if (arg.includes('`') || arg.includes('$(') || arg.includes(';') || arg.includes('&&') || arg.includes('||')) {
          throw new Error('Git arguments contain potentially dangerous characters');
        }
        
        if (arg.startsWith('--') && arg.includes('=')) {
          const [flagName] = arg.split('=');
          const allowedFlags = ['--since', '--until', '--author', '--grep', '--format', '--date'];
          if (!allowedFlags.includes(flagName)) {
            throw new Error(`Git flag '${flagName}' is not allowed`);
          }
        }
      }
    }

    return { command: sanitizedCommand, args };
  }

  validateWorkingDirectory(workingDirectory) {
    if (!workingDirectory || typeof workingDirectory !== 'string') {
      throw new Error('Working directory must be a valid string');
    }

    const resolvedPath = path.resolve(workingDirectory);
    
    if (resolvedPath.includes('..') || resolvedPath.includes('\0')) {
      throw new Error('Working directory contains invalid path elements');
    }

    return resolvedPath;
  }

  executeGitCommand(command, args = [], options = {}) {
    try {
      const { command: validatedCommand, args: validatedArgs } = this.validateCommand(command, args);
      const validatedWorkingDir = this.validateWorkingDirectory(options.cwd || process.cwd());
      
      const fullCommand = ['git', validatedCommand, ...validatedArgs].join(' ');
      
      const execOptions = {
        cwd: validatedWorkingDir,
        encoding: 'utf8',
        timeout: Math.min(options.timeout || 5000, this.maxTimeout),
        maxBuffer: this.maxOutputSize,
        stdio: ['ignore', 'pipe', 'pipe']
      };

      this.logger.debug('Executing secure git command', {
        command: validatedCommand,
        argsCount: validatedArgs.length,
        workingDirectory: '[SANITIZED]',
        timeout: execOptions.timeout,
        fullCommand: fullCommand // Add this for debugging
      });

      const startTime = Date.now();
      const result = execSync(fullCommand, execOptions);
      const executionTime = Date.now() - startTime;

      this.logger.debug('Git command executed successfully', {
        command: validatedCommand,
        executionTime,
        outputSize: result.length
      });

      return result.toString().trim();

    } catch (error) {
      const sanitizedError = errorSanitizer.sanitizeGitError(error.message, `git_${command}`);
      
      this.logger.error('Secure git command execution failed', {
        command,
        error: sanitizedError,
        timeout: error.code === 'TIMEOUT'
      });

      if (error.code === 'TIMEOUT') {
        throw new Error('Git operation timed out');
      } else if (error.code === 'ENOENT') {
        throw new Error('Git command not found');
      } else if (error.status !== 0) {
        throw new Error(sanitizedError);
      } else {
        throw new Error('Git command execution failed');
      }
    }
  }

  getRemoteUrl(workingDirectory, remoteName = 'origin') {
    if (!/^[a-zA-Z0-9_-]+$/.test(remoteName)) {
      throw new Error('Invalid remote name format');
    }
    
    try {
      return this.executeGitCommand('remote', ['get-url', remoteName], { 
        cwd: workingDirectory,
        timeout: 5000 
      });
    } catch (error) {
      return null;
    }
  }

  getCurrentBranch(workingDirectory) {
    try {
      return this.executeGitCommand('branch', ['--show-current'], { 
        cwd: workingDirectory,
        timeout: 5000 
      }) || 'HEAD';
    } catch (error) {
      return 'HEAD';
    }
  }

  getCommitHistory(workingDirectory, options = {}) {
    const args = ['--format=%H|%ad|%an|%ae|%s|%P', '--date=iso'];
    
    if (options.limit && Number.isInteger(options.limit) && options.limit > 0 && options.limit <= 1000) {
      args.push(`-${options.limit}`);
    }
    
    if (options.since && typeof options.since === 'string' && options.since.length < 50) {
      args.push(`--since=${options.since}`);
    }
    
    if (options.until && typeof options.until === 'string' && options.until.length < 50) {
      args.push(`--until=${options.until}`);
    }
    
    if (options.author && typeof options.author === 'string' && options.author.length < 100) {
      args.push(`--author=${options.author}`);
    }
    
    if (options.grep && typeof options.grep === 'string' && options.grep.length < 100) {
      args.push(`--grep=${options.grep}`);
    }
    
    // Add branch support for monorepo scenarios
    if (options.branch && typeof options.branch === 'string' && options.branch.length < 100) {
      // Add branch after log command but before other args
      args.unshift(options.branch);
    }
    
    // Add subdirectory filtering for monorepo support
    if (options.subdirectory && typeof options.subdirectory === 'string') {
      // Validate subdirectory path to prevent injection
      if (!/^[a-zA-Z0-9_\-\/\.]+$/.test(options.subdirectory)) {
        throw new Error('Invalid subdirectory path format');
      }
      // Add -- <path> at the end to filter commits affecting only this path
      args.push('--', options.subdirectory);
    }

    return this.executeGitCommand('log', args, { 
      cwd: workingDirectory,
      timeout: 10000 
    });
  }

  getCommitDetails(workingDirectory, commitHash) {
    if (!/^[a-f0-9]{7,40}$/.test(commitHash)) {
      throw new Error('Invalid commit hash format');
    }

    return this.executeGitCommand('show', [
      '--format=%H|%ad|%an|%ae|%s|%P',
      '--name-status',
      commitHash
    ], { 
      cwd: workingDirectory,
      timeout: 10000 
    });
  }

  getWorkingDirectoryStatus(workingDirectory) {
    return this.executeGitCommand('status', ['--porcelain'], { 
      cwd: workingDirectory,
      timeout: 5000 
    });
  }

  getCommitStats(workingDirectory, commitHash) {
    // Validate commit hash to prevent injection
    if (!/^[a-f0-9]{7,40}$/.test(commitHash)) {
      throw new Error('Invalid commit hash format');
    }

    return this.executeGitCommand('show', [
      '--stat',
      '--format=',
      commitHash
    ], { 
      cwd: workingDirectory,
      timeout: 10000 
    });
  }
}

export default new SecureGitExecutor();