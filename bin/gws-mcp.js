#!/usr/bin/env node
import { readFileSync } from 'node:fs';

const args = process.argv.slice(2);

if (args.includes('--help') || args.includes('-h') || args[0] === 'help') {
  console.log(`Usage: gws-mcp [options]

Google Workspace MCP server for Gmail and Calendar workflows

Options:
  -V, --version  output the version number
  -h, --help     display help for command`);
  process.exit(0);
}

if (args.includes('--version') || args.includes('-V')) {
  const packageJson = JSON.parse(
    readFileSync(new URL('../package.json', import.meta.url), 'utf8')
  );
  console.log(packageJson.version);
  process.exit(0);
}

import('../dist/index.js').catch((error) => {
  console.error(error);
  process.exit(1);
});
