# @agenttrust/mcp

An MCP server (Model Context Protocol over stdio) that gives an AI agent a wallet bounded by an on-chain, passkey-signed [AgentMandates](../../README.md) mandate on Monad.

The key this server holds is only as powerful as the mandate behind it: allowlisted contracts and functions, a per-call cap, a total budget, and an expiry, all enforced by the smart contract. If the model is prompt-injected or hallucinating, the worst case is spending up to the pre-approved budget on allowed calls. The human can revoke authority with one passkey tap.

## Tools

| Tool | What it does |
|---|---|
| `agenttrust_check_mandate(mandateId)` / `mandate_status` | Returns the mandate's limits, expiry, vault balances and status read from chain (`active`, `revoked`, `revokedAll`, `expired` or `notFound`) |
| `agenttrust_execute(target, selector?, callData? \| functionSignature + args?, value)` / `execute_action` | Runs the call through the mandate; returns the tx hash on success or a typed denial reason (`ExceedsPerCallLimit`, `PermissionDenied`, `MandateInactive`). A call the target would revert is not sent either. |
| `agenttrust_verify_receipt(txHash, mandateId?)` | Checks the receipt succeeded and AgentMandates emitted `ActionExecuted` or `TokenPaid` for the mandate |
| `check_action(target, ...)` | Preflight dry-run check: `{ allowed: true }` or `{ allowed: false, reason: "..." }` |
| `pay_token(token, to, amount)` | Pays an allowed payee in an ERC-20 token (e.g. stablecoin) from the mandate's isolated token vault; decimals are read from the token |

## Install

This package is not published to npm. Build it from the repo:

```bash
git clone https://github.com/gnshx/monad-hackathon.git
cd monad-hackathon
npm install && npm run build:mcp
```

The server is then `node packages/mcp/dist/index.js`. Use the absolute path in client configs.

## MCP Client Configuration

`AGENTTRUST_CONTRACT` is the AgentMandates (v2) contract, `0xc911e902bf3b3f532bffc1a988e2d00969a1237c` on Monad testnet (see `deployments.mandates.json`). The legacy v1 MandateManager address does not work with this server.

Add this snippet to your MCP client configuration (`claude_desktop_config.json`, Cursor, etc.):

```json
{
  "mcpServers": {
    "agenttrust": {
      "command": "node",
      "args": ["/absolute/path/to/monad-hackathon/packages/mcp/dist/index.js"],
      "env": {
        "AGENTTRUST_CONTRACT": "0xc911e902bf3b3f532bffc1a988e2d00969a1237c",
        "AGENTTRUST_MANDATE_ID": "1",
        "AGENT_PRIVATE_KEY": "0x<the-agent-private-key>",
        "AGENTTRUST_RPC_URL": "https://testnet-rpc.monad.xyz"
      }
    }
  }
}
```

For Claude Code CLI:
```bash
claude mcp add agenttrust -e AGENTTRUST_CONTRACT=0xc911e902bf3b3f532bffc1a988e2d00969a1237c -e AGENTTRUST_MANDATE_ID=1 -e AGENT_PRIVATE_KEY=0x<key> -- node /absolute/path/to/monad-hackathon/packages/mcp/dist/index.js
```

## Running Tests

Test all denial paths (over limit, wrong target, revoked/inactive mandate) with in-memory MCP clients (Node 20+; run `npm run build:sdk` first so the SDK's `dist` exists):
```bash
npm run test:mcp
```
