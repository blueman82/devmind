ProcessManager: startMCPServer() called
ProcessManager: Current serverStatus = stopped
MCPClient connection status updated: false → false
MCPClient isConnected property is now: false
MCPClient connection status updated: false → false
MCPClient isConnected property is now: false
ProcessManager: readabilityHandler called
ProcessManager: availableData size = 122 bytes
ProcessManager: raw output = '00:30:34 [[32minfo[39m] [ConfigValidator]: [32mConfiguration validation passed[39m {"errors":0,"warnings":0,"info":8}
'
ProcessManager: output.isEmpty = false
MCP Server Output: 00:30:34 [[32minfo[39m] [ConfigValidator]: [32mConfiguration validation passed[39m {"errors":0,"warnings":0,"info":8}

ProcessManager: readabilityHandler called
ProcessManager: availableData size = 36 bytes
ProcessManager: raw output = '✅ Configuration validation passed
'
ProcessManager: output.isEmpty = false
ProcessManager: readabilityHandler called
ProcessManager: availableData size = 97 bytes
ProcessManager: raw output = '00:30:34 [[32minfo[39m] [ConfigValidator]: [32mApplication startup validation successful[39m
'
ProcessManager: output.isEmpty = false
ProcessManager: readabilityHandler called
ProcessManager: availableData size = 76 bytes
ProcessManager: raw output = '00:30:34 [[32minfo[39m] [MCPServer]: [32mHealth checker initialized[39m
'
ProcessManager: output.isEmpty = false
ProcessManager: readabilityHandler called
ProcessManager: availableData size = 72 bytes
ProcessManager: raw output = '00:30:34 [[32minfo[39m] [MCPServer]: [32mMCP Server starting up[39m
'
ProcessManager: output.isEmpty = false
ProcessManager: readabilityHandler called
ProcessManager: availableData size = 89 bytes
ProcessManager: raw output = '00:30:34 [[32minfo[39m] [MCPServer]: [32mMCP Server connected on stdio transport[39m
'
ProcessManager: output.isEmpty = false
ProcessManager: ERROR readabilityHandler called
ProcessManager: ERROR availableData size = 38 bytes
ProcessManager: ERROR raw output = 'AI Memory MCP Server running on stdio
'
ProcessManager: cleaned output = '00:30:34 [info] [ConfigValidator]: Configuration validation passed {"errors":0,"warnings":0,"info":8}
'
ProcessManager: Checking patterns:
ProcessManager:   - Pattern1 'MCP Server connected on stdio transport': false
ProcessManager:   - Pattern2 'AI Memory MCP Server running on stdio': false
ProcessManager:   - Current serverStatus: Starting...
ProcessManager: ❌ No startup patterns found in this output
MCP Server Output: ✅ Configuration validation passed

ProcessManager: cleaned output = '✅ Configuration validation passed
'
ProcessManager: Checking patterns:
ProcessManager:   - Pattern1 'MCP Server connected on stdio transport': false
ProcessManager:   - Pattern2 'AI Memory MCP Server running on stdio': false
ProcessManager:   - Current serverStatus: Starting...
ProcessManager: ❌ No startup patterns found in this output
MCP Server Output: 00:30:34 [[32minfo[39m] [ConfigValidator]: [32mApplication startup validation successful[39m

ProcessManager: cleaned output = '00:30:34 [info] [ConfigValidator]: Application startup validation successful
'
ProcessManager: Checking patterns:
ProcessManager:   - Pattern1 'MCP Server connected on stdio transport': false
ProcessManager:   - Pattern2 'AI Memory MCP Server running on stdio': false
ProcessManager:   - Current serverStatus: Starting...
ProcessManager: ❌ No startup patterns found in this output
MCP Server Output: 00:30:34 [[32minfo[39m] [MCPServer]: [32mHealth checker initialized[39m

ProcessManager: cleaned output = '00:30:34 [info] [MCPServer]: Health checker initialized
'
ProcessManager: Checking patterns:
ProcessManager:   - Pattern1 'MCP Server connected on stdio transport': false
ProcessManager:   - Pattern2 'AI Memory MCP Server running on stdio': false
ProcessManager:   - Current serverStatus: Starting...
ProcessManager: ❌ No startup patterns found in this output
MCP Server Output: 00:30:34 [[32minfo[39m] [MCPServer]: [32mMCP Server starting up[39m

ProcessManager: cleaned output = '00:30:34 [info] [MCPServer]: MCP Server starting up
'
ProcessManager: Checking patterns:
ProcessManager:   - Pattern1 'MCP Server connected on stdio transport': false
ProcessManager:   - Pattern2 'AI Memory MCP Server running on stdio': false
ProcessManager:   - Current serverStatus: Starting...
ProcessManager: ❌ No startup patterns found in this output
MCP Server Output: 00:30:34 [[32minfo[39m] [MCPServer]: [32mMCP Server connected on stdio transport[39m

ProcessManager: cleaned output = '00:30:34 [info] [MCPServer]: MCP Server connected on stdio transport
'
ProcessManager: Checking patterns:
ProcessManager:   - Pattern1 'MCP Server connected on stdio transport': true
ProcessManager:   - Pattern2 'AI Memory MCP Server running on stdio': false
ProcessManager:   - Current serverStatus: Starting...
ProcessManager: ✅ PATTERN MATCHED! Detected MCP server startup via output
ProcessManager: ✅ Setting serverStatus to .running via output detection
ProcessManager: ERROR - Checking for startup pattern:
ProcessManager: ERROR - Pattern 'AI Memory MCP Server running on stdio': true
ProcessManager: ERROR - Current serverStatus: Running
ProcessManager: ✅ STDERR STARTUP DETECTED! Found MCP server startup in stderr
ProcessManager: ⚠️  Server already marked as running via stderr
JSON-RPC response parsing delegated to ProcessManager's unified handler
MCPClient: Response parsing set up after connection established
MCPClient connection status updated: false → true
MCPClient isConnected property is now: true
ProcessManager: readabilityHandler called
ProcessManager: availableData size = 78 bytes
ProcessManager: raw output = '{"jsonrpc":"2.0","id":2,"error":{"code":-32601,"message":"Method not found"}}
'
ProcessManager: output.isEmpty = false
ProcessManager: Passed output to MCPClient for JSON-RPC parsing
ProcessManager: readabilityHandler called
ProcessManager: availableData size = 78 bytes
ProcessManager: raw output = '{"jsonrpc":"2.0","id":1,"error":{"code":-32601,"message":"Method not found"}}
'
ProcessManager: output.isEmpty = false
ProcessManager: Passed output to MCPClient for JSON-RPC parsing
MCP Server Output: {"jsonrpc":"2.0","id":2,"error":{"code":-32601,"message":"Method not found"}}

ProcessManager: cleaned output = '{"jsonrpc":"2.0","id":2,"error":{"code":-32601,"message":"Method not found"}}
'
ProcessManager: Checking patterns:
ProcessManager:   - Pattern1 'MCP Server connected on stdio transport': false
ProcessManager:   - Pattern2 'AI Memory MCP Server running on stdio': false
ProcessManager:   - Current serverStatus: Running
ProcessManager: ❌ No startup patterns found in this output
MCP Server Output: {"jsonrpc":"2.0","id":1,"error":{"code":-32601,"message":"Method not found"}}

ProcessManager: cleaned output = '{"jsonrpc":"2.0","id":1,"error":{"code":-32601,"message":"Method not found"}}
'
ProcessManager: Checking patterns:
ProcessManager:   - Pattern1 'MCP Server connected on stdio transport': false
ProcessManager:   - Pattern2 'AI Memory MCP Server running on stdio': false
ProcessManager:   - Current serverStatus: Running
ProcessManager: ❌ No startup patterns found in this output
ProcessManager: Checking process status after 1 second delay
ProcessManager: process.isRunning = true
ProcessManager: Setting serverStatus to .running
MCP server started successfully
MCPClient connection status updated: true → true
MCPClient isConnected property is now: true
ProcessManager: readabilityHandler called
ProcessManager: availableData size = 78 bytes
ProcessManager: raw output = '{"jsonrpc":"2.0","id":3,"error":{"code":-32601,"message":"Method not found"}}
'
ProcessManager: output.isEmpty = false
ProcessManager: Passed output to MCPClient for JSON-RPC parsing
ProcessManager: readabilityHandler called
ProcessManager: availableData size = 78 bytes
ProcessManager: raw output = '{"jsonrpc":"2.0","id":4,"error":{"code":-32601,"message":"Method not found"}}
'
ProcessManager: output.isEmpty = false
ProcessManager: Passed output to MCPClient for JSON-RPC parsing
MCP Server Output: {"jsonrpc":"2.0","id":3,"error":{"code":-32601,"message":"Method not found"}}

ProcessManager: cleaned output = '{"jsonrpc":"2.0","id":3,"error":{"code":-32601,"message":"Method not found"}}
'
ProcessManager: Checking patterns:
ProcessManager:   - Pattern1 'MCP Server connected on stdio transport': false
ProcessManager:   - Pattern2 'AI Memory MCP Server running on stdio': false
ProcessManager:   - Current serverStatus: Running
ProcessManager: ❌ No startup patterns found in this output
MCP Server Output: {"jsonrpc":"2.0","id":4,"error":{"code":-32601,"message":"Method not found"}}

ProcessManager: cleaned output = '{"jsonrpc":"2.0","id":4,"error":{"code":-32601,"message":"Method not found"}}
'
ProcessManager: Checking patterns:
ProcessManager:   - Pattern1 'MCP Server connected on stdio transport': false
ProcessManager:   - Pattern2 'AI Memory MCP Server running on stdio': false
ProcessManager:   - Current serverStatus: Running
ProcessManager: ❌ No startup patterns found in this output
ProcessManager: startMCPServer() called
ProcessManager: Current serverStatus = running
ProcessManager: MCP server is already running or starting - exiting early
SWIFT TASK CONTINUATION MISUSE: sendRequest(method:params:) leaked its continuation without resuming it. This may cause tasks waiting on it to remain suspended forever.
ProcessManager: readabilityHandler called
ProcessManager: availableData size = 78 bytes
ProcessManager: raw output = '{"jsonrpc":"2.0","id":5,"error":{"code":-32601,"message":"Method not found"}}
'
ProcessManager: output.isEmpty = false
ProcessManager: Passed output to MCPClient for JSON-RPC parsing
ProcessManager: readabilityHandler called
ProcessManager: availableData size = 78 bytes
ProcessManager: raw output = '{"jsonrpc":"2.0","id":5,"error":{"code":-32601,"message":"Method not found"}}
'
ProcessManager: output.isEmpty = false
ProcessManager: Passed output to MCPClient for JSON-RPC parsing
MCP Server Output: {"jsonrpc":"2.0","id":5,"error":{"code":-32601,"message":"Method not found"}}

ProcessManager: cleaned output = '{"jsonrpc":"2.0","id":5,"error":{"code":-32601,"message":"Method not found"}}
'
ProcessManager: Checking patterns:
ProcessManager:   - Pattern1 'MCP Server connected on stdio transport': false
ProcessManager:   - Pattern2 'AI Memory MCP Server running on stdio': false
ProcessManager:   - Current serverStatus: Running
ProcessManager: ❌ No startup patterns found in this output
MCP Server Output: {"jsonrpc":"2.0","id":5,"error":{"code":-32601,"message":"Method not found"}}

ProcessManager: cleaned output = '{"jsonrpc":"2.0","id":5,"error":{"code":-32601,"message":"Method not found"}}
'
ProcessManager: Checking patterns:
ProcessManager:   - Pattern1 'MCP Server connected on stdio transport': false
ProcessManager:   - Pattern2 'AI Memory MCP Server running on stdio': false
ProcessManager:   - Current serverStatus: Running
ProcessManager: ❌ No startup patterns found in this output
ViewBridge to RemoteViewService Terminated: Error Domain=com.apple.ViewBridge Code=18 "(null)" UserInfo={com.apple.ViewBridge.error.hint=this process disconnected remote view controller -- benign unless unexpected, com.apple.ViewBridge.error.description=NSViewBridgeErrorCanceled}
ProcessManager: readabilityHandler called
ProcessManager: availableData size = 37 bytes
ProcessManager: raw output = 'Database schema applied successfully
'
ProcessManager: output.isEmpty = false
ProcessManager: Passed output to MCPClient for JSON-RPC parsing
ProcessManager: readabilityHandler called
ProcessManager: availableData size = 82 bytes
ProcessManager: raw output = '00:30:40 [[32minfo[39m] [GitSchema]: [32mInitializing git database schema[39m
'
ProcessManager: output.isEmpty = false
ProcessManager: Passed output to MCPClient for JSON-RPC parsing
ProcessManager: readabilityHandler called
ProcessManager: availableData size = 94 bytes
ProcessManager: raw output = '00:30:40 [[32minfo[39m] [GitSchema]: [32mGit database schema initialized successfully[39m
'
ProcessManager: output.isEmpty = false
ProcessManager: Passed output to MCPClient for JSON-RPC parsing
ProcessManager: readabilityHandler called
ProcessManager: availableData size = 76 bytes
ProcessManager: raw output = 'Database initialized at: /Users/harrison/.claude/ai-memory/conversations.db
'
ProcessManager: output.isEmpty = false
ProcessManager: Passed output to MCPClient for JSON-RPC parsing
ProcessManager: readabilityHandler called
ProcessManager: availableData size = 43 bytes
ProcessManager: raw output = 'Database initialized for MCP tool handlers
'
ProcessManager: output.isEmpty = false
ProcessManager: Passed output to MCPClient for JSON-RPC parsing
MCP Server Output: Database schema applied successfully

ProcessManager: cleaned output = 'Database schema applied successfully
'
ProcessManager: Checking patterns:
ProcessManager:   - Pattern1 'MCP Server connected on stdio transport': false
ProcessManager:   - Pattern2 'AI Memory MCP Server running on stdio': false
ProcessManager:   - Current serverStatus: Running
ProcessManager: ❌ No startup patterns found in this output
MCP Server Output: 00:30:40 [[32minfo[39m] [GitSchema]: [32mInitializing git database schema[39m

ProcessManager: cleaned output = '00:30:40 [info] [GitSchema]: Initializing git database schema
'
ProcessManager: Checking patterns:
ProcessManager:   - Pattern1 'MCP Server connected on stdio transport': false
ProcessManager:   - Pattern2 'AI Memory MCP Server running on stdio': false
ProcessManager:   - Current serverStatus: Running
ProcessManager: ❌ No startup patterns found in this output
MCP Server Output: 00:30:40 [[32minfo[39m] [GitSchema]: [32mGit database schema initialized successfully[39m

ProcessManager: cleaned output = '00:30:40 [info] [GitSchema]: Git database schema initialized successfully
'
ProcessManager: Checking patterns:
ProcessManager:   - Pattern1 'MCP Server connected on stdio transport': false
ProcessManager:   - Pattern2 'AI Memory MCP Server running on stdio': false
ProcessManager:   - Current serverStatus: Running
ProcessManager: ❌ No startup patterns found in this output
MCP Server Output: Database initialized at: /Users/harrison/.claude/ai-memory/conversations.db

ProcessManager: cleaned output = 'Database initialized at: /Users/harrison/.claude/ai-memory/conversations.db
'
ProcessManager: Checking patterns:
ProcessManager:   - Pattern1 'MCP Server connected on stdio transport': false
ProcessManager:   - Pattern2 'AI Memory MCP Server running on stdio': false
ProcessManager:   - Current serverStatus: Running
ProcessManager: ❌ No startup patterns found in this output
MCP Server Output: Database initialized for MCP tool handlers

ProcessManager: cleaned output = 'Database initialized for MCP tool handlers
'
ProcessManager: Checking patterns:
ProcessManager:   - Pattern1 'MCP Server connected on stdio transport': false
ProcessManager:   - Pattern2 'AI Memory MCP Server running on stdio': false
ProcessManager:   - Current serverStatus: Running
ProcessManager: ❌ No startup patterns found in this output
ProcessManager: readabilityHandler called
ProcessManager: availableData size = 193 bytes
ProcessManager: raw output = '00:30:40 [[33mwarn[39m] [PerformanceMetrics]: [33mSlow search operation detected[39m {"searchType":"conversationSearch","query":"ketchup project","executionTime":"504ms","resultCount":100}
'
ProcessManager: output.isEmpty = false
ProcessManager: Passed output to MCPClient for JSON-RPC parsing
ProcessManager: readabilityHandler called
ProcessManager: availableData size = 32 bytes
ProcessManager: raw output = 'SQLite search found 100 results
'
ProcessManager: output.isEmpty = false
ProcessManager: Passed output to MCPClient for JSON-RPC parsing
MCP Server Output: 00:30:40 [[33mwarn[39m] [PerformanceMetrics]: [33mSlow search operation detected[39m {"searchType":"conversationSearch","query":"ketchup project","executionTime":"504ms","resultCount":100}

ProcessManager: cleaned output = '00:30:40 [warn] [PerformanceMetrics]: Slow search operation detected {"searchType":"conversationSearch","query":"ketchup project","executionTime":"504ms","resultCount":100}
'
ProcessManager: Checking patterns:
ProcessManager:   - Pattern1 'MCP Server connected on stdio transport': false
ProcessManager:   - Pattern2 'AI Memory MCP Server running on stdio': false
ProcessManager:   - Current serverStatus: Running
ProcessManager: ❌ No startup patterns found in this output
MCP Server Output: SQLite search found 100 results

ProcessManager: cleaned output = 'SQLite search found 100 results
'
ProcessManager: Checking patterns:
ProcessManager:   - Pattern1 'MCP Server connected on stdio transport': false
ProcessManager:   - Pattern2 'AI Memory MCP Server running on stdio': false
ProcessManager:   - Current serverStatus: Running
ProcessManager: ❌ No startup patterns found in this output
ProcessManager: readabilityHandler called
ProcessManager: availableData size = 14065 bytes
ProcessManager: raw output = '{"result":{"content":[{"type":"text","text":"{\n  \"query\": \"ketchup project\",\n  \"searchOptions\": {\n    \"search_mode\": \"mixed\",\n    \"logic\": \"OR\",\n    \"fuzzy_threshold\": 0.6,\n    \"timeframe\": null,\n    \"max_tokens\": 3000,\n    \"include_snippets\": true\n  },\n  \"results\": [\n    {\n      \"sessionId\": \"4a77fa00-b4bf-4668-81ba-9507050fc7c8\",\n      \"projectName\": \"ketchup\",\n      \"messageCount\": 290,\n      \"startTime\": \"2025-08-19T12:07:44.297Z\",\n      \"relevanceScore\": -0.021902074778996104,\n      \"searchMethod\": \"JSONL Fallback\",\n      \"preview\": \"...This is insane, right? And then we have <mark>project</mark>\\n6:54\\nstructure, right? It's really breaking down how we can add a cloud code hook. We even have some next steps...\"\n    },\n    {\n      \"sessionId\": \"76caa4ca-8387-42cf-a88d-33eacd20b2ac\",\n      \"projectName\": \"ketchup\",\n      \"messageCount\": 316,\n      \"startTime\": \"2025-08-19T12:12:24.416Z\",\n      \"relevanceScore\": -0.021902074778996104,\n      \"searchMethod\": \"JSONL Fallback\",\n      \"preview\": \"...This is insane, right? And then we have <mark>project</mark>\\n6:54\\nstructure, right? It's really breaking down how we can add a cloud code hook. We even have some next steps...\"\n    },\n    {\n      \"sessionId\": \"fd33f562-6169-4299-86f9-2a551d92ad17\",\n      \"projectName\": \"ketchup\",\n      \"messageCount\": 261,\n      \"startTime\": \"2025-08-19T12:01:50.660Z\",\n      \"relevanceScore\": -0.021902074778996104,\n      \"searchMethod\": \"JSONL Fallback\",\n      \"preview\": \"...This is insane, right? And then we have <mark>project</mark>\\n6:54\\nstructure, right? It's really breaking down how we can add a cloud code hook. We even have some next steps...\"\n    },\n    {\n      \"sessionId\": \"b457a5b8-98a9-4596-a29a-1c1727d60e12\",\n      \"projectName\": \"ketchup\",\n      \"messageCount\": 223,\n      \"startTime\": \"2025-08-19T11:33:30.259Z\",\n      \"relevanceScore\": -0.021902074778996104,\n      \"searchMethod\": \"JSONL Fallback\",\n      \"preview\": \"...This is insane, right? And then we have <mark>project</mark>\\n6:54\\nstructure, right? It's really breaking down how we can add a cloud code hook. We even have some next steps...\"\n    },\n    {\n      \"sessionId\": \"a3d47240-cc1e-4788-91b6-0e1b34769843\",\n      \"projectName\": \"ketchup\",\n      \"messageCount\": 473,\n      \"startTime\": \"2025-08-19T12:30:59.905Z\",\n      \"relevanceScore\": -0.021902074778996104,\n      \"searchMethod\": \"JSONL Fallback\",\n      \"preview\": \"...This is insane, right? And then we have <mark>project</mark>\\n6:54\\nstructure, right? It's really breaking down how we can add a cloud code hook. We even have some next steps...\"\n    },\n    {\n      \"sessionId\": \"e661236e-5a11-47e1-ac9f-7caa38cb0dab\",\n      \"projectName\": \"ketchup\",\n      \"messageCount\": 1637,\n      \"startTime\": \"2025-08-15T20:03:57.727Z\",\n      \"relevanceScore\": -0.07794426212178832,\n      \"searchMethod\": \"JSONL Fallback\",\n      \"preview\": \"...return Command(\\n            goto=\\\"tool_execution\\\",\\n            update={\\\"execution_strategy\\\": \\\"mcp_fetch\\\", \\\"priority\\\": \\\"high\\\"}\\n        )\\n    elif intent.get(\\\"type\\\") == \\\"search_<mark>project</mark>\\\":\\n        return Command(\\n            goto=\\\"tool_execution\\\", \\n            update={\\\"execution_strategy\\\": \\\"es_search\\\", \\\"batch_size\\\": 10}\\n        )\\n    \\n    return...\"\n    },\n    {\n      \"sessionId\": \"e8d98635-1cec-4f0f-8eb4-743da1476c8e\",\n      \"projectName\": \"ketchup\",\n      \"messageCount\": 5769,\n      \"startTime\": \"2025-08-17T10:39:28.133Z\",\n      \"relevanceScore\": -0.07794426212178832,\n      \"searchMethod\": \"JSONL Fallback\",\n      \"preview\": \"...return Command(\\n            goto=\\\"tool_execution\\\",\\n            update={\\\"execution_strategy\\\": \\\"mcp_fetch\\\", \\\"priority\\\": \\\"high\\\"}\\n        )\\n    elif intent.get(\\\"type\\\") == \\\"search_<mark>project</mark>\\\":\\n        return Command(\\n            goto=\\\"tool_execution\\\", \\n            update={\\\"execution_strategy\\\": \\\"es_search\\\", \\\"batch_size\\\": 10}\\n        )\\n    \\n    return...\"\n    },\n    {\n      \"sessionId\": \"b548f141-e2ac-4216-88f1-152a0ca7344a\",\n      \"projectName\": \"ketchup\",\n      \"messageCount\": 1215,\n      \"startTime\": \"2025-08-29T10:09:40.952Z\",\n      \"relevanceScore\": -0.08220758337859845,\n      \"searchMethod\": \"JSONL Fallback\",\n      \"preview\": \"...Hi *{first_name}!* Welcome to <mark>Ketchup</mark> Preferences\\\",\\n     ```\\n\\n   - **.isort.cfg**\\n     - **Why Important**: Created to ensure consistent import ordering\\n     - **Content**:\\n     ```ini\\n     [settings]\\n     profile = black\\n     line_length = 88\\n     multi_line_output = 3\\n     include_trailing_comma...\"\n    },\n    {\n      \"sessionId\": \"a8f77096-7868-4e11-a0a9-0e60da8d45c3\",\n      \"projectName\": \"ketchup\",\n      \"messageCount\": 1207,\n      \"startTime\": \"2025-08-19T18:40:31.327Z\",\n      \"relevanceScore\": -0.08220758337859845,\n      \"searchMethod\": \"JSONL Fallback\",\n      \"preview\": \"...Hi *{first_name}!* Welcome to <mark>Ketchup</mark> Preferences\\\",\\n     ```\\n\\n   - **.isort.cfg**\\n     - **Why Important**: Created to ensure consistent import ordering\\n     - **Content**:\\n     ```ini\\n     [settings]\\n     profile = black\\n     line_length = 88\\n     multi_line_output = 3\\n     include_trailing_comma...\"\n    },\n    {\n      \"sessionId\": \"ec427b0c-8222-4254-8acf-17b45a53c776\",\n      \"projectName\": \"ketchup\",\n      \"messageCount\": 1310,\n      \"startTime\": \"2025-08-29T13:14:28.601Z\",\n      \"relevanceScore\": -0.08220758337859845,\n      \"searchMethod\": \"JSONL Fallback\",\n      \"preview\": \"...Hi *{first_name}!* Welcome to <mark>Ketchup</mark> Preferences\\\",\\n     ```\\n\\n   - **.isort.cfg**\\n     - **Why Important**: Created to ensure consistent import ordering\\n     - **Content**:\\n     ```ini\\n     [settings]\\n     profile = black\\n     line_length = 88\\n     multi_line_output = 3\\n     include_trailing_comma...\"\n    },\n    {\n      \"sessionId\": \"ab2285c9-5d4b-4507-97ef-3acea126a68d\",\n      \"projectName\": \"ketchup\",\n      \"messageCount\": 1050,\n      \"startTime\": \"2025-08-15T18:02:26.287Z\",\n      \"relevanceScore\": -0.08413094981805301,\n      \"searchMethod\": \"JSONL Fallback\",\n      \"preview\": \"...CRITICAL)\\n**Location:** `/Users/harrison/Documents/Github/camp-ops-tools-emea/<mark>ketchup</mark>/modular_refactor/tests/setup/logs.txt:20-97`\\n\\n**Root Cause:** The workflow router produces `Command` objects with correct routing decisions, but...\"\n    },\n    {\n      \"sessionId\": \"e661236e-5a11-47e1-ac9f-7caa38cb0dab\",\n      \"projectName\": \"ketchup\",\n      \"messageCount\": 1637,\n      \"startTime\": \"2025-08-15T20:03:57.727Z\",\n      \"relevanceScore\": -0.08426691861764492,\n      \"searchMethod\": \"JSONL Fallback\",\n      \"preview\": \"...CRITICAL)\\n**Location:** `/Users/harrison/Documents/Github/camp-ops-tools-emea/<mark>ketchup</mark>/tests/setup/logs.txt:20-97`\\n\\n**Root Cause:** The workflow router produces `Command` objects with correct routing decisions, but these commands...\"\n    },\n    {\n      \"sessionId\": \"e661236e-5a11-47e1-ac9f-7caa38cb0dab\",\n      \"projectName\": \"ketchup\",\n      \"messageCount\": 1637,\n      \"startTime\": \"2025-08-15T20:03:57.727Z\",\n      \"relevanceScore\": -0.09323225583576344,\n      \"searchMethod\": \"JSONL Fallback\",\n      \"preview\": \"...Only then proceed to Day 4 integration\\n\\nThe consolidation work shows good progress on organization and deduplication, but security must be the top priority before integration with the larger <mark>Ketchup</mark> system.\"\n    },\n    {\n      \"sessionId\": \"e8d98635-1cec-4f0f-8eb4-743da1476c8e\",\n      \"projectName\": \"ketchup\",\n      \"messageCount\": 5769,\n      \"startTime\": \"2025-08-17T10:39:28.133Z\",\n      \"relevanceScore\": -0.09323225583576344,\n      \"searchMethod\": \"JSONL Fallback\",\n      \"preview\": \"...Only then proceed to Day 4 integration\\n\\nThe consolidation work shows good progress on organization and deduplication, but security must be the top priority before integration with the larger <mark>Ketchup</mark> system.\"\n    },\n    {\n      \"sessionId\": \"eebc0219-0172-4574-8d98-d65e5e543c7f\",\n      \"projectName\": \"ketchup\",\n      \"messageCount\": 111,\n      \"startTime\": \"2025-08-15T00:26:20.126Z\",\n      \"relevanceScore\": -0.09723101459148245,\n      \"searchMethod\": \"JSONL Fallback\",\n      \"preview\": \"Based on my comprehensive analysis of the <mark>ketchup</mark> codebase architecture in the `packages/` directory, here's a detailed assessment of the current state, pain points, and improvement opportunities:\\n\\n## 1. **Current Architecture Patterns...\"\n    },\n    {\n      \"sessionId\": \"4fba7ea8-b0b8-43ac-82d4-c8557b914d80\",\n      \"projectName\": \"ketchup\",\n      \"messageCount\": 625,\n      \"startTime\": \"2025-08-15T13:06:48.252Z\",\n      \"relevanceScore\": -0.10041430063167951,\n      \"searchMethod\": \"JSONL Fallback\",\n      \"preview\": \"...C094DQY7HLH (test-<mark>ketchup</mark>-commands)\\n   - **DI Container**: Dependency injection with service registration\\n\\n3. **Files and Code Sections:**\\n   - **/packages/langchain/tools/jira/jira_search_tools.py**\\n     - **Why important**: Contains the workflow definition with routing...\"\n    },\n    {\n      \"sessionId\": \"ab2285c9-5d4b-4507-97ef-3acea126a68d\",\n      \"projectName\": \"ketchup\",\n      \"messageCount\": 1050,\n      \"startTime\": \"2025-08-15T18:02:26.287Z\",\n      \"relevanceScore\": -0.10041430063167951,\n      \"searchMethod\": \"JSONL Fallback\",\n      \"preview\": \"...C094DQY7HLH (test-<mark>ketchup</mark>-commands)\\n   - **DI Container**: Dependency injection with service registration\\n\\n3. **Files and Code Sections:**\\n   - **/packages/langchain/tools/jira/jira_search_tools.py**\\n     - **Why important**: Contains the workflow definition with routing...\"\n    },\n    {\n      \"sessionId\": \"6bb02e54-f8d0-4c52-ad55-2d9149744e91\",\n      \"projectName\": \"ketchup\",\n      \"messageCount\": 12205,\n      \"startTime\": \"2025-08-22T13:43:59.610Z\",\n      \"relevanceScore\": -0.10258754850191247,\n      \"searchMethod\": \"JSONL Fallback\",\n      \"preview\": \"...most critical issue is having two classes with identical names:\\n- `AccessRequestMonitor` (health monitor service in `/<mark>ketchup</mark>_access_request_monitor/monitor.py`)\\n- `AccessRequestMonitor` (metrics collection class in `/packages/slack/metrics/access_request_monitor...\"\n    },\n    {\n      \"sessionId\": \"4b0b3863-b71b-4b7f-adf1-af6bc135554f\",\n      \"projectName\": \"ketchup\",\n      \"messageCount\": 681,\n      \"startTime\": \"2025-08-22T13:43:59.610Z\",\n      \"relevanceScore\": -0.10258754850191247,\n      \"searchMethod\": \"JSONL Fallback\",\n      \"preview\": \"...most critical issue is having two classes with identical names:\\n- `AccessRequestMonitor` (health monitor service in `/<mark>ketchup</mark>_access_request_monitor/monitor.py`)\\n- `AccessRequestMonitor` (metrics collection class in `/packages/slack/metrics/access_request_monitor...\"\n    },\n    {\n      \"sessionId\": \"e8d98635-1cec-4f0f-8eb4-743da1476c8e\",\n      \"projectName\": \"ketchup\",\n      \"messageCount\": 5769,\n      \"startTime\": \"2025-08-17T10:39:28.133Z\",\n      \"relevanceScore\": -0.10471764688571034,\n      \"searchMethod\": \"JSONL Fallback\",\n      \"preview\": \"...datetime.now().isoformat(),\\n                'priority': {'name': 'Medium'},\\n                'issuetype': {'name': 'Task'},\\n                '<mark>project</mark>': {'key': 'TEST', 'name': 'Test <mark>Project</mark>'}\\n            }\\n        }\\n    \\n    def generate_test_comments(self, ticket_id: str, count: int = 3) -> List[Dict[str, Any]]:\\n        \\\"\\\"\\\"Generate test...\"\n    },\n    {\n      \"sessionId\": \"8c9ba7fa-8036-4236-8c9f-467eec7386cd\",\n      \"projectName\": \"ketchup\",\n      \"messageCount\": 594,\n      \"startTime\": \"2025-08-17T12:30:31.652Z\",\n      \"relevanceScore\": -0.10482195358026564,\n      \"searchMethod\": \"JSONL Fallback\",\n      \"preview\": \"...datetime.now().isoformat(),\\n                'priority': {'name': 'Medium'},\\n                'issuetype': {'name': 'Task'},\\n                '<mark>project</mark>': {'key': 'TEST', 'name': 'Test <mark>Project</mark>'}\\n            }\\n        }\\n    \\n    def generate_test_comments(self, ticket_id: str, count: int = 3) -> List[Dict[str, Any]]:\\n        \\\"\\\"\\\"Generate test...\"\n    },\n    {\n      \"sessionId\": \"19355240-54ae-45b2-867c-bd0b868bb897\",\n      \"projectName\": \"ketchup\",\n      \"messageCount\": 337,\n      \"startTime\": \"2025-08-19T17:56:42.549Z\",\n      \"relevanceScore\": -0.10507283885756243,\n      \"searchMethod\": \"JSONL Fallback\",\n      \"preview\": \"...Proper validation patterns for tickets, <mark>projects</mark>, users\\n- **Error Sanitization**: Comprehensive `sanitize_error_message()` function\\n\\n**Critical Findings:**\\n```python\\n# EXCELLENT: Comprehensive JQL sanitization\\ndef sanitize_jql_value(value: str) -> str:\\n    # Remove ALL JQL operators...\"\n    }\n  ],\n  \"total_found\": 100,\n  \"showing\": 22,\n  \"token_usage\": {\n    \"estimated_tokens\": 2795,\n    \"max_tokens\": 3000,\n    \"token_savings\": \"Truncated 28 results to stay within token limit\"\n  },\n  \"database_status\": \"Connected\",\n  \"search_engine\": \"JSONL Fallback\",\n  \"get_full_details\": \"Use get_conversation_context with a specific sessionId to get complete conversation details\"\n}"}]},"jsonrpc":"2.0","id":6}
'
ProcessManager: output.isEmpty = false
ProcessManager: Passed output to MCPClient for JSON-RPC parsing
MCP Server Output: {"result":{"content":[{"type":"text","text":"{\n  \"query\": \"ketchup project\",\n  \"searchOptions\": {\n    \"search_mode\": \"mixed\",\n    \"logic\": \"OR\",\n    \"fuzzy_threshold\": 0.6,\n    \"timeframe\": null,\n    \"max_tokens\": 3000,\n    \"include_snippets\": true\n  },\n  \"results\": [\n    {\n      \"sessionId\": \"4a77fa00-b4bf-4668-81ba-9507050fc7c8\",\n      \"projectName\": \"ketchup\",\n      \"messageCount\": 290,\n      \"startTime\": \"2025-08-19T12:07:44.297Z\",\n      \"relevanceScore\": -0.021902074778996104,\n      \"searchMethod\": \"JSONL Fallback\",\n      \"preview\": \"...This is insane, right? And then we have <mark>project</mark>\\n6:54\\nstructure, right? It's really breaking down how we can add a cloud code hook. We even have some next steps...\"\n    },\n    {\n      \"sessionId\": \"76caa4ca-8387-42cf-a88d-33eacd20b2ac\",\n      \"projectName\": \"ketchup\",\n      \"messageCount\": 316,\n      \"startTime\": \"2025-08-19T12:12:24.416Z\",\n      \"relevanceScore\": -0.021902074778996104,\n      \"searchMethod\": \"JSONL Fallback\",\n      \"preview\": \"...This is insane, right? And then we have <mark>project</mark>\\n6:54\\nstructure, right? It's really breaking down how we can add a cloud code hook. We even have some next steps...\"\n    },\n    {\n      \"sessionId\": \"fd33f562-6169-4299-86f9-2a551d92ad17\",\n      \"projectName\": \"ketchup\",\n      \"messageCount\": 261,\n      \"startTime\": \"2025-08-19T12:01:50.660Z\",\n      \"relevanceScore\": -0.021902074778996104,\n      \"searchMethod\": \"JSONL Fallback\",\n      \"preview\": \"...This is insane, right? And then we have <mark>project</mark>\\n6:54\\nstructure, right? It's really breaking down how we can add a cloud code hook. We even have some next steps...\"\n    },\n    {\n      \"sessionId\": \"b457a5b8-98a9-4596-a29a-1c1727d60e12\",\n      \"projectName\": \"ketchup\",\n      \"messageCount\": 223,\n      \"startTime\": \"2025-08-19T11:33:30.259Z\",\n      \"relevanceScore\": -0.021902074778996104,\n      \"searchMethod\": \"JSONL Fallback\",\n      \"preview\": \"...This is insane, right? And then we have <mark>project</mark>\\n6:54\\nstructure, right? It's really breaking down how we can add a cloud code hook. We even have some next steps...\"\n    },\n    {\n      \"sessionId\": \"a3d47240-cc1e-4788-91b6-0e1b34769843\",\n      \"projectName\": \"ketchup\",\n      \"messageCount\": 473,\n      \"startTime\": \"2025-08-19T12:30:59.905Z\",\n      \"relevanceScore\": -0.021902074778996104,\n      \"searchMethod\": \"JSONL Fallback\",\n      \"preview\": \"...This is insane, right? And then we have <mark>project</mark>\\n6:54\\nstructure, right? It's really breaking down how we can add a cloud code hook. We even have some next steps...\"\n    },\n    {\n      \"sessionId\": \"e661236e-5a11-47e1-ac9f-7caa38cb0dab\",\n      \"projectName\": \"ketchup\",\n      \"messageCount\": 1637,\n      \"startTime\": \"2025-08-15T20:03:57.727Z\",\n      \"relevanceScore\": -0.07794426212178832,\n      \"searchMethod\": \"JSONL Fallback\",\n      \"preview\": \"...return Command(\\n            goto=\\\"tool_execution\\\",\\n            update={\\\"execution_strategy\\\": \\\"mcp_fetch\\\", \\\"priority\\\": \\\"high\\\"}\\n        )\\n    elif intent.get(\\\"type\\\") == \\\"search_<mark>project</mark>\\\":\\n        return Command(\\n            goto=\\\"tool_execution\\\", \\n            update={\\\"execution_strategy\\\": \\\"es_search\\\", \\\"batch_size\\\": 10}\\n        )\\n    \\n    return...\"\n    },\n    {\n      \"sessionId\": \"e8d98635-1cec-4f0f-8eb4-743da1476c8e\",\n      \"projectName\": \"ketchup\",\n      \"messageCount\": 5769,\n      \"startTime\": \"2025-08-17T10:39:28.133Z\",\n      \"relevanceScore\": -0.07794426212178832,\n      \"searchMethod\": \"JSONL Fallback\",\n      \"preview\": \"...return Command(\\n            goto=\\\"tool_execution\\\",\\n            update={\\\"execution_strategy\\\": \\\"mcp_fetch\\\", \\\"priority\\\": \\\"high\\\"}\\n        )\\n    elif intent.get(\\\"type\\\") == \\\"search_<mark>project</mark>\\\":\\n        return Command(\\n            goto=\\\"tool_execution\\\", \\n            update={\\\"execution_strategy\\\": \\\"es_search\\\", \\\"batch_size\\\": 10}\\n        )\\n    \\n    return...\"\n    },\n    {\n      \"sessionId\": \"b548f141-e2ac-4216-88f1-152a0ca7344a\",\n      \"projectName\": \"ketchup\",\n      \"messageCount\": 1215,\n      \"startTime\": \"2025-08-29T10:09:40.952Z\",\n      \"relevanceScore\": -0.08220758337859845,\n      \"searchMethod\": \"JSONL Fallback\",\n      \"preview\": \"...Hi *{first_name}!* Welcome to <mark>Ketchup</mark> Preferences\\\",\\n     ```\\n\\n   - **.isort.cfg**\\n     - **Why Important**: Created to ensure consistent import ordering\\n     - **Content**:\\n     ```ini\\n     [settings]\\n     profile = black\\n     line_length = 88\\n     multi_line_output = 3\\n     include_trailing_comma...\"\n    },\n    {\n      \"sessionId\": \"a8f77096-7868-4e11-a0a9-0e60da8d45c3\",\n      \"projectName\": \"ketchup\",\n      \"messageCount\": 1207,\n      \"startTime\": \"2025-08-19T18:40:31.327Z\",\n      \"relevanceScore\": -0.08220758337859845,\n      \"searchMethod\": \"JSONL Fallback\",\n      \"preview\": \"...Hi *{first_name}!* Welcome to <mark>Ketchup</mark> Preferences\\\",\\n     ```\\n\\n   - **.isort.cfg**\\n     - **Why Important**: Created to ensure consistent import ordering\\n     - **Content**:\\n     ```ini\\n     [settings]\\n     profile = black\\n     line_length = 88\\n     multi_line_output = 3\\n     include_trailing_comma...\"\n    },\n    {\n      \"sessionId\": \"ec427b0c-8222-4254-8acf-17b45a53c776\",\n      \"projectName\": \"ketchup\",\n      \"messageCount\": 1310,\n      \"startTime\": \"2025-08-29T13:14:28.601Z\",\n      \"relevanceScore\": -0.08220758337859845,\n      \"searchMethod\": \"JSONL Fallback\",\n      \"preview\": \"...Hi *{first_name}!* Welcome to <mark>Ketchup</mark> Preferences\\\",\\n     ```\\n\\n   - **.isort.cfg**\\n     - **Why Important**: Created to ensure consistent import ordering\\n     - **Content**:\\n     ```ini\\n     [settings]\\n     profile = black\\n     line_length = 88\\n     multi_line_output = 3\\n     include_trailing_comma...\"\n    },\n    {\n      \"sessionId\": \"ab2285c9-5d4b-4507-97ef-3acea126a68d\",\n      \"projectName\": \"ketchup\",\n      \"messageCount\": 1050,\n      \"startTime\": \"2025-08-15T18:02:26.287Z\",\n      \"relevanceScore\": -0.08413094981805301,\n      \"searchMethod\": \"JSONL Fallback\",\n      \"preview\": \"...CRITICAL)\\n**Location:** `/Users/harrison/Documents/Github/camp-ops-tools-emea/<mark>ketchup</mark>/modular_refactor/tests/setup/logs.txt:20-97`\\n\\n**Root Cause:** The workflow router produces `Command` objects with correct routing decisions, but...\"\n    },\n    {\n      \"sessionId\": \"e661236e-5a11-47e1-ac9f-7caa38cb0dab\",\n      \"projectName\": \"ketchup\",\n      \"messageCount\": 1637,\n      \"startTime\": \"2025-08-15T20:03:57.727Z\",\n      \"relevanceScore\": -0.08426691861764492,\n      \"searchMethod\": \"JSONL Fallback\",\n      \"preview\": \"...CRITICAL)\\n**Location:** `/Users/harrison/Documents/Github/camp-ops-tools-emea/<mark>ketchup</mark>/tests/setup/logs.txt:20-97`\\n\\n**Root Cause:** The workflow router produces `Command` objects with correct routing decisions, but these commands...\"\n    },\n    {\n      \"sessionId\": \"e661236e-5a11-47e1-ac9f-7caa38cb0dab\",\n      \"projectName\": \"ketchup\",\n      \"messageCount\": 1637,\n      \"startTime\": \"2025-08-15T20:03:57.727Z\",\n      \"relevanceScore\": -0.09323225583576344,\n      \"searchMethod\": \"JSONL Fallback\",\n      \"preview\": \"...Only then proceed to Day 4 integration\\n\\nThe consolidation work shows good progress on organization and deduplication, but security must be the top priority before integration with the larger <mark>Ketchup</mark> system.\"\n    },\n    {\n      \"sessionId\": \"e8d98635-1cec-4f0f-8eb4-743da1476c8e\",\n      \"projectName\": \"ketchup\",\n      \"messageCount\": 5769,\n      \"startTime\": \"2025-08-17T10:39:28.133Z\",\n      \"relevanceScore\": -0.09323225583576344,\n      \"searchMethod\": \"JSONL Fallback\",\n      \"preview\": \"...Only then proceed to Day 4 integration\\n\\nThe consolidation work shows good progress on organization and deduplication, but security must be the top priority before integration with the larger <mark>Ketchup</mark> system.\"\n    },\n    {\n      \"sessionId\": \"eebc0219-0172-4574-8d98-d65e5e543c7f\",\n      \"projectName\": \"ketchup\",\n      \"messageCount\": 111,\n      \"startTime\": \"2025-08-15T00:26:20.126Z\",\n      \"relevanceScore\": -0.09723101459148245,\n      \"searchMethod\": \"JSONL Fallback\",\n      \"preview\": \"Based on my comprehensive analysis of the <mark>ketchup</mark> codebase architecture in the `packages/` directory, here's a detailed assessment of the current state, pain points, and improvement opportunities:\\n\\n## 1. **Current Architecture Patterns...\"\n    },\n    {\n      \"sessionId\": \"4fba7ea8-b0b8-43ac-82d4-c8557b914d80\",\n      \"projectName\": \"ketchup\",\n      \"messageCount\": 625,\n      \"startTime\": \"2025-08-15T13:06:48.252Z\",\n      \"relevanceScore\": -0.10041430063167951,\n      \"searchMethod\": \"JSONL Fallback\",\n      \"preview\": \"...C094DQY7HLH (test-<mark>ketchup</mark>-commands)\\n   - **DI Container**: Dependency injection with service registration\\n\\n3. **Files and Code Sections:**\\n   - **/packages/langchain/tools/jira/jira_search_tools.py**\\n     - **Why important**: Contains the workflow definition with routing...\"\n    },\n    {\n      \"sessionId\": \"ab2285c9-5d4b-4507-97ef-3acea126a68d\",\n      \"projectName\": \"ketchup\",\n      \"messageCount\": 1050,\n      \"startTime\": \"2025-08-15T18:02:26.287Z\",\n      \"relevanceScore\": -0.10041430063167951,\n      \"searchMethod\": \"JSONL Fallback\",\n      \"preview\": \"...C094DQY7HLH (test-<mark>ketchup</mark>-commands)\\n   - **DI Container**: Dependency injection with service registration\\n\\n3. **Files and Code Sections:**\\n   - **/packages/langchain/tools/jira/jira_search_tools.py**\\n     - **Why important**: Contains the workflow definition with routing...\"\n    },\n    {\n      \"sessionId\": \"6bb02e54-f8d0-4c52-ad55-2d9149744e91\",\n      \"projectName\": \"ketchup\",\n      \"messageCount\": 12205,\n      \"startTime\": \"2025-08-22T13:43:59.610Z\",\n      \"relevanceScore\": -0.10258754850191247,\n      \"searchMethod\": \"JSONL Fallback\",\n      \"preview\": \"...most critical issue is having two classes with identical names:\\n- `AccessRequestMonitor` (health monitor service in `/<mark>ketchup</mark>_access_request_monitor/monitor.py`)\\n- `AccessRequestMonitor` (metrics collection class in `/packages/slack/metrics/access_request_monitor...\"\n    },\n    {\n      \"sessionId\": \"4b0b3863-b71b-4b7f-adf1-af6bc135554f\",\n      \"projectName\": \"ketchup\",\n      \"messageCount\": 681,\n      \"startTime\": \"2025-08-22T13:43:59.610Z\",\n      \"relevanceScore\": -0.10258754850191247,\n      \"searchMethod\": \"JSONL Fallback\",\n      \"preview\": \"...most critical issue is having two classes with identical names:\\n- `AccessRequestMonitor` (health monitor service in `/<mark>ketchup</mark>_access_request_monitor/monitor.py`)\\n- `AccessRequestMonitor` (metrics collection class in `/packages/slack/metrics/access_request_monitor...\"\n    },\n    {\n      \"sessionId\": \"e8d98635-1cec-4f0f-8eb4-743da1476c8e\",\n      \"projectName\": \"ketchup\",\n      \"messageCount\": 5769,\n      \"startTime\": \"2025-08-17T10:39:28.133Z\",\n      \"relevanceScore\": -0.10471764688571034,\n      \"searchMethod\": \"JSONL Fallback\",\n      \"preview\": \"...datetime.now().isoformat(),\\n                'priority': {'name': 'Medium'},\\n                'issuetype': {'name': 'Task'},\\n                '<mark>project</mark>': {'key': 'TEST', 'name': 'Test <mark>Project</mark>'}\\n            }\\n        }\\n    \\n    def generate_test_comments(self, ticket_id: str, count: int = 3) -> List[Dict[str, Any]]:\\n        \\\"\\\"\\\"Generate test...\"\n    },\n    {\n      \"sessionId\": \"8c9ba7fa-8036-4236-8c9f-467eec7386cd\",\n      \"projectName\": \"ketchup\",\n      \"messageCount\": 594,\n      \"startTime\": \"2025-08-17T12:30:31.652Z\",\n      \"relevanceScore\": -0.10482195358026564,\n      \"searchMethod\": \"JSONL Fallback\",\n      \"preview\": \"...datetime.now().isoformat(),\\n                'priority': {'name': 'Medium'},\\n                'issuetype': {'name': 'Task'},\\n                '<mark>project</mark>': {'key': 'TEST', 'name': 'Test <mark>Project</mark>'}\\n            }\\n        }\\n    \\n    def generate_test_comments(self, ticket_id: str, count: int = 3) -> List[Dict[str, Any]]:\\n        \\\"\\\"\\\"Generate test...\"\n    },\n    {\n      \"sessionId\": \"19355240-54ae-45b2-867c-bd0b868bb897\",\n      \"projectName\": \"ketchup\",\n      \"messageCount\": 337,\n      \"startTime\": \"2025-08-19T17:56:42.549Z\",\n      \"relevanceScore\": -0.10507283885756243,\n      \"searchMethod\": \"JSONL Fallback\",\n      \"preview\": \"...Proper validation patterns for tickets, <mark>projects</mark>, users\\n- **Error Sanitization**: Comprehensive `sanitize_error_message()` function\\n\\n**Critical Findings:**\\n```python\\n# EXCELLENT: Comprehensive JQL sanitization\\ndef sanitize_jql_value(value: str) -> str:\\n    # Remove ALL JQL operators...\"\n    }\n  ],\n  \"total_found\": 100,\n  \"showing\": 22,\n  \"token_usage\": {\n    \"estimated_tokens\": 2795,\n    \"max_tokens\": 3000,\n    \"token_savings\": \"Truncated 28 results to stay within token limit\"\n  },\n  \"database_status\": \"Connected\",\n  \"search_engine\": \"JSONL Fallback\",\n  \"get_full_details\": \"Use get_conversation_context with a specific sessionId to get complete conversation details\"\n}"}]},"jsonrpc":"2.0","id":6}

ProcessManager: cleaned output = '{"result":{"content":[{"type":"text","text":"{\n  \"query\": \"ketchup project\",\n  \"searchOptions\": {\n    \"search_mode\": \"mixed\",\n    \"logic\": \"OR\",\n    \"fuzzy_threshold\": 0.6,\n    \"timeframe\": null,\n    \"max_tokens\": 3000,\n    \"include_snippets\": true\n  },\n  \"results\": [\n    {\n      \"sessionId\": \"4a77fa00-b4bf-4668-81ba-9507050fc7c8\",\n      \"projectName\": \"ketchup\",\n      \"messageCount\": 290,\n      \"startTime\": \"2025-08-19T12:07:44.297Z\",\n      \"relevanceScore\": -0.021902074778996104,\n      \"searchMethod\": \"JSONL Fallback\",\n      \"preview\": \"...This is insane, right? And then we have <mark>project</mark>\\n6:54\\nstructure, right? It's really breaking down how we can add a cloud code hook. We even have some next steps...\"\n    },\n    {\n      \"sessionId\": \"76caa4ca-8387-42cf-a88d-33eacd20b2ac\",\n      \"projectName\": \"ketchup\",\n      \"messageCount\": 316,\n      \"startTime\": \"2025-08-19T12:12:24.416Z\",\n      \"relevanceScore\": -0.021902074778996104,\n      \"searchMethod\": \"JSONL Fallback\",\n      \"preview\": \"...This is insane, right? And then we have <mark>project</mark>\\n6:54\\nstructure, right? It's really breaking down how we can add a cloud code hook. We even have some next steps...\"\n    },\n    {\n      \"sessionId\": \"fd33f562-6169-4299-86f9-2a551d92ad17\",\n      \"projectName\": \"ketchup\",\n      \"messageCount\": 261,\n      \"startTime\": \"2025-08-19T12:01:50.660Z\",\n      \"relevanceScore\": -0.021902074778996104,\n      \"searchMethod\": \"JSONL Fallback\",\n      \"preview\": \"...This is insane, right? And then we have <mark>project</mark>\\n6:54\\nstructure, right? It's really breaking down how we can add a cloud code hook. We even have some next steps...\"\n    },\n    {\n      \"sessionId\": \"b457a5b8-98a9-4596-a29a-1c1727d60e12\",\n      \"projectName\": \"ketchup\",\n      \"messageCount\": 223,\n      \"startTime\": \"2025-08-19T11:33:30.259Z\",\n      \"relevanceScore\": -0.021902074778996104,\n      \"searchMethod\": \"JSONL Fallback\",\n      \"preview\": \"...This is insane, right? And then we have <mark>project</mark>\\n6:54\\nstructure, right? It's really breaking down how we can add a cloud code hook. We even have some next steps...\"\n    },\n    {\n      \"sessionId\": \"a3d47240-cc1e-4788-91b6-0e1b34769843\",\n      \"projectName\": \"ketchup\",\n      \"messageCount\": 473,\n      \"startTime\": \"2025-08-19T12:30:59.905Z\",\n      \"relevanceScore\": -0.021902074778996104,\n      \"searchMethod\": \"JSONL Fallback\",\n      \"preview\": \"...This is insane, right? And then we have <mark>project</mark>\\n6:54\\nstructure, right? It's really breaking down how we can add a cloud code hook. We even have some next steps...\"\n    },\n    {\n      \"sessionId\": \"e661236e-5a11-47e1-ac9f-7caa38cb0dab\",\n      \"projectName\": \"ketchup\",\n      \"messageCount\": 1637,\n      \"startTime\": \"2025-08-15T20:03:57.727Z\",\n      \"relevanceScore\": -0.07794426212178832,\n      \"searchMethod\": \"JSONL Fallback\",\n      \"preview\": \"...return Command(\\n            goto=\\\"tool_execution\\\",\\n            update={\\\"execution_strategy\\\": \\\"mcp_fetch\\\", \\\"priority\\\": \\\"high\\\"}\\n        )\\n    elif intent.get(\\\"type\\\") == \\\"search_<mark>project</mark>\\\":\\n        return Command(\\n            goto=\\\"tool_execution\\\", \\n            update={\\\"execution_strategy\\\": \\\"es_search\\\", \\\"batch_size\\\": 10}\\n        )\\n    \\n    return...\"\n    },\n    {\n      \"sessionId\": \"e8d98635-1cec-4f0f-8eb4-743da1476c8e\",\n      \"projectName\": \"ketchup\",\n      \"messageCount\": 5769,\n      \"startTime\": \"2025-08-17T10:39:28.133Z\",\n      \"relevanceScore\": -0.07794426212178832,\n      \"searchMethod\": \"JSONL Fallback\",\n      \"preview\": \"...return Command(\\n            goto=\\\"tool_execution\\\",\\n            update={\\\"execution_strategy\\\": \\\"mcp_fetch\\\", \\\"priority\\\": \\\"high\\\"}\\n        )\\n    elif intent.get(\\\"type\\\") == \\\"search_<mark>project</mark>\\\":\\n        return Command(\\n            goto=\\\"tool_execution\\\", \\n            update={\\\"execution_strategy\\\": \\\"es_search\\\", \\\"batch_size\\\": 10}\\n        )\\n    \\n    return...\"\n    },\n    {\n      \"sessionId\": \"b548f141-e2ac-4216-88f1-152a0ca7344a\",\n      \"projectName\": \"ketchup\",\n      \"messageCount\": 1215,\n      \"startTime\": \"2025-08-29T10:09:40.952Z\",\n      \"relevanceScore\": -0.08220758337859845,\n      \"searchMethod\": \"JSONL Fallback\",\n      \"preview\": \"...Hi *{first_name}!* Welcome to <mark>Ketchup</mark> Preferences\\\",\\n     ```\\n\\n   - **.isort.cfg**\\n     - **Why Important**: Created to ensure consistent import ordering\\n     - **Content**:\\n     ```ini\\n     [settings]\\n     profile = black\\n     line_length = 88\\n     multi_line_output = 3\\n     include_trailing_comma...\"\n    },\n    {\n      \"sessionId\": \"a8f77096-7868-4e11-a0a9-0e60da8d45c3\",\n      \"projectName\": \"ketchup\",\n      \"messageCount\": 1207,\n      \"startTime\": \"2025-08-19T18:40:31.327Z\",\n      \"relevanceScore\": -0.08220758337859845,\n      \"searchMethod\": \"JSONL Fallback\",\n      \"preview\": \"...Hi *{first_name}!* Welcome to <mark>Ketchup</mark> Preferences\\\",\\n     ```\\n\\n   - **.isort.cfg**\\n     - **Why Important**: Created to ensure consistent import ordering\\n     - **Content**:\\n     ```ini\\n     [settings]\\n     profile = black\\n     line_length = 88\\n     multi_line_output = 3\\n     include_trailing_comma...\"\n    },\n    {\n      \"sessionId\": \"ec427b0c-8222-4254-8acf-17b45a53c776\",\n      \"projectName\": \"ketchup\",\n      \"messageCount\": 1310,\n      \"startTime\": \"2025-08-29T13:14:28.601Z\",\n      \"relevanceScore\": -0.08220758337859845,\n      \"searchMethod\": \"JSONL Fallback\",\n      \"preview\": \"...Hi *{first_name}!* Welcome to <mark>Ketchup</mark> Preferences\\\",\\n     ```\\n\\n   - **.isort.cfg**\\n     - **Why Important**: Created to ensure consistent import ordering\\n     - **Content**:\\n     ```ini\\n     [settings]\\n     profile = black\\n     line_length = 88\\n     multi_line_output = 3\\n     include_trailing_comma...\"\n    },\n    {\n      \"sessionId\": \"ab2285c9-5d4b-4507-97ef-3acea126a68d\",\n      \"projectName\": \"ketchup\",\n      \"messageCount\": 1050,\n      \"startTime\": \"2025-08-15T18:02:26.287Z\",\n      \"relevanceScore\": -0.08413094981805301,\n      \"searchMethod\": \"JSONL Fallback\",\n      \"preview\": \"...CRITICAL)\\n**Location:** `/Users/harrison/Documents/Github/camp-ops-tools-emea/<mark>ketchup</mark>/modular_refactor/tests/setup/logs.txt:20-97`\\n\\n**Root Cause:** The workflow router produces `Command` objects with correct routing decisions, but...\"\n    },\n    {\n      \"sessionId\": \"e661236e-5a11-47e1-ac9f-7caa38cb0dab\",\n      \"projectName\": \"ketchup\",\n      \"messageCount\": 1637,\n      \"startTime\": \"2025-08-15T20:03:57.727Z\",\n      \"relevanceScore\": -0.08426691861764492,\n      \"searchMethod\": \"JSONL Fallback\",\n      \"preview\": \"...CRITICAL)\\n**Location:** `/Users/harrison/Documents/Github/camp-ops-tools-emea/<mark>ketchup</mark>/tests/setup/logs.txt:20-97`\\n\\n**Root Cause:** The workflow router produces `Command` objects with correct routing decisions, but these commands...\"\n    },\n    {\n      \"sessionId\": \"e661236e-5a11-47e1-ac9f-7caa38cb0dab\",\n      \"projectName\": \"ketchup\",\n      \"messageCount\": 1637,\n      \"startTime\": \"2025-08-15T20:03:57.727Z\",\n      \"relevanceScore\": -0.09323225583576344,\n      \"searchMethod\": \"JSONL Fallback\",\n      \"preview\": \"...Only then proceed to Day 4 integration\\n\\nThe consolidation work shows good progress on organization and deduplication, but security must be the top priority before integration with the larger <mark>Ketchup</mark> system.\"\n    },\n    {\n      \"sessionId\": \"e8d98635-1cec-4f0f-8eb4-743da1476c8e\",\n      \"projectName\": \"ketchup\",\n      \"messageCount\": 5769,\n      \"startTime\": \"2025-08-17T10:39:28.133Z\",\n      \"relevanceScore\": -0.09323225583576344,\n      \"searchMethod\": \"JSONL Fallback\",\n      \"preview\": \"...Only then proceed to Day 4 integration\\n\\nThe consolidation work shows good progress on organization and deduplication, but security must be the top priority before integration with the larger <mark>Ketchup</mark> system.\"\n    },\n    {\n      \"sessionId\": \"eebc0219-0172-4574-8d98-d65e5e543c7f\",\n      \"projectName\": \"ketchup\",\n      \"messageCount\": 111,\n      \"startTime\": \"2025-08-15T00:26:20.126Z\",\n      \"relevanceScore\": -0.09723101459148245,\n      \"searchMethod\": \"JSONL Fallback\",\n      \"preview\": \"Based on my comprehensive analysis of the <mark>ketchup</mark> codebase architecture in the `packages/` directory, here's a detailed assessment of the current state, pain points, and improvement opportunities:\\n\\n## 1. **Current Architecture Patterns...\"\n    },\n    {\n      \"sessionId\": \"4fba7ea8-b0b8-43ac-82d4-c8557b914d80\",\n      \"projectName\": \"ketchup\",\n      \"messageCount\": 625,\n      \"startTime\": \"2025-08-15T13:06:48.252Z\",\n      \"relevanceScore\": -0.10041430063167951,\n      \"searchMethod\": \"JSONL Fallback\",\n      \"preview\": \"...C094DQY7HLH (test-<mark>ketchup</mark>-commands)\\n   - **DI Container**: Dependency injection with service registration\\n\\n3. **Files and Code Sections:**\\n   - **/packages/langchain/tools/jira/jira_search_tools.py**\\n     - **Why important**: Contains the workflow definition with routing...\"\n    },\n    {\n      \"sessionId\": \"ab2285c9-5d4b-4507-97ef-3acea126a68d\",\n      \"projectName\": \"ketchup\",\n      \"messageCount\": 1050,\n      \"startTime\": \"2025-08-15T18:02:26.287Z\",\n      \"relevanceScore\": -0.10041430063167951,\n      \"searchMethod\": \"JSONL Fallback\",\n      \"preview\": \"...C094DQY7HLH (test-<mark>ketchup</mark>-commands)\\n   - **DI Container**: Dependency injection with service registration\\n\\n3. **Files and Code Sections:**\\n   - **/packages/langchain/tools/jira/jira_search_tools.py**\\n     - **Why important**: Contains the workflow definition with routing...\"\n    },\n    {\n      \"sessionId\": \"6bb02e54-f8d0-4c52-ad55-2d9149744e91\",\n      \"projectName\": \"ketchup\",\n      \"messageCount\": 12205,\n      \"startTime\": \"2025-08-22T13:43:59.610Z\",\n      \"relevanceScore\": -0.10258754850191247,\n      \"searchMethod\": \"JSONL Fallback\",\n      \"preview\": \"...most critical issue is having two classes with identical names:\\n- `AccessRequestMonitor` (health monitor service in `/<mark>ketchup</mark>_access_request_monitor/monitor.py`)\\n- `AccessRequestMonitor` (metrics collection class in `/packages/slack/metrics/access_request_monitor...\"\n    },\n    {\n      \"sessionId\": \"4b0b3863-b71b-4b7f-adf1-af6bc135554f\",\n      \"projectName\": \"ketchup\",\n      \"messageCount\": 681,\n      \"startTime\": \"2025-08-22T13:43:59.610Z\",\n      \"relevanceScore\": -0.10258754850191247,\n      \"searchMethod\": \"JSONL Fallback\",\n      \"preview\": \"...most critical issue is having two classes with identical names:\\n- `AccessRequestMonitor` (health monitor service in `/<mark>ketchup</mark>_access_request_monitor/monitor.py`)\\n- `AccessRequestMonitor` (metrics collection class in `/packages/slack/metrics/access_request_monitor...\"\n    },\n    {\n      \"sessionId\": \"e8d98635-1cec-4f0f-8eb4-743da1476c8e\",\n      \"projectName\": \"ketchup\",\n      \"messageCount\": 5769,\n      \"startTime\": \"2025-08-17T10:39:28.133Z\",\n      \"relevanceScore\": -0.10471764688571034,\n      \"searchMethod\": \"JSONL Fallback\",\n      \"preview\": \"...datetime.now().isoformat(),\\n                'priority': {'name': 'Medium'},\\n                'issuetype': {'name': 'Task'},\\n                '<mark>project</mark>': {'key': 'TEST', 'name': 'Test <mark>Project</mark>'}\\n            }\\n        }\\n    \\n    def generate_test_comments(self, ticket_id: str, count: int = 3) -> List[Dict[str, Any]]:\\n        \\\"\\\"\\\"Generate test...\"\n    },\n    {\n      \"sessionId\": \"8c9ba7fa-8036-4236-8c9f-467eec7386cd\",\n      \"projectName\": \"ketchup\",\n      \"messageCount\": 594,\n      \"startTime\": \"2025-08-17T12:30:31.652Z\",\n      \"relevanceScore\": -0.10482195358026564,\n      \"searchMethod\": \"JSONL Fallback\",\n      \"preview\": \"...datetime.now().isoformat(),\\n                'priority': {'name': 'Medium'},\\n                'issuetype': {'name': 'Task'},\\n                '<mark>project</mark>': {'key': 'TEST', 'name': 'Test <mark>Project</mark>'}\\n            }\\n        }\\n    \\n    def generate_test_comments(self, ticket_id: str, count: int = 3) -> List[Dict[str, Any]]:\\n        \\\"\\\"\\\"Generate test...\"\n    },\n    {\n      \"sessionId\": \"19355240-54ae-45b2-867c-bd0b868bb897\",\n      \"projectName\": \"ketchup\",\n      \"messageCount\": 337,\n      \"startTime\": \"2025-08-19T17:56:42.549Z\",\n      \"relevanceScore\": -0.10507283885756243,\n      \"searchMethod\": \"JSONL Fallback\",\n      \"preview\": \"...Proper validation patterns for tickets, <mark>projects</mark>, users\\n- **Error Sanitization**: Comprehensive `sanitize_error_message()` function\\n\\n**Critical Findings:**\\n```python\\n# EXCELLENT: Comprehensive JQL sanitization\\ndef sanitize_jql_value(value: str) -> str:\\n    # Remove ALL JQL operators...\"\n    }\n  ],\n  \"total_found\": 100,\n  \"showing\": 22,\n  \"token_usage\": {\n    \"estimated_tokens\": 2795,\n    \"max_tokens\": 3000,\n    \"token_savings\": \"Truncated 28 results to stay within token limit\"\n  },\n  \"database_status\": \"Connected\",\n  \"search_engine\": \"JSONL Fallback\",\n  \"get_full_details\": \"Use get_conversation_context with a specific sessionId to get complete conversation details\"\n}"}]},"jsonrpc":"2.0","id":6}
'
ProcessManager: Checking patterns:
ProcessManager:   - Pattern1 'MCP Server connected on stdio transport': false
ProcessManager:   - Pattern2 'AI Memory MCP Server running on stdio': false
ProcessManager:   - Current serverStatus: Running
ProcessManager: ❌ No startup patterns found in this output