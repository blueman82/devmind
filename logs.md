ProcessManager: startMCPServer() called
ProcessManager: Current serverStatus = stopped
MCPClient connection status updated: false → false
MCPClient isConnected property is now: false
MCPClient connection status updated: false → false
MCPClient isConnected property is now: false
ProcessManager: readabilityHandler called
ProcessManager: availableData size = 122 bytes
ProcessManager: raw output = '23:55:22 [[32minfo[39m] [ConfigValidator]: [32mConfiguration validation passed[39m {"errors":0,"warnings":0,"info":8}
'
ProcessManager: output.isEmpty = false
MCP Server Output: 23:55:22 [[32minfo[39m] [ConfigValidator]: [32mConfiguration validation passed[39m {"errors":0,"warnings":0,"info":8}

ProcessManager: readabilityHandler called
ProcessManager: availableData size = 36 bytes
ProcessManager: raw output = '✅ Configuration validation passed
'
ProcessManager: output.isEmpty = false
ProcessManager: readabilityHandler called
ProcessManager: availableData size = 173 bytes
ProcessManager: raw output = '23:55:22 [[32minfo[39m] [ConfigValidator]: [32mApplication startup validation successful[39m
23:55:22 [[32minfo[39m] [MCPServer]: [32mHealth checker initialized[39m
'
ProcessManager: output.isEmpty = false
ProcessManager: readabilityHandler called
ProcessManager: availableData size = 72 bytes
ProcessManager: raw output = '23:55:22 [[32minfo[39m] [MCPServer]: [32mMCP Server starting up[39m
'
ProcessManager: output.isEmpty = false
ProcessManager: readabilityHandler called
ProcessManager: availableData size = 89 bytes
ProcessManager: raw output = '23:55:22 [[32minfo[39m] [MCPServer]: [32mMCP Server connected on stdio transport[39m
'
ProcessManager: output.isEmpty = false
ProcessManager: ERROR readabilityHandler called
ProcessManager: ERROR availableData size = 38 bytes
ProcessManager: ERROR raw output = 'AI Memory MCP Server running on stdio
'
ProcessManager: cleaned output = '23:55:22 [info] [ConfigValidator]: Configuration validation passed {"errors":0,"warnings":0,"info":8}
'
ProcessManager: Checking patterns:
ProcessManager:   - Pattern1 'MCP Server connected on stdio transport': false
ProcessManager:   - Pattern2 'AI Memory MCP Server running on stdio': false
ProcessManager:   - Current serverStatus: Starting...
ProcessManager: ❌ No startup patterns found in this output