// Drives the AgentTrust MCP server through a real MCP client over stdio.
// Usage: npx tsx scripts/mandates-e2e.ts --serve   (in another terminal), then: node scripts/mcp-smoke.mjs
import fs from 'node:fs';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const env = Object.fromEntries(fs.readFileSync('.mcp-local.env', 'utf8').trim().split('\n').map((l) => l.split('=')));
const client = new Client({ name: 'smoke', version: '0.0.0' });
await client.connect(new StdioClientTransport({ command: 'node', args: ['packages/mcp/dist/index.js'], env: { ...process.env, ...env } }));

const show = async (name, args = {}) => {
  const res = await client.callTool({ name, arguments: args });
  console.log(`\n▶ ${name} ${JSON.stringify(args)}\n${res.content[0].text}`);
};
console.log('tools:', (await client.listTools()).tools.map((t) => t.name).join(', '));
await show('mandate_status');
await show('check_action', { target: env.TARGET, functionSignature: 'doSomething(uint256)', args: ['7'], valueMON: '0.005' });
await show('execute_action', { target: env.TARGET, functionSignature: 'doSomething(uint256)', args: ['7'], valueMON: '0.005' });
await show('execute_action', { target: env.TARGET, functionSignature: 'doSomething(uint256)', args: ['8'], valueMON: '0.5' });
await show('execute_action', { target: '0x000000000000000000000000000000000000dEaD', valueMON: '0.001' });
await show('pay_token', { token: env.USDC, to: env.MERCHANT, amount: '2.5' });
await show('pay_token', { token: env.USDC, to: env.MERCHANT, amount: '50' });
await client.close();
