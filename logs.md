ProcessManager: startMCPServer() called
ProcessManager: Current serverStatus = stopped
MCPClient connection status updated: false → false
MCPClient isConnected property is now: false
MCPClient connection status updated: false → false
MCPClient isConnected property is now: false
ProcessManager: readabilityHandler called
ProcessManager: availableData size = 122 bytes
ProcessManager: raw output = '00:24:32 [[32minfo[39m] [ConfigValidator]: [32mConfiguration validation passed[39m {"errors":0,"warnings":0,"info":8}
'
ProcessManager: output.isEmpty = false
MCP Server Output: 00:24:32 [[32minfo[39m] [ConfigValidator]: [32mConfiguration validation passed[39m {"errors":0,"warnings":0,"info":8}

ProcessManager: readabilityHandler called
ProcessManager: availableData size = 36 bytes
ProcessManager: raw output = '✅ Configuration validation passed
'
ProcessManager: output.isEmpty = false
ProcessManager: readabilityHandler called
ProcessManager: availableData size = 97 bytes
ProcessManager: raw output = '00:24:32 [[32minfo[39m] [ConfigValidator]: [32mApplication startup validation successful[39m
'
ProcessManager: output.isEmpty = false
ProcessManager: readabilityHandler called
ProcessManager: availableData size = 76 bytes
ProcessManager: raw output = '00:24:32 [[32minfo[39m] [MCPServer]: [32mHealth checker initialized[39m
'
ProcessManager: output.isEmpty = false
ProcessManager: readabilityHandler called
ProcessManager: availableData size = 72 bytes
ProcessManager: raw output = '00:24:32 [[32minfo[39m] [MCPServer]: [32mMCP Server starting up[39m
'
ProcessManager: output.isEmpty = false
ProcessManager: readabilityHandler called
ProcessManager: availableData size = 89 bytes
ProcessManager: raw output = '00:24:32 [[32minfo[39m] [MCPServer]: [32mMCP Server connected on stdio transport[39m
'
ProcessManager: output.isEmpty = false
ProcessManager: ERROR readabilityHandler called
ProcessManager: ERROR availableData size = 38 bytes
ProcessManager: ERROR raw output = 'AI Memory MCP Server running on stdio
'
ProcessManager: cleaned output = '00:24:32 [info] [ConfigValidator]: Configuration validation passed {"errors":0,"warnings":0,"info":8}
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
MCP Server Output: 00:24:32 [[32minfo[39m] [ConfigValidator]: [32mApplication startup validation successful[39m

ProcessManager: cleaned output = '00:24:32 [info] [ConfigValidator]: Application startup validation successful
'
ProcessManager: Checking patterns:
ProcessManager:   - Pattern1 'MCP Server connected on stdio transport': false
ProcessManager:   - Pattern2 'AI Memory MCP Server running on stdio': false
ProcessManager:   - Current serverStatus: Starting...
ProcessManager: ❌ No startup patterns found in this output
MCP Server Output: 00:24:32 [[32minfo[39m] [MCPServer]: [32mHealth checker initialized[39m

ProcessManager: cleaned output = '00:24:32 [info] [MCPServer]: Health checker initialized
'
ProcessManager: Checking patterns:
ProcessManager:   - Pattern1 'MCP Server connected on stdio transport': false
ProcessManager:   - Pattern2 'AI Memory MCP Server running on stdio': false
ProcessManager:   - Current serverStatus: Starting...
ProcessManager: ❌ No startup patterns found in this output
MCP Server Output: 00:24:32 [[32minfo[39m] [MCPServer]: [32mMCP Server starting up[39m

ProcessManager: cleaned output = '00:24:32 [info] [MCPServer]: MCP Server starting up
'
ProcessManager: Checking patterns:
ProcessManager:   - Pattern1 'MCP Server connected on stdio transport': false
ProcessManager:   - Pattern2 'AI Memory MCP Server running on stdio': false
ProcessManager:   - Current serverStatus: Starting...
ProcessManager: ❌ No startup patterns found in this output
MCP Server Output: 00:24:32 [[32minfo[39m] [MCPServer]: [32mMCP Server connected on stdio transport[39m

ProcessManager: cleaned output = '00:24:32 [info] [MCPServer]: MCP Server connected on stdio transport
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
ProcessManager: startMCPServer() called
ProcessManager: Current serverStatus = running
ProcessManager: MCP server is already running or starting - exiting early