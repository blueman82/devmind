#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import os from 'os';

// Simple JSONL conversation parser
class ConversationParser {
  constructor() {
    this.claudeProjectsDir = path.join(os.homedir(), '.claude', 'projects');
  }

  // Parse a single JSONL file
  parseConversation(filePath) {
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.trim().split('\n');
    
    const conversation = {
      sessionId: null,
      projectPath: null,
      messages: [],
      startTime: null,
      endTime: null,
      messageCount: 0
    };

    for (const line of lines) {
      try {
        const msg = JSON.parse(line);
        
        // Extract session info from first message
        if (!conversation.sessionId) {
          conversation.sessionId = msg.sessionId;
          conversation.projectPath = msg.cwd;
          conversation.startTime = msg.timestamp;
        }
        
        // Update end time
        conversation.endTime = msg.timestamp;
        conversation.messageCount++;
        
        // Extract meaningful content
        const parsed = {
          uuid: msg.uuid,
          timestamp: msg.timestamp,
          type: msg.type,
          role: msg.message?.role,
          content: this.extractContent(msg.message?.content)
        };
        
        conversation.messages.push(parsed);
        
      } catch (error) {
        console.warn(`Skipping invalid JSON line: ${error.message}`);
      }
    }
    
    return conversation;
  }

  // Extract meaningful content from message
  extractContent(content) {
    if (!content || !Array.isArray(content)) return null;
    
    const extracted = {
      text: [],
      toolCalls: [],
      toolResults: [],
      fileReferences: []
    };
    
    for (const item of content) {
      if (item.type === 'text') {
        extracted.text.push(item.text);
      } else if (item.type === 'tool_use') {
        extracted.toolCalls.push({
          name: item.name,
          input: item.input
        });
        
        // Extract file references from tool calls
        if (item.input?.file_path) {
          extracted.fileReferences.push(item.input.file_path);
        }
        if (item.input?.pattern) {
          extracted.fileReferences.push(`pattern:${item.input.pattern}`);
        }
      } else if (item.type === 'tool_result') {
        const content = typeof item.content === 'string' 
          ? item.content.substring(0, 200) + '...' 
          : JSON.stringify(item.content).substring(0, 200) + '...';
        extracted.toolResults.push({
          content: content
        });
      }
    }
    
    return extracted;
  }

  // Find all conversation files
  findConversationFiles() {
    if (!fs.existsSync(this.claudeProjectsDir)) {
      throw new Error('Claude projects directory not found');
    }
    
    const projects = fs.readdirSync(this.claudeProjectsDir);
    const conversations = [];
    
    for (const project of projects) {
      const projectDir = path.join(this.claudeProjectsDir, project);
      if (!fs.statSync(projectDir).isDirectory()) continue;
      
      const files = fs.readdirSync(projectDir);
      for (const file of files) {
        if (file.endsWith('.jsonl')) {
          conversations.push({
            projectHash: project,
            filePath: path.join(projectDir, file),
            fileName: file
          });
        }
      }
    }
    
    return conversations;
  }

  // Simple search across conversations
  searchConversations(query, timeframe = null) {
    const files = this.findConversationFiles();
    const results = [];
    
    for (const file of files) {
      try {
        const conversation = this.parseConversation(file.filePath);
        
        // Time filter
        if (timeframe) {
          const cutoff = this.parseTimeframe(timeframe);
          if (new Date(conversation.startTime) < cutoff) continue;
        }
        
        // Search in text content
        const hasMatch = conversation.messages.some(msg => {
          const textContent = msg.content?.text?.join(' ') || '';
          return textContent.toLowerCase().includes(query.toLowerCase());
        });
        
        if (hasMatch) {
          results.push({
            sessionId: conversation.sessionId,
            projectPath: conversation.projectPath,
            startTime: conversation.startTime,
            messageCount: conversation.messageCount,
            preview: this.getConversationPreview(conversation)
          });
        }
        
      } catch (error) {
        console.warn(`Error parsing ${file.filePath}: ${error.message}`);
      }
    }
    
    return results;
  }

  // Get conversation preview (first user message)
  getConversationPreview(conversation) {
    const userMessage = conversation.messages.find(msg => msg.type === 'user');
    if (userMessage?.content?.text) {
      return userMessage.content.text[0]?.substring(0, 100) + '...';
    }
    return 'No preview available';
  }

  // Parse timeframe strings like "2 hours ago", "yesterday"
  parseTimeframe(timeframe) {
    const now = new Date();
    
    if (timeframe.includes('hour')) {
      const hours = parseInt(timeframe) || 1;
      return new Date(now - hours * 60 * 60 * 1000);
    } else if (timeframe.includes('day')) {
      const days = parseInt(timeframe) || 1;
      return new Date(now - days * 24 * 60 * 60 * 1000);
    } else if (timeframe === 'yesterday') {
      return new Date(now - 24 * 60 * 60 * 1000);
    }
    
    return new Date(0); // Default to beginning of time
  }

  // List all projects
  listProjects() {
    const files = this.findConversationFiles();
    const projects = new Map();
    
    for (const file of files) {
      try {
        const conversation = this.parseConversation(file.filePath);
        if (!projects.has(conversation.projectPath)) {
          projects.set(conversation.projectPath, {
            path: conversation.projectPath,
            conversationCount: 0,
            lastActivity: null
          });
        }
        
        const project = projects.get(conversation.projectPath);
        project.conversationCount++;
        
        if (!project.lastActivity || 
            new Date(conversation.endTime) > new Date(project.lastActivity)) {
          project.lastActivity = conversation.endTime;
        }
        
      } catch (error) {
        console.warn(`Error processing ${file.filePath}: ${error.message}`);
      }
    }
    
    return Array.from(projects.values());
  }
}

// CLI interface for testing
if (import.meta.url === `file://${process.argv[1]}`) {
  const parser = new ConversationParser();
  const command = process.argv[2];
  
  try {
    switch (command) {
      case 'list':
        console.log('Available conversation files:');
        const files = parser.findConversationFiles();
        files.forEach(f => console.log(`  ${f.projectHash}/${f.fileName}`));
        break;
        
      case 'projects':
        console.log('Projects with conversations:');
        const projects = parser.listProjects();
        projects.forEach(p => {
          const projectName = p.path ? path.basename(p.path) : 'Unknown';
          console.log(`  ${projectName} (${p.conversationCount} conversations)`);
          console.log(`    Path: ${p.path || 'Unknown'}`);
          console.log(`    Last activity: ${p.lastActivity}`);
        });
        break;
        
      case 'search':
        const query = process.argv[3];
        const timeframe = process.argv[4];
        if (!query) {
          console.log('Usage: node conversation-parser.js search <query> [timeframe]');
          process.exit(1);
        }
        
        console.log(`Searching for: "${query}"`);
        const results = parser.searchConversations(query, timeframe);
        console.log(`Found ${results.length} conversations:`);
        
        results.forEach(r => {
          console.log(`\n  Session: ${r.sessionId}`);
          console.log(`  Project: ${path.basename(r.projectPath)}`);
          console.log(`  Time: ${r.startTime}`);
          console.log(`  Preview: ${r.preview}`);
        });
        break;
        
      case 'parse':
        const filePath = process.argv[3];
        if (!filePath) {
          console.log('Usage: node conversation-parser.js parse <file-path>');
          process.exit(1);
        }
        
        const conversation = parser.parseConversation(filePath);
        console.log(JSON.stringify(conversation, null, 2));
        break;
        
      default:
        console.log('Usage:');
        console.log('  node conversation-parser.js list');
        console.log('  node conversation-parser.js projects');
        console.log('  node conversation-parser.js search <query> [timeframe]');
        console.log('  node conversation-parser.js parse <file-path>');
    }
    
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

export default ConversationParser;