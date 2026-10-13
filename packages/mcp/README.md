# @agenttrust/mcp

An MCP server (Model Context Protocol over stdio) that gives an AI agent a wallet bounded by an on-chain, passkey-signed [AgentMandates](../../README.md) mandate on Monad.

The key this server holds is only as powerful as the mandate behind it: allowlisted contracts and functions, a per-call cap, a total budget, and an expiry, all enforced by the smart contract. If the model is prompt-injected or hallucinating, the worst case is spending up to the pre-approved budget on allowed calls. The human can revoke authority with one passkey tap.

## Tools

| Tool | What it does |
|---|---|
| `agenttrust_check_mandate(mandateId)` | Returns the mandate's limits, expiry, vault balances, and revoked status read from chain |
| `agenttrust_execute(target, selector, callData, value)` | Runs the call through SDK guard; returns the tx hash on success or a typed denial reason (`ExceedsPerCallLimit`, `PermissionDenied`, `MandateInactive`) |
| `agenttrust_verify_receipt(txHash)` | Returns the same checks as `npm run verify:tx` (receipt status, block number, gas used, emitted action) |
| `check_action(target, ...)` | Preflight dry-run check: `{ allowed: true }` or `{ allowed: false, reason: "..." }` |
| `pay_token(token, to, amount)` | Pays an allowed payee in an ERC-20 token (e.g. stablecoin) from the mandate's isolated token vault |

## MCP Client Configuration (10 lines)

Add this snippet to your MCP client configuration (`claude_desktop_config.json`, Cursor, etc.):

```json
{
  "mcpServers": {
    "agenttrust": {
      "command": "node",
      "args": ["packages/mcp/dist/index.js"],
      "env": {
        "AGENTTRUST_CONTRACT": "0x3550f9fc84640a9cfd7c51330615a1e05cb948be",
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
claude mcp add agenttrust -e AGENTTRUST_CONTRACT=0x3550f9fc84640a9cfd7c51330615a1e05cb948be -e AGENTTRUST_MANDATE_ID=1 -e AGENT_PRIVATE_KEY=0x<key> -- node packages/mcp/dist/index.js
```

## Running Tests

Test all denial paths (over limit, wrong target, revoked/inactive mandate) with in-memory MCP clients:
```bash
npm run test:mcp
```
