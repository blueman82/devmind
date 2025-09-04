import { describe, test, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { promises as fs } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { execSync } from 'child_process';
import { GitToolHandlers } from '../mcp-server/handlers/git-tool-handlers.js';
import DatabaseManager from '../database/database-manager.js';
import GitSchema from '../database/git-schema.js';
import pathValidator from '../utils/path-validator.js';

describe('Git Integration and End-to-End Workflow Testing', () => {
  let tempDir;
  let tempDbPath;
  let dbManager;
  let gitSchema;
  let gitToolHandlers;
  let projectRepoPath;
  let monorepoPath;
  let featureRepoPath;
  let originalValidate;

  beforeAll(async () => {
    console.log('🔗 Setting up Git Integration test environment...');
    
    tempDir = join(tmpdir(), `integration-test-${Date.now()}`);
    tempDbPath = join(tmpdir(), `integration-${Date.now()}.db`);
    projectRepoPath = join(tempDir, 'main-project');
    monorepoPath = join(tempDir, 'monorepo-project');
    featureRepoPath = join(tempDir, 'feature-project');
    
    await fs.mkdir(projectRepoPath, { recursive: true });
    await fs.mkdir(monorepoPath, { recursive: true });
    await fs.mkdir(featureRepoPath, { recursive: true });
    
    // Setup main project repository with realistic development workflow
    console.log('📁 Creating main project repository...');
    await createMainProject(projectRepoPath);
    
    // Setup monorepo with multiple components
    console.log('📁 Creating monorepo with multiple components...');
    await createMonorepoProject(monorepoPath);
    
    // Setup feature branch repository
    console.log('📁 Creating feature branch repository...');
    await createFeatureProject(featureRepoPath);
    
    // Initialize database components
    dbManager = new DatabaseManager(tempDbPath);
    await dbManager.initialize();
    gitSchema = new GitSchema(dbManager.db);
    await gitSchema.initialize();
    
    gitToolHandlers = new GitToolHandlers(dbManager, gitSchema);
    
    // Mock path validator to allow test paths
    originalValidate = pathValidator.validateProjectPath;
    pathValidator.validateProjectPath = (path) => {
      if (path && path.includes('integration-test')) {
        return { isValid: true, normalizedPath: path, originalPath: path };
      }
      return originalValidate(path);
    };
    
    console.log('✅ Git Integration test environment ready');
  }, 180000); // 3 minute timeout for setup

  afterAll(async () => {
    console.log('🧹 Cleaning up Git Integration test environment...');
    
    // Restore original path validator
    if (originalValidate) {
      pathValidator.validateProjectPath = originalValidate;
    }
    
    // Close database
    if (dbManager) {
      dbManager.close();
    }
    
    // Clean up temp directory
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
      await fs.unlink(tempDbPath);
    } catch (error) {
      console.warn('Cleanup warning:', error.message);
    }
    
    console.log('✅ Git Integration cleanup complete');
  });

  beforeEach(async () => {
    // Clear integration test data before each test
    const clearStmts = [
      'DELETE FROM restore_points',
      'DELETE FROM git_commits',
      'DELETE FROM git_repositories'
    ];
    
    clearStmts.forEach(sql => {
      const stmt = dbManager.db.prepare(sql);
      stmt.run();
    });
  });

  // Helper function to create main project with realistic workflow
  async function createMainProject(repoPath) {
    execSync('git init', { cwd: repoPath });
    execSync('git config user.email "test@example.com"', { cwd: repoPath });
    execSync('git config user.name "Test User"', { cwd: repoPath });
    
    // Initial project structure
    await fs.writeFile(join(repoPath, 'README.md'), '# Main Project\n\nIntegration testing repository.\n');
    await fs.writeFile(join(repoPath, 'package.json'), JSON.stringify({
      name: 'main-project',
      version: '1.0.0',
      description: 'Integration test project'
    }, null, 2));
    
    await fs.mkdir(join(repoPath, 'src'), { recursive: true });
    await fs.writeFile(join(repoPath, 'src', 'index.js'), 'console.log("Hello World");');
    
    execSync('git add .', { cwd: repoPath });
    execSync('git commit -m "Initial commit: Project setup"', { cwd: repoPath });
    
    // Add feature development
    await fs.writeFile(join(repoPath, 'src', 'utils.js'), 'export function utils() { return "utils"; }');
    execSync('git add .', { cwd: repoPath });
    execSync('git commit -m "feat: Add utility functions"', { cwd: repoPath });
    
    // Add bug fixes
    await fs.writeFile(join(repoPath, 'src', 'index.js'), 'console.log("Hello World!");\n// Fixed typo');
    execSync('git add .', { cwd: repoPath });
    execSync('git commit -m "fix: Fix console message typo"', { cwd: repoPath });
    
    // Create development branch
    execSync('git checkout -b development', { cwd: repoPath });
    await fs.writeFile(join(repoPath, 'src', 'dev.js'), 'console.log("Development mode");');
    execSync('git add .', { cwd: repoPath });
    execSync('git commit -m "dev: Add development utilities"', { cwd: repoPath });
    
    // Switch back to main
    execSync('git checkout main', { cwd: repoPath });
  }

  // Helper function to create monorepo project
  async function createMonorepoProject(repoPath) {
    const components = ['frontend', 'backend', 'shared', 'documentation'];
    
    execSync('git init', { cwd: repoPath });
    execSync('git config user.email "test@example.com"', { cwd: repoPath });
    execSync('git config user.name "Test User"', { cwd: repoPath });
    
    // Create monorepo structure
    await fs.writeFile(join(repoPath, 'README.md'), '# Monorepo Integration Test\n\nMulti-component repository.\n');
    await fs.writeFile(join(repoPath, 'lerna.json'), JSON.stringify({
      version: '1.0.0',
      packages: components.map(c => `${c}/*`)
    }, null, 2));
    
    // Create each component
    for (const component of components) {
      const componentPath = join(repoPath, component);
      await fs.mkdir(componentPath, { recursive: true });
      
      await fs.writeFile(join(componentPath, 'package.json'), JSON.stringify({
        name: `@monorepo/${component}`,
        version: '1.0.0',
        description: `${component} component`
      }, null, 2));
      
      await fs.writeFile(join(componentPath, 'index.js'), `console.log("${component} component");`);
    }
    
    execSync('git add .', { cwd: repoPath });
    execSync('git commit -m "Initial commit: Monorepo structure"', { cwd: repoPath });
    
    // Add component-specific commits
    for (let i = 0; i < components.length; i++) {
      const component = components[i];
      await fs.writeFile(join(repoPath, component, 'feature.js'), `// ${component} feature\nexport const ${component}Feature = true;`);
      execSync('git add .', { cwd: repoPath });
      execSync(`git commit -m "${component}: Add feature module"`, { cwd: repoPath });
    }
  }

  // Helper function to create feature project with branches
  async function createFeatureProject(repoPath) {
    execSync('git init', { cwd: repoPath });
    execSync('git config user.email "test@example.com"', { cwd: repoPath });
    execSync('git config user.name "Test User"', { cwd: repoPath });
    
    // Main branch setup
    await fs.writeFile(join(repoPath, 'README.md'), '# Feature Project\n\nTesting feature branch workflows.\n');
    await fs.writeFile(join(repoPath, 'main.js'), 'console.log("Main application");');
    execSync('git add .', { cwd: repoPath });
    execSync('git commit -m "Initial commit: Main application"', { cwd: repoPath });
    
    // Create multiple feature branches
    const features = ['user-auth', 'payment-system', 'notifications'];
    
    for (const feature of features) {
      execSync(`git checkout -b feature/${feature}`, { cwd: repoPath });
      await fs.writeFile(join(repoPath, `${feature}.js`), `// ${feature} implementation\nexport const ${feature.replace('-', '')} = true;`);
      execSync('git add .', { cwd: repoPath });
      execSync(`git commit -m "feat(${feature}): Implement ${feature} functionality"`, { cwd: repoPath });
    }
    
    // Switch back to main
    execSync('git checkout main', { cwd: repoPath });
  }

  // Helper function to parse MCP response format
  const parseMCPResponse = (response) => {
    if (!response || !response.content || !response.content[0]) {
      return null;
    }
    try {
      // MCP responses have format: {content: [{type: 'text', text: JSON}]}
      const text = response.content[0].text;
      // Handle error responses that start with "Error: "
      if (text.startsWith('Error: ')) {
        return { error: text.substring(7), success: false };
      }
      return JSON.parse(text);
    } catch (e) {
      return null;
    }
  };

  describe('Complete Development Workflow Integration', () => {
    test('should handle full project lifecycle workflow', async () => {
      console.log('🔄 Testing complete project lifecycle workflow...');
      
      // Step 1: Initialize project context
      const initialContextResponse = await gitToolHandlers.handleGetGitContext({
        project_path: projectRepoPath
      });
      
      const initialContext = parseMCPResponse(initialContextResponse);
      expect(initialContext).toBeTruthy();
      expect(initialContext.repository || initialContext.summary).toBeDefined();
      
      // Step 2: Create initial restore point
      const initialRestoreResponse = await gitToolHandlers.handleCreateRestorePoint({
        project_path: projectRepoPath,
        label: 'initial-state',
        description: 'Project initial state',
        test_status: 'passing'
      });
      const initialRestore = parseMCPResponse(initialRestoreResponse);
      
      expect(initialRestore).toBeTruthy();
      expect(initialRestore.success).toBe(true);
      expect(initialRestore.restore_point.label).toBe('initial-state');
      
      // Step 3: Check branch context
      const branchContextResponse = await gitToolHandlers.handleGetGitContext({
        project_path: projectRepoPath,
        branch: 'development'
      });
      const branchContext = parseMCPResponse(branchContextResponse);
      
      expect(branchContext).toBeTruthy();
      
      // Step 4: List all restore points
      const restorePointsListResponse = await gitToolHandlers.handleListRestorePoints({
        project_path: projectRepoPath
      });
      const restorePointsList = parseMCPResponse(restorePointsListResponse);
      
      expect(restorePointsList).toBeTruthy();
      expect(restorePointsList.restore_points).toHaveLength(1);
      expect(restorePointsList.restore_points[0].label).toBe('initial-state');
      
      // Step 5: Create working state restore point
      const workingRestoreResponse = await gitToolHandlers.handleCreateRestorePoint({
        project_path: projectRepoPath,
        label: 'before-refactor',
        description: 'Before major refactoring',
        test_status: 'unknown'
      });
      const workingRestore = parseMCPResponse(workingRestoreResponse);
      
      expect(workingRestore).toBeTruthy();
      expect(workingRestore.success).toBe(true);
      
      // Step 6: Verify complete workflow
      const finalContextResponse = await gitToolHandlers.handleGetGitContext({
        project_path: projectRepoPath,
        commit_limit: 10
      });
      const finalContext = parseMCPResponse(finalContextResponse);
      
      expect(finalContext).toBeTruthy();
      expect(finalContext.commits || finalContext.summary).toBeDefined();
      expect(finalContext.git_context.commits.length).toBeGreaterThan(0);
      
      console.log('✅ Complete project lifecycle workflow successful');
    });

    test('should handle monorepo component workflows', async () => {
      console.log('🔄 Testing monorepo component workflows...');
      
      // Test each component independently
      const components = ['frontend', 'backend', 'shared', 'documentation'];
      
      for (const component of components) {
        const componentPath = join(monorepoPath, component);
        
        // Get component-specific context
        const componentContextResponse = await gitToolHandlers.handleGetGitContext({
          project_path: componentPath,
          subdirectory: component
        });
        const componentContext = parseMCPResponse(componentContextResponse);
        
        expect(componentContext).toBeTruthy();
        
        // Create component-specific restore point
        const componentRestoreResponse = await gitToolHandlers.handleCreateRestorePoint({
          project_path: componentPath,
          label: `${component}-stable`,
          description: `Stable state for ${component} component`
        });
        const componentRestore = parseMCPResponse(componentRestoreResponse);
        
        expect(componentRestore).toBeTruthy();
        expect(componentRestore.success).toBe(true);
        expect(componentRestore.restore_point.label).toBe(`${component}-stable`);
      }
      
      // Test monorepo root context
      const rootContextResponse = await gitToolHandlers.handleGetGitContext({
        project_path: monorepoPath
      });
      const rootContext = parseMCPResponse(rootContextResponse);
      
      expect(rootContext).toBeTruthy();
      expect(rootContext.repository || rootContext.summary).toBeDefined();
      
      console.log('✅ Monorepo component workflows successful');
    });

    test('should handle feature branch development workflow', async () => {
      console.log('🔄 Testing feature branch development workflow...');
      
      const features = ['user-auth', 'payment-system', 'notifications'];
      
      for (const feature of features) {
        // Get feature branch context
        const featureContextResponse = await gitToolHandlers.handleGetGitContext({
          project_path: featureRepoPath,
          branch: `feature/${feature}`
        });
        const featureContext = parseMCPResponse(featureContextResponse);
        
        expect(featureContext).toBeTruthy();
        
        // Create feature-specific restore point
        const featureRestoreResponse = await gitToolHandlers.handleCreateRestorePoint({
          project_path: featureRepoPath,
          label: `feature-${feature}-ready`,
          description: `Feature ${feature} ready for review`,
          test_status: 'passing'
        });
        const featureRestore = parseMCPResponse(featureRestoreResponse);
        
        expect(featureRestore).toBeTruthy();
        expect(featureRestore.success).toBe(true);
      }
      
      // List all feature restore points
      const allFeatureRestoresResponse = await gitToolHandlers.handleListRestorePoints({
        project_path: featureRepoPath
      });
      const allFeatureRestores = parseMCPResponse(allFeatureRestoresResponse);
      
      expect(allFeatureRestores).toBeTruthy();
      expect(allFeatureRestores.restore_points.length).toBe(features.length);
      
      console.log('✅ Feature branch development workflow successful');
    });
  });

  describe('Cross-Project Integration Testing', () => {
    test('should handle multiple projects simultaneously', async () => {
      console.log('🔄 Testing multiple projects simultaneously...');
      
      const projects = [
        { path: projectRepoPath, name: 'main-project' },
        { path: monorepoPath, name: 'monorepo-project' },
        { path: featureRepoPath, name: 'feature-project' }
      ];
      
      // Process all projects concurrently
      const contextPromises = projects.map(project =>
        gitToolHandlers.handleGetGitContext({
          project_path: project.path,
          limit: 5
        })
      );
      
      const contextResults = await Promise.all(contextPromises);
      
      // Verify all projects were processed successfully
      contextResults.forEach((result, index) => {
        expect(result.success).toBe(true);
        expect(result.git_context).toBeDefined();
        console.log(`📊 ${projects[index].name}: ${result.git_context.commits?.length || 0} commits`);
      });
      
      // Create restore points for all projects
      const restorePromises = projects.map((project, index) =>
        gitToolHandlers.handleCreateRestorePoint({
          project_path: project.path,
          label: `cross-project-${index + 1}`,
          description: `Cross-project integration test for ${project.name}`
        })
      );
      
      const restoreResults = await Promise.all(restorePromises);
      
      // Verify all restore points were created
      restoreResults.forEach(result => {
        expect(result.success).toBe(true);
        expect(result.restore_point).toBeDefined();
      });
      
      console.log('✅ Multiple projects simultaneous processing successful');
    });

    test('should maintain data integrity across projects', async () => {
      console.log('🔄 Testing data integrity across projects...');
      
      const projects = [projectRepoPath, monorepoPath, featureRepoPath];
      const allRestorePoints = [];
      
      // Create restore points for each project
      for (let i = 0; i < projects.length; i++) {
        const result = await gitToolHandlers.handleCreateRestorePoint({
          project_path: projects[i],
          label: `integrity-test-${i + 1}`,
          description: `Data integrity test ${i + 1}`
        });
        
        expect(result.success).toBe(true);
        allRestorePoints.push(result.restore_point);
      }
      
      // Verify each project's restore points are isolated
      for (let i = 0; i < projects.length; i++) {
        const projectRestores = await gitToolHandlers.handleListRestorePoints({
          project_path: projects[i]
        });
        
        expect(projectRestores.success).toBe(true);
        expect(projectRestores.restore_points.some(rp => rp.label === `integrity-test-${i + 1}`)).toBe(true);
      }
      
      // Verify no cross-contamination between projects
      const project1Restores = await gitToolHandlers.handleListRestorePoints({
        project_path: projects[0]
      });
      
      const project1Labels = project1Restores.restore_points.map(rp => rp.label);
      expect(project1Labels.includes('integrity-test-2')).toBe(false);
      expect(project1Labels.includes('integrity-test-3')).toBe(false);
      
      console.log('✅ Data integrity across projects maintained');
    });

    test('should handle concurrent operations across projects', async () => {
      console.log('🔄 Testing concurrent operations across projects...');
      
      const concurrentOps = [
        // Git context operations
        gitToolHandlers.handleGetGitContext({ project_path: projectRepoPath, limit: 10 }),
        gitToolHandlers.handleGetGitContext({ project_path: monorepoPath, limit: 10 }),
        gitToolHandlers.handleGetGitContext({ project_path: featureRepoPath, limit: 10 }),
        
        // Restore point operations
        gitToolHandlers.handleCreateRestorePoint({
          project_path: projectRepoPath,
          label: 'concurrent-1',
          description: 'Concurrent operation 1'
        }),
        gitToolHandlers.handleCreateRestorePoint({
          project_path: monorepoPath,
          label: 'concurrent-2',
          description: 'Concurrent operation 2'
        }),
        
        // List operations
        gitToolHandlers.handleListRestorePoints({ project_path: projectRepoPath }),
        gitToolHandlers.handleListRestorePoints({ project_path: monorepoPath })
      ];
      
      const results = await Promise.all(concurrentOps);
      
      // Verify all operations completed successfully
      const successCount = results.filter(result => result.success).length;
      expect(successCount).toBeGreaterThan(results.length * 0.8); // 80% success rate minimum
      
      console.log(`📊 Concurrent operations: ${successCount}/${results.length} successful`);
      console.log('✅ Concurrent operations across projects successful');
    });
  });

  describe('End-to-End User Scenarios', () => {
    test('should handle typical developer daily workflow', async () => {
      console.log('🔄 Testing typical developer daily workflow...');
      
      const workflowSteps = [];
      
      // Step 1: Start of day - check project status
      const morningContext = await gitToolHandlers.handleGetGitContext({
        project_path: projectRepoPath
      });
      workflowSteps.push({ step: 'morning_context', success: morningContext.success });
      
      // Step 2: Create restore point before starting work
      const preWorkRestore = await gitToolHandlers.handleCreateRestorePoint({
        project_path: projectRepoPath,
        label: 'start-of-day',
        description: 'Clean state before starting daily work'
      });
      workflowSteps.push({ step: 'pre_work_restore', success: preWorkRestore.success });
      
      // Step 3: Work on feature branch
      const featureBranchContext = await gitToolHandlers.handleGetGitContext({
        project_path: projectRepoPath,
        branch: 'development'
      });
      workflowSteps.push({ step: 'feature_branch_context', success: featureBranchContext.success });
      
      // Step 4: Create milestone restore point
      const milestoneRestore = await gitToolHandlers.handleCreateRestorePoint({
        project_path: projectRepoPath,
        label: 'feature-milestone',
        description: 'Feature development milestone reached',
        test_status: 'passing'
      });
      workflowSteps.push({ step: 'milestone_restore', success: milestoneRestore.success });
      
      // Step 5: Review daily progress
      const dailyRestores = await gitToolHandlers.handleListRestorePoints({
        project_path: projectRepoPath,
        timeframe: 'today'
      });
      workflowSteps.push({ step: 'daily_review', success: dailyRestores.success });
      
      // Step 6: End of day - create final restore point
      const endOfDayRestore = await gitToolHandlers.handleCreateRestorePoint({
        project_path: projectRepoPath,
        label: 'end-of-day',
        description: 'End of day state - work in progress saved'
      });
      workflowSteps.push({ step: 'end_of_day_restore', success: endOfDayRestore.success });
      
      // Verify complete workflow success
      const successfulSteps = workflowSteps.filter(step => step.success).length;
      expect(successfulSteps).toBe(workflowSteps.length);
      
      console.log('📊 Developer workflow steps completed:', workflowSteps.map(s => `${s.step}: ${s.success ? '✅' : '❌'}`).join(', '));
      console.log('✅ Typical developer daily workflow successful');
    });

    test('should handle emergency rollback scenario', async () => {
      console.log('🔄 Testing emergency rollback scenario...');
      
      // Step 1: Create stable state restore point
      const stableState = await gitToolHandlers.handleCreateRestorePoint({
        project_path: projectRepoPath,
        label: 'stable-release',
        description: 'Stable release before risky changes',
        test_status: 'passing'
      });
      
      expect(stableState.success).toBe(true);
      
      // Step 2: Create problematic state restore point
      const problematicState = await gitToolHandlers.handleCreateRestorePoint({
        project_path: projectRepoPath,
        label: 'risky-experiment',
        description: 'Experimental changes that might fail',
        test_status: 'failing'
      });
      
      expect(problematicState.success).toBe(true);
      
      // Step 3: Emergency - need to find stable restore points
      const stableRestores = await gitToolHandlers.handleListRestorePoints({
        project_path: projectRepoPath,
        limit: 10
      });
      
      expect(stableRestores.success).toBe(true);
      
      const stablePoint = stableRestores.restore_points.find(rp => 
        rp.label === 'stable-release' && rp.test_status === 'passing'
      );
      
      expect(stablePoint).toBeDefined();
      
      // Step 4: Preview what rollback would change
      const rollbackPreview = await gitToolHandlers.handlePreviewRestore({
        project_path: projectRepoPath,
        restore_point_id: stablePoint.id
      });
      
      expect(rollbackPreview.success).toBe(true);
      
      // Step 5: Generate rollback commands (dry run)
      const rollbackCommands = await gitToolHandlers.handleRestoreProjectState({
        project_path: projectRepoPath,
        restore_point_id: stablePoint.id,
        dry_run: true,
        restore_method: 'safe'
      });
      
      expect(rollbackCommands.success).toBe(true);
      expect(rollbackCommands.commands).toBeDefined();
      expect(Array.isArray(rollbackCommands.commands)).toBe(true);
      
      console.log('✅ Emergency rollback scenario handled successfully');
    });

    test('should handle team collaboration workflow', async () => {
      console.log('🔄 Testing team collaboration workflow...');
      
      // Simulate multiple team members working on different parts
      const teamMembers = [
        { name: 'alice', component: 'frontend' },
        { name: 'bob', component: 'backend' },
        { name: 'carol', component: 'shared' }
      ];
      
      // Each team member creates their own restore points
      for (const member of teamMembers) {
        const memberRestore = await gitToolHandlers.handleCreateRestorePoint({
          project_path: join(monorepoPath, member.component),
          label: `${member.name}-feature-complete`,
          description: `${member.name}'s feature work completed in ${member.component}`,
          test_status: 'passing'
        });
        
        expect(memberRestore.success).toBe(true);
      }
      
      // Team lead reviews all components
      const allComponents = teamMembers.map(m => m.component);
      const componentContexts = [];
      
      for (const component of allComponents) {
        const componentContext = await gitToolHandlers.handleGetGitContext({
          project_path: join(monorepoPath, component),
          subdirectory: component
        });
        
        expect(componentContext.success).toBe(true);
        componentContexts.push(componentContext);
      }
      
      // Create integration milestone
      const integrationMilestone = await gitToolHandlers.handleCreateRestorePoint({
        project_path: monorepoPath,
        label: 'sprint-integration',
        description: 'All team features integrated successfully'
      });
      
      expect(integrationMilestone.success).toBe(true);
      
      // Verify team collaboration data integrity
      const allRestores = await gitToolHandlers.handleListRestorePoints({
        project_path: monorepoPath
      });
      
      expect(allRestores.success).toBe(true);
      const integrationPoint = allRestores.restore_points.find(rp => rp.label === 'sprint-integration');
      expect(integrationPoint).toBeDefined();
      
      console.log('✅ Team collaboration workflow successful');
    });

    test('should handle continuous integration workflow', async () => {
      console.log('🔄 Testing continuous integration workflow...');
      
      const ciSteps = [
        { label: 'pre-build', status: 'unknown' },
        { label: 'build-complete', status: 'passing' },
        { label: 'tests-passed', status: 'passing' },
        { label: 'deployment-ready', status: 'passing' }
      ];
      
      // Simulate CI pipeline creating restore points at each stage
      const ciResults = [];
      
      for (const step of ciSteps) {
        const ciRestore = await gitToolHandlers.handleCreateRestorePoint({
          project_path: projectRepoPath,
          label: `ci-${step.label}`,
          description: `CI pipeline - ${step.label} stage`,
          test_status: step.status,
          auto_generated: true
        });
        
        expect(ciRestore.success).toBe(true);
        ciResults.push(ciRestore);
      }
      
      // Verify CI restore points are marked as auto-generated
      const ciRestores = await gitToolHandlers.handleListRestorePoints({
        project_path: projectRepoPath,
        include_auto_generated: true
      });
      
      expect(ciRestores.success).toBe(true);
      
      const autoCiPoints = ciRestores.restore_points.filter(rp => 
        rp.auto_generated && rp.label.startsWith('ci-')
      );
      
      expect(autoCiPoints.length).toBe(ciSteps.length);
      
      // Test excluding auto-generated points (for developer view)
      const developerView = await gitToolHandlers.handleListRestorePoints({
        project_path: projectRepoPath,
        include_auto_generated: false
      });
      
      expect(developerView.success).toBe(true);
      
      const manualPoints = developerView.restore_points.filter(rp => !rp.auto_generated);
      expect(manualPoints.length).toBeGreaterThan(0);
      
      console.log('✅ Continuous integration workflow successful');
    });
  });

  describe('System Resilience and Recovery', () => {
    test('should handle system recovery after database issues', async () => {
      console.log('🔄 Testing system recovery after database issues...');
      
      // Create initial state
      const initialRestore = await gitToolHandlers.handleCreateRestorePoint({
        project_path: projectRepoPath,
        label: 'before-db-issue',
        description: 'State before simulated database issue'
      });
      
      expect(initialRestore.success).toBe(true);
      
      // Simulate database connection issue and recovery
      const originalDb = gitToolHandlers.dbManager;
      gitToolHandlers.dbManager = null;
      
      // Attempt operation during "outage"
      const duringOutage = await gitToolHandlers.handleCreateRestorePoint({
        project_path: projectRepoPath,
        label: 'during-outage',
        description: 'Should fail during outage'
      });
      
      expect(duringOutage.success).toBe(false);
      
      // Restore database connection
      gitToolHandlers.dbManager = originalDb;
      
      // Verify system recovery
      const afterRecovery = await gitToolHandlers.handleCreateRestorePoint({
        project_path: projectRepoPath,
        label: 'after-recovery',
        description: 'State after database recovery'
      });
      
      expect(afterRecovery.success).toBe(true);
      
      // Verify data integrity maintained
      const allRestores = await gitToolHandlers.handleListRestorePoints({
        project_path: projectRepoPath
      });
      
      expect(allRestores.success).toBe(true);
      const beforeIssue = allRestores.restore_points.find(rp => rp.label === 'before-db-issue');
      const afterIssue = allRestores.restore_points.find(rp => rp.label === 'after-recovery');
      
      expect(beforeIssue).toBeDefined();
      expect(afterIssue).toBeDefined();
      
      console.log('✅ System recovery after database issues successful');
    });

    test('should maintain functionality under resource constraints', async () => {
      console.log('🔄 Testing functionality under resource constraints...');
      
      // Create many concurrent operations to stress test the system
      const stressOps = [];
      const opCount = 25;
      
      for (let i = 0; i < opCount; i++) {
        if (i % 3 === 0) {
          stressOps.push(gitToolHandlers.handleGetGitContext({
            project_path: projectRepoPath,
            limit: 5
          }));
        } else if (i % 3 === 1) {
          stressOps.push(gitToolHandlers.handleCreateRestorePoint({
            project_path: projectRepoPath,
            label: `stress-test-${i}`,
            description: `Stress test operation ${i}`
          }));
        } else {
          stressOps.push(gitToolHandlers.handleListRestorePoints({
            project_path: projectRepoPath,
            limit: 10
          }));
        }
      }
      
      const stressResults = await Promise.all(stressOps);
      
      // System should maintain reasonable success rate even under stress
      const successCount = stressResults.filter(result => result.success).length;
      const successRate = successCount / stressResults.length;
      
      expect(successRate).toBeGreaterThan(0.7); // 70% success rate minimum under stress
      
      console.log(`📊 Stress test: ${successCount}/${opCount} operations successful (${(successRate * 100).toFixed(1)}% success rate)`);
      console.log('✅ Functionality under resource constraints maintained');
    });
  });
});