# @agenttrust/sdk

TypeScript SDK for **AgentMandates**: passkey-owned spending mandates for AI agents on Monad.

```ts
import {
  AgentMandates, createBrowserPasskey, signWithBrowserPasskey, createSoftwarePasskey,
  encode, ownerKeyOf, ANY_SELECTOR,
} from '@agenttrust/sdk';
```

| Export | Use |
|---|---|
| `new AgentMandates(address, publicClient, walletClient?)` | Reads (`getMandate`, `getPermissions`, `mandatesOf`, `mandatesForAgent`, `checkAction`), challenges for owner actions (`createChallenge`, `revokeChallenge`, `revokeAllChallenge`, `withdrawChallenge`), `relay(data)` and agent `execute()` |
| `createBrowserPasskey(name)` | Create a device passkey and get its P-256 public key |
| `signWithBrowserPasskey(challenge, credentialId?)` | Prompt Face ID / Touch ID, returning the assertion struct the contract expects (low-S normalized, indices located, UV checked) |
| `createSoftwarePasskey()` | Byte-compatible WebAuthn assertions from a software key, for scripts, CI and tests |
| `encode.createMandate / revoke / revokeAll / withdraw` | Calldata any relayer can submit |
| `createDigest`, `revokeDigest`, … | Off-chain mirrors of the contract's digests |
| `mandateTools(mandates, id)` | Framework-agnostic LLM tools (`mandate_status`, `check_action`, `execute_action`, `pay_token`) with JSON-Schema inputs |
| `MandateDeniedError` | Thrown by `execute()`, `payToken()` and `relay()` with the contract's reason before any gas is spent |
| `MandateCallFailedError` | Thrown before sending when the mandate allows a call but the target would revert it (`CallFailed`, with the target's reason when it has one) |
| `verifyMandatesReceipt(publicClient, address, txHash, { expectedMandateId })` | Checks a receipt emitted `ActionExecuted` or `TokenPaid` from AgentMandates |

```ts
const mandates = new AgentMandates(address, publicClient, agentWallet);
const res = await mandates.checkAction(id, agent, target, data, value); // { allowed, reason? }
await mandates.execute(id, target, data, value);
```

---

## v1 API (MandateManager)

The rest of this file documents the v1 `AgentTrustClient` for the wallet-owned `MandateManager` contract.


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

The SDK is not published to npm. (`@agenttrust/sdk` on npm is an unrelated package; do not install it.) Build it from this repo:

```bash
git clone https://github.com/gnshx/monad-hackathon.git
cd monad-hackathon
npm install && npm run build:sdk
```

Code inside the monorepo's workspaces imports it as `@agenttrust/sdk`. From another project on the same machine, install the built folder by path: `npm install /path/to/monad-hackathon/packages/sdk`.

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
