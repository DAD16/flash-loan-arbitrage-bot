#!/usr/bin/env node
/**
 * Pre-command validation hook for Claude Code
 *
 * Blocks dangerous commands that would crash Claude (which runs as Node.js)
 *
 * Exit codes:
 *   0 = Allow command
 *   1 = Block command (with message to stderr)
 */

// Read hook input from stdin
let input = '';
process.stdin.setEncoding('utf8');

process.stdin.on('data', (chunk) => {
  input += chunk;
});

process.stdin.on('end', () => {
  try {
    const hookData = JSON.parse(input);
    const toolName = hookData.tool_name;
    const toolInput = hookData.tool_input || {};

    // Only check Bash commands
    if (toolName !== 'Bash') {
      process.exit(0);
    }

    const command = (toolInput.command || '').toLowerCase();

    // Dangerous patterns that kill ALL node processes (including Claude)
    const dangerousPatterns = [
      // Windows taskkill by image name
      /taskkill\s+.*\/im\s+node/i,
      /taskkill\s+\/f\s+\/im\s+node/i,
      /taskkill\s+\/im\s+node.*\/f/i,

      // PowerShell Stop-Process by name
      /stop-process\s+.*-name\s+node/i,
      /stop-process\s+-name\s+node/i,

      // WMIC
      /wmic\s+process\s+.*node.*delete/i,

      // Get-Process | Stop-Process patterns
      /get-process\s+.*node.*\|\s*stop-process/i,

      // Linux/Mac (in case of WSL)
      /pkill\s+(-\d+\s+)?node/i,
      /killall\s+node/i,
    ];

    for (const pattern of dangerousPatterns) {
      if (pattern.test(command)) {
        console.error(`
⛔ BLOCKED: This command would crash Claude Code!

Claude runs as a Node.js process. Killing all node processes kills Claude.

Command attempted: ${toolInput.command}

✅ Safe alternative:
   node scripts/process-manager.js status      # See running processes
   node scripts/process-manager.js stop <name> # Stop specific process
`);
        process.exit(1);
      }
    }

    // Command is safe
    process.exit(0);

  } catch (err) {
    // If we can't parse, allow the command (fail open)
    console.error(`Hook parse error: ${err.message}`);
    process.exit(0);
  }
});
