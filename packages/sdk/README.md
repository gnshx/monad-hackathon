# @agenttrust/sdk

> Deterministic On-Chain Permission Boundary & Mandate Enforcement SDK for AI Agents on Monad.

[![Monad Testnet: Chain 10143](https://img.shields.io/badge/Monad_Testnet-10143-6930C3.svg)](https://testnet.monadexplorer.com)
[![Passkey RIP-7212: Verified](https://img.shields.io/badge/Passkey_Precompile-0x0100_Verified-10B981.svg)](https://testnet.monadexplorer.com)
[![ERC-8004 Identity: Bound](https://img.shields.io/badge/ERC--8004_Identity-Compatible-3B82F6.svg)](https://testnet.monadexplorer.com)

The AgentTrust SDK enables autonomous AI agents, MCP tool servers, and DeFi bots to verify mandates, execute transactions within cryptographic spending and method boundaries, and independently audit execution receipts on Monad.

---

## 10-Line Quickstart

```typescript
import { AgentTrustClient } from '@agenttrust/sdk';
import { createPublicClient, createWalletClient, http, parseEther } from 'viem';

const publicClient = createPublicClient({ transport: http('https://testnet-rpc.monad.xyz') });
const client = new AgentTrustClient({ contractAddress: '0x...', publicClient });

// 1. Preflight check: Verify intent satisfies on-chain policy bounds before broadcasting
const preflight = await client.verifyPreflight(mandateId, { agentId: 1n, target: '0x...', selector: '0xa9059cbb', value: parseEther('0.05') });
if (!preflight.valid) throw new Error(`Policy violation: ${preflight.reason}`);

// 2. Execute within strict on-chain mandate bounds (reverts if exceeded)
const { transactionHash } = await client.execute({ mandateId, agentId: 1n, target: '0x...', selector: '0xa9059cbb', callData: '0x...', value: parseEther('0.05') });

// 3. Independently verify the on-chain receipt against the contract
const receipt = await client.verifyReceipt(transactionHash, { expectedMandateId: mandateId, expectedMaxValue: parseEther('0.1') });
console.log('Action verified on Monad:', receipt.verified);
```

---

## Features

- **RIP-7212 Native P-256 Verification**: Connects passkey-signed human mandates to Monad's `0x0100` precompile.
- **Fail-Closed Spend & Method Caps**: Native MON limits and 4-byte selector allowlists strictly enforced on-chain.
- **ERC-8004 Identity Verification**: Validates that the executing agent's designated wallet matches its registered identity in Monad's on-chain Identity Registry (`0x8004A818BFB912233c491871b3d84c89A494BD9e`).
- **Independent Zero-Backend Auditing**: Receipt verifier decodes `ActionExecuted` logs and proves compliance directly against RPC nodes.

## Installation

```bash
npm install @agenttrust/sdk
# or install from GitHub Release:
npm install https://github.com/gnshx/monad-hackathon/releases/download/v0.1.0/agenttrust-sdk-0.1.0.tgz
```

## Testing

```bash
npm test
# Verify live RIP-7212 precompile on Monad testnet:
npm run verify:p256
# Verify live ERC-8004 identity registry on Monad testnet:
npm run verify:erc8004
```

## License

MIT
