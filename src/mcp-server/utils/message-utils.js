/**
 * Message processing utilities for AI Memory MCP Server
 * Handles token estimation, filtering, formatting, and pagination
 */

export class MessageUtils {
  /**
   * Estimate tokens for text content
   * @param {string} text - Text to estimate tokens for
   * @returns {number} Estimated token count
   */
  static estimateTokens(text) {
    if (!text) return 0;
    // Rough approximation: 1 token ≈ 4 characters
    return Math.ceil(text.length / 4);
  }

  /**
   * Filter messages based on criteria
   * @param {Array} messages - Messages to filter
   * @param {Object} options - Filtering options
   * @returns {Array} Filtered messages
   */
  static filterMessages(messages, options = {}) {
    const {
      content_types = [],
      exclude_long_messages = false,
      priority_messages = []
    } = options;

    let filtered = messages;

    // Filter by content types
    if (content_types.length > 0) {
      filtered = filtered.filter(msg => {
        if (!msg.role) return true;
        return content_types.includes(msg.role) || 
               content_types.includes(msg.type) ||
               (msg.role === 'assistant' && content_types.includes('assistant')) ||
               (msg.role === 'user' && content_types.includes('user')) ||
               (msg.type === 'tool_use' && content_types.includes('tool_calls')) ||
               (msg.type === 'tool_result' && content_types.includes('tool_results'));
      });
    }

    // Exclude long messages
    if (exclude_long_messages) {
      filtered = filtered.filter(msg => {
        const text = this.getMessageText(msg);
        return text.length <= 1000;
      });
    }

    // Add priority messages back if they were filtered out
    if (priority_messages.length > 0) {
      const priorityMsgs = [];
      
      if (priority_messages.includes('first') && messages.length > 0) {
        priorityMsgs.push(messages[0]);
      }
      if (priority_messages.includes('last') && messages.length > 0) {
        priorityMsgs.push(messages[messages.length - 1]);
      }
      if (priority_messages.includes('errors')) {
        const errorMsgs = messages.filter(msg => 
          this.getMessageText(msg).toLowerCase().includes('error') ||
          this.getMessageText(msg).toLowerCase().includes('failed') ||
          this.getMessageText(msg).toLowerCase().includes('exception')
        );
        priorityMsgs.push(...errorMsgs);
      }
      if (priority_messages.includes('important')) {
        const importantMsgs = messages.filter(msg => 
          this.getMessageText(msg).toLowerCase().includes('important') ||
          this.getMessageText(msg).toLowerCase().includes('critical') ||
          this.getMessageText(msg).toLowerCase().includes('warning')
        );
        priorityMsgs.push(...importantMsgs);
      }

      // Merge priority messages with filtered results (remove duplicates)
      const priorityIds = new Set(priorityMsgs.map((msg, i) => messages.indexOf(msg)));
      const filteredIds = new Set(filtered.map(msg => messages.indexOf(msg)));
      const combinedIds = new Set([...priorityIds, ...filteredIds]);
      
      filtered = messages.filter((msg, i) => combinedIds.has(i));
    }

    return filtered;
  }

  /**
   * Get text content from message
   * @param {Object} msg - Message object
   * @returns {string} Text content
   */
  static getMessageText(msg) {
    if (typeof msg.content === 'string') return msg.content;
    if (Array.isArray(msg.content)) {
      return msg.content.map(item => item.text || JSON.stringify(item)).join(' ');
    }
    return JSON.stringify(msg.content || {});
  }

  /**
   * Format message with summary mode
   * @param {Object} msg - Message to format
   * @param {string} summaryMode - Formatting mode
   * @returns {string} Formatted message text
   */
  static formatMessage(msg, summaryMode = 'full') {
    const text = this.getMessageText(msg);
    
    if (summaryMode === 'condensed') {
      return text.length > 100 ? text.substring(0, 100) + '...' : text;
    } else if (summaryMode === 'key_points_only') {
      if (text.length <= 200) return text;
      
      // Extract key points (lines starting with -, *, numbers, or containing keywords)
      const lines = text.split('\n');
      const keyLines = lines.filter(line => {
        const trimmed = line.trim();
        return trimmed.startsWith('-') || 
               trimmed.startsWith('*') || 
               trimmed.match(/^\d+\./) ||
               trimmed.toLowerCase().includes('important') ||
               trimmed.toLowerCase().includes('error') ||
               trimmed.toLowerCase().includes('result');
      });
      
      return keyLines.length > 0 ? keyLines.join('\n') : text.substring(0, 200) + '...';
    }
    
    return text; // full mode
  }

  /**
   * Smart pagination with token limiting
   * @param {Array} messages - Messages to paginate
   * @param {number} page - Page number (1-based)
   * @param {number} pageSize - Messages per page
   * @param {number} maxTokens - Maximum tokens per page
   * @returns {Object} Pagination result with messages and metadata
   */
  static paginateMessages(messages, page = 1, pageSize = 50, maxTokens = 20000) {
    const startIndex = (page - 1) * pageSize;
    let endIndex = Math.min(startIndex + pageSize, messages.length);
    
    // Adjust end index based on token limit
    let tokenCount = 0;
    for (let i = startIndex; i < endIndex; i++) {
      const messageTokens = this.estimateTokens(this.getMessageText(messages[i]));
      if (tokenCount + messageTokens > maxTokens && i > startIndex) {
        endIndex = i;
        break;
      }
      tokenCount += messageTokens;
    }
    
    const pageMessages = messages.slice(startIndex, endIndex);
    const totalPages = Math.ceil(messages.length / pageSize);
    
    return {
      messages: pageMessages,
      pagination: {
        current_page: page,
        total_pages: totalPages,
        page_size: pageSize,
        total_messages: messages.length,
        messages_in_page: pageMessages.length,
        has_next_page: page < totalPages,
        has_previous_page: page > 1,
        estimated_tokens: tokenCount,
        token_limit: maxTokens
      }
    };
  }
}