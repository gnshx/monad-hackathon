# @agenttrust/mcp

An MCP server that gives an AI agent a wallet bounded by an on-chain, passkey-signed [AgentMandates](../../README.md) mandate.

The key this server holds is only as powerful as the mandate behind it: allowlisted contracts and functions, a per-call cap, a total budget and an expiry, all enforced by the contract. If the model is prompt-injected, the worst case is spending the remaining budget on calls the human already approved. The human can revoke with one passkey tap.

## Tools

| Tool | What it does |
|---|---|
| `mandate_status` | Allowed contracts and functions, per-call cap, remaining budget, vault balance, expiry |
| `check_action` | Dry run against the contract: `{ allowed: true }` or `{ allowed: false, reason: "ExceedsBudget" }` |
| `execute_action` | Executes through the contract. Disallowed calls return `blockedBy` without spending gas |

Calls take `target`, plus either `functionSignature` and `args` (for example `"transfer(address,uint256)"`, `["0x…", "1000"]`) or raw `data`, plus `valueMON`.

## Setup

```bash
npm install && npm run build:mcp
```

```json
{
  "mcpServers": {
    "agenttrust": {
      "command": "node",
      "args": ["/path/to/monad-hackathon/packages/mcp/dist/index.js"],
      "env": {
        "AGENTTRUST_CONTRACT": "0x<AgentMandates>",
        "AGENTTRUST_MANDATE_ID": "1",
        "AGENT_PRIVATE_KEY": "0x<the mandate's agent key>",
        "AGENTTRUST_RPC_URL": "https://testnet-rpc.monad.xyz"
      }
    }
  }
}
```

For Claude Code: `claude mcp add agenttrust -e AGENTTRUST_CONTRACT=0x… -e AGENTTRUST_MANDATE_ID=1 -e AGENT_PRIVATE_KEY=0x… -- node /path/to/packages/mcp/dist/index.js`

## Try it locally

```bash
npm run e2e:serve     # terminal 1: local chain + a live mandate, writes .mcp-local.env
npm run mcp:smoke     # terminal 2: drives the server with a real MCP client
```
