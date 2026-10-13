# AgentTrust — Integrator Guide & Hackathon Matchmaking

## Why Integrate AgentTrust?

If your hackathon project builds:
- An **Autonomous AI Trading Agent** or arbitrage bot
- An **MCP (Model Context Protocol)** tool server or autonomous assistant
- A **DAO Treasury Management** or automated streaming payroll tool
- An **On-Chain Agent Identity** or Social Agent network

**AgentTrust solves your liability and trust problem.** Instead of asking users to give your AI agent their private key or trust that your LLM won't hallucinate a destructive transaction, you integrate `@agenttrust/sdk` in less than 15 minutes. 

Users grant your agent a scoped Passkey mandate. Your agent is cryptographically incapable of draining funds or executing unlisted actions.

---

## 15-Minute Integration Walkthrough

### Step 1: Build `@agenttrust/sdk` from the repo

The SDK is not published on npm, and `npm install @agenttrust/sdk` fetches an unrelated package from another publisher. Build it from a clone and use it inside the workspace:

```bash
git clone https://github.com/gnshx/monad-hackathon.git
cd monad-hackathon
npm install
npm run build:sdk
```

### Step 2: Request User Mandate in Your UI

Direct users to sign a mandate using their Passkey:

```typescript
import { AgentTrustClient } from '@agenttrust/sdk';

const client = new AgentTrustClient({
  rpcUrl: 'https://testnet-rpc.monad.xyz',
  mandateManager: '0x836EF907c125d7b57F481De24A9A65D65A4B2901'
});

// Prompt user for Passkey authorization
const mandateId = await client.requestPasskeyMandate({
  agentId: 101n, // Your registered agent ID
  allowedTargets: [YOUR_PROTOCOL_CONTRACT_ADDRESS],
  allowedSelectors: ['0x38ed1739'], // Your protocol methods
  maxValuePerAction: parseEther('0.5'),
  maxTotalValue: parseEther('5.0'),
  durationDays: 7
});
```

### Step 3: Wrap AI Agent Tool Calls

In your LangChain / AutoGPT / custom tool execution function:

```typescript
async function executeAgentTool(toolCall) {
  // Pass action through AgentTrust Mandate Manager on Monad
  const receipt = await client.executeAction({
    mandateId: userMandateId,
    target: toolCall.targetContract,
    value: toolCall.monValue,
    data: toolCall.calldata,
    agentKey: process.env.MY_AGENT_KEY
  });

  return {
    status: receipt.decision,
    txHash: receipt.transactionHash,
    actionHash: receipt.actionHash
  };
}
```

### Step 4: Verify Receipts Independently

Prove to your users that transactions adhered to their policy:

```typescript
const audit = await client.verifyReceipt(receipt.actionHash);
assert(audit.isValid === true);
```

---

## Matchmaking & Post-Event Adoption Plan

1. **Hackathon Co-Integration:** 
   - We are collaborating with teams building DeFi agents, MCP servers, and yield aggregators on Monad.
   - Example client implementation provided in `examples/integrator-app/`.
2. **Post-Event Roadmap:**
   - Grant program application for official Monad Ecosystem Agent Tooling.
   - Support for BTX encrypted mempools to prevent front-running of autonomous agent transactions.
   - ERC-4337 Smart Account compatibility plugin.
