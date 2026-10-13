# 🤝 External Integrator Quickstart: Add `guard()` in 15 Minutes

> **Pitch to Monad Hackathon Teams:**  
> *"Hey everyone! We built AgentTrust for Metropolis. If your agent executes on-chain transactions or calls tools, we can add `guard()` to prevent overspending and prompt-injected drains in 15 minutes. We'll open the PR for you! Free security layer for your demo."*

---

## 🚀 Why Partner With AgentTrust?

1. **Zero Liability for Your Demo:** If your LLM hallucinates or gets prompt-injected during your live demo video, AgentTrust guarantees your agent can never exceed its spending cap or call unallowlisted addresses.
2. **Double Hackathon Track Credit:** Your project gains points in both your primary track AND Metropolis (Trust & Data Ownership) by showing a live working composability integration.
3. **Takes 5 Lines of Code:** No changes to your agent prompt or LLM logic.

---

## 💻 15-Minute Integration Example

### Before (Unprotected Agent Tool Call)
```typescript
// Your existing agent code:
async function executeSwap(tokenOut: string, amount: bigint) {
  return await walletClient.writeContract({
    address: DEX_ROUTER,
    abi: ROUTER_ABI,
    functionName: 'swap',
    args: [tokenOut, amount],
  });
}
```

### After (Guarded by AgentTrust On-Chain Mandate)
```typescript
import { createAgentGuard } from '@agenttrust/sdk';

// 1. Initialize guard with your mandate ID
const guard = createAgentGuard({
  mandateId: 1n,
  agentId: 1n, // Your ERC-8004 registered agent ID
  contractAddress: '0x...', // MandateManager on Monad
  publicClient,
  walletClient,
});

// 2. Execute through the on-chain boundary
async function executeSwap(tokenOut: string, amount: bigint) {
  const result = await guard.execute({
    target: DEX_ROUTER,
    selector: '0x38ed1739', // swap selector
    callData: encodeFunctionData({ abi: ROUTER_ABI, functionName: 'swap', args: [tokenOut, amount] }),
    value: 0n,
  });

  console.log('Action successfully executed & verified on Monad:', result.transactionHash);
  return result;
}
```

---

## 📋 Ready-to-Send Outreach Message for Discord / Matchmaking

```text
Hey team! 👋 We love what you're building with [Agent Name].

We're building AgentTrust (hardware passkey mandates for AI agents on Monad). We'd love to help secure your agent's execution layer before demo submissions.

With our 1-line `guard()` middleware, your agent executes transactions within strict on-chain spending caps and contract allowlists, so even if prompt injection occurs during the video, funds can never be drained.

We can open a quick PR to your repo in 15 minutes, or provide the helper snippet. Would you be open to an integration? We'll feature you in our pitch slides and demo as a launch partner!
```
