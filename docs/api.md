# AgentTrust — API & SDK Reference (`@agenttrust/sdk`)

## Overview

The `@agenttrust/sdk` is a lightweight, typed TypeScript client designed to integrate with `MandateManager.sol` on Monad. It requires no backend server and communicates directly with standard Monad RPC nodes.

---

## Installation

```bash
npm install @agenttrust/sdk viem
# or
pnpm add @agenttrust/sdk viem
```

---

## Client Initialization

```typescript
import { AgentTrustClient } from '@agenttrust/sdk';

const client = new AgentTrustClient({
  rpcUrl: 'https://testnet-rpc.monad.xyz',
  chainId: 10143,
  mandateManager: '0x836EF907c125d7b57F481De24A9A65D65A4B2901',
  p256Precompile: '0x0000000000000000000000000000000000000100',
});
```

---

## Core Methods

### 1. `createMandate(mandateParams, passkeyAssertion)`
Submits a passkey-authorized mandate to Monad.

```typescript
const mandateId = await client.createMandate({
  agentId: 1n,
  owner: '0x32A4B8927160B5B03C8c1b975e52c8F8E1d40A7C',
  allowedTargets: ['0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D'],
  allowedSelectors: ['0x38ed1739'],
  maxValuePerAction: parseEther('0.25'),
  maxTotalValue: parseEther('2.50'),
  expiresAt: BigInt(Math.floor(Date.now() / 1000) + 86400 * 7),
  nonce: 0n,
}, passkeyAssertion);
```

### 2. `executeAction(actionParams)`
Autonomous AI agent executes an action within mandate limits.

```typescript
const receipt = await client.executeAction({
  mandateId: '0x8f3c7e92...',
  target: '0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D',
  value: parseEther('0.10'),
  data: '0x38ed1739...',
  agentKey: process.env.AGENT_PRIVATE_KEY
});
```

### 3. `revokeMandate(mandateId, passkeyAssertion)`
User revokes the mandate immediately via biometric passkey signature.

```typescript
await client.revokeMandate('0x8f3c7e92...', passkeyAssertion);
```

### 4. `verifyReceipt(actionHash)`
**Zero-Trust Portable Verification:** Validates any receipt directly on-chain.

```typescript
const audit = await client.verifyReceipt('0x17b98d24...');

console.log(audit.isValid); // true
console.log(audit.spentTotal); // 0.10 MON
console.log(audit.isRevoked); // false
```
