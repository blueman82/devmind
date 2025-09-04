import { test, describe, expect } from 'vitest';
import { spawn } from 'child_process';
import { join } from 'path';
import { promises as fs } from 'fs';
import { tmpdir } from 'os';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('MCP Server Integration Tests', () => {
  let mcpProcess;
  let tempDbPath;

  test('setup test environment', async () => {
    tempDbPath = join(tmpdir(), `test-mcp-${Date.now()}.db`);
    process.env.DB_PATH = tempDbPath;
    console.log(`Test MCP database: ${tempDbPath}`);
  });

  test('MCP server starts without errors', { timeout: 10000 }, async () => {
    const serverPath = join(__dirname, '../mcp-server/mcp-server.js');
    
    return new Promise((resolve, reject) => {
      mcpProcess = spawn('node', [serverPath], {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env, LOG_LEVEL: 'error' }
      });

      let stdoutData = '';
      let stderrData = '';
      let hasStarted = false;
      let timeout;

      mcpProcess.stdout.on('data', (data) => {
        stdoutData += data.toString();
      });

      mcpProcess.stderr.on('data', (data) => {
        const text = data.toString();
        stderrData += text;
        
        if (text.includes('AI Memory MCP Server running on stdio') && !hasStarted) {
          hasStarted = true;
          clearTimeout(timeout);
          console.log('✅ MCP Server started successfully');
          resolve();
        }
      });

      mcpProcess.on('error', (error) => {
        clearTimeout(timeout);
        reject(new Error(`MCP Server failed to start: ${error.message}`));
      });

      mcpProcess.on('exit', (code) => {
        if (!hasStarted) {
          clearTimeout(timeout);
          reject(new Error(`MCP Server exited with code ${code}. stderr: ${stderrData}`));
        }
      });

      // Set timeout for server startup
      timeout = setTimeout(() => {
        if (!hasStarted) {
          mcpProcess.kill();
          reject(new Error('MCP Server startup timeout'));
        }
      }, 8000);
    });
  });

  test('MCP server responds to list_tools request', { timeout: 5000 }, async () => {
    if (!mcpProcess) {
      throw new Error('MCP Server not running');
    }

    const request = {
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/list',
      params: {}
    };

    return new Promise((resolve, reject) => {
      let responseData = '';
      let timeout;

      const dataHandler = (data) => {
        responseData += data.toString();
        
        try {
          const lines = responseData.split('\n').filter(line => line.trim());
          for (const line of lines) {
            const response = JSON.parse(line);
            if (response.id === 1 && response.result) {
              clearTimeout(timeout);
              mcpProcess.stdout.removeListener('data', dataHandler);
              
              // Verify expected tools are present
              const tools = response.result.tools;
              expect(Array.isArray(tools)).toBe(true); // Tools should be an array
              expect(tools.length).toBeGreaterThan(0); // Should have at least one tool
              
              const toolNames = tools.map(t => t.name);
              expect(toolNames.includes('search_conversations')).toBe(true); // Should include search_conversations tool
              expect(toolNames.includes('get_conversation_context')).toBe(true); // Should include get_conversation_context tool
              
              console.log('✅ MCP Server tools verified:', toolNames.join(', '));
              resolve();
              return;
            }
          }
        } catch {
          // Continue waiting for more data
        }
      };

      mcpProcess.stdout.on('data', dataHandler);

      // Send request
      mcpProcess.stdin.write(JSON.stringify(request) + '\n');

      // Set timeout
      timeout = setTimeout(() => {
        mcpProcess.stdout.removeListener('data', dataHandler);
        reject(new Error('MCP Server list_tools request timeout'));
      }, 4000);
    });
  });

  test('cleanup MCP server process', async () => {
    if (mcpProcess && !mcpProcess.killed) {
      mcpProcess.kill('SIGTERM');
      
      // Wait for process to exit
      await new Promise((resolve) => {
        mcpProcess.on('exit', resolve);
        setTimeout(resolve, 1000); // Fallback timeout
      });
      
      console.log('✅ MCP Server process cleaned up');
    }

    // Clean up test database
    try {
      await fs.unlink(tempDbPath);
      console.log('✅ Test database cleaned up');
    } catch {
      // Ignore cleanup errors
    }
  });
});