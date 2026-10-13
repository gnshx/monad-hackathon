<p align="center">
  <img src="./docs/assets/agenttrust_logo.jpg" alt="AgentTrust" width="140" style="border-radius: 20px; box-shadow: 0 8px 24px rgba(89, 68, 219, 0.3);" />
</p>

<h1 align="center">AgentTrust</h1>

<p align="center">
  <strong>Decentralized Hardware Passkey-Owned Spending Mandates for Autonomous AI Agents on Monad</strong><br/>
  <em>Enforce programmable economic guardrails at the EVM consensus boundary — give agents a cryptographically sealed budget, not private keys.</em>
</p>

<p align="center">
  <a href="https://monad-hackathon-amber.vercel.app"><img src="https://img.shields.io/badge/Console-Live%20on%20Vercel-5944DB?style=for-the-badge&logo=vercel&logoColor=white" alt="Live Console" /></a>
  <a href="https://testnet.monadexplorer.com/address/0xc911e902bf3b3f532bffc1a988e2d00969a1237c"><img src="https://img.shields.io/badge/Monad%20Testnet-Chain%2010143-201A30?style=for-the-badge&logo=ethereum&logoColor=836EF9" alt="Monad Testnet" /></a>
  <img src="https://img.shields.io/badge/Tests-142%2F142%20Passing-059669?style=for-the-badge&logo=checkmarx&logoColor=white" alt="Tests 142/142 Passing" />
  <img src="https://img.shields.io/badge/Security-RIP--7212%20Precompile-0284C7?style=for-the-badge&logo=webauthn&logoColor=white" alt="RIP-7212 Precompile" />
  <img src="https://img.shields.io/badge/License-MIT-gray?style=for-the-badge" alt="MIT License" />
</p>

<p align="center">
  <a href="https://monad-hackathon-amber.vercel.app"><strong>Live Web Console</strong></a> •
  <a href="#-technology-stack--architecture"><strong>Technology Stack</strong></a> •
  <a href="#-quickstart--developer-experience"><strong>Quickstart</strong></a> •
  <a href="#-integration-guide"><strong>Integration</strong></a> •
  <a href="#-live-monad-testnet-deployments--evidence"><strong>Live Deployments</strong></a> •
  <a href="docs/security.md"><strong>Security Model</strong></a> •
  <a href="docs/submission.md"><strong>Submission Dossier</strong></a>
</p>

---

## 📌 Executive Summary & Architecture Paradigm

Autonomous AI agents are increasingly operating as sovereign economic actors—paying per-token API fees, executing automated DeFi rebalances, procuring compute, and settling micro-transactions.

Under legacy agent architectures, developers hand an LLM runtime an **unconstrained ECDSA private key**. This design creates a critical single point of failure:
- **Prompt Injection:** Adversarial instructions in context can force arbitrary transaction signing.
- **Context Hallucination:** Erroneous tool parameter extraction leads to runaway capital loss.
- **Server/Memory Exfiltration:** Exposed `.env` variables or process memory dumps drain connected treasuries.

**AgentTrust solves this problem by moving the policy enforcement boundary from untrusted off-chain software to the Monad EVM consensus layer.**

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                                  SECURITY PERIMETER                                    │
│                                                                                        │
│   HUMAN ROOT OF TRUST                       IMMUTABLE ON-CHAIN BOUNDARY                │
│  ┌───────────────────────┐                 ┌──────────────────────────────────────┐    │
│  │ Touch ID / Face ID    │                 │ AgentMandates.sol (Chain 10143)      │    │
│  │ Secure Enclave        │  Passkey Auth   │ ├─ RIP-7212 P-256 Precompile (0x100) │    │
│  │ (P-256 Public Key)    ├────────────────►│ ├─ ERC-8004 Agent Identity Binding   │    │
│  └───────────────────────┘  (Gasless Relay)│ ├─ Target & Selector Allowlisting    │    │
│                                            │ ├─ Value Per-Call & Cumulative Caps  │    │
│   AUTONOMOUS AI AGENT                      │ ├─ Isolated Vault Accounting         │    │
│  ┌───────────────────────┐                 │ └─ 1-Tap Consensus Revocation        │    │
│  │ LLM Hot Key / MCP     │  execute()      │                                      │    │
│  │ (Claude / Cursor / AI)├────────────────►│  ✅ WITHIN BUDGET: Execution Approved │    │
│  └───────────────────────┘                 │  ❌ OUT OF POLICY: Consensus Revert  │    │
│                                            └──────────────────────────────────────┘    │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

A human owner signs a scoped **spending mandate** using their physical device hardware authenticator (Apple Face ID, Touch ID, Windows Hello, or YubiKey). Monad's native **RIP-7212 P-256 precompile** at `0x0100` verifies the WebAuthn signature directly on-chain. The agent receives bounded operational authority; if the model suffers a prompt injection, the contract physically reverts any out-of-policy transaction.

---

## 🏗️ Technology Stack & Architecture

AgentTrust is architected as an enterprise-grade monorepo containing smart contracts, a zero-dependency TypeScript SDK, an MCP server for agent tool loops, and a Next.js 15 operational console.

```
monad-hackathon/
├── contracts/               # Solidity 0.8.24 smart contracts & Foundry test harnesses
│   ├── src/
│   │   ├── AgentMandates.sol          # Primary primitive: passkey-owned spending mandates & vaults
│   │   ├── MandateManager.sol         # v1 core execution manager (preserved for audit parity)
│   │   └── lib/WebAuthnP256.sol       # Zero-copy WebAuthn parser & RIP-7212 precompile verifier
│   └── test/                          # 72 fuzz, invariant, and cryptographic vector test suites
├── packages/
│   ├── sdk/                 # @agenttrust/sdk: Zero-dependency Viem-based client library
│   │   └── src/mandates/              # Challenge digests, WebAuthn helpers, receipt verifiers
│   └── mcp/                 # @agenttrust/mcp: Model Context Protocol server for Claude / AI
└── apps/
    └── web/                 # Next.js 15 App Router operations console & gasless relayer
        ├── src/app/api/relay/         # Protected gasless relayer with rate & spend caps
        ├── src/app/api/judge-mode/    # 1-click testnet auditor endpoint for evaluators
        └── src/components/            # Biometric passkey registration & execution monitor
```

### 1. Blockchain & Consensus Layer
- **Target Network:** Monad Testnet (EVM Chain ID `10143`).
- **P-256 Cryptographic Precompile (`0x0000000000000000000000000000000000000100`):** Native RIP-7212 precompile accelerating SECP256R1 signature verification to ~6,900 gas (50x cheaper than EVM user-space bytecode).
- **ERC-8004 Identity Composability (`0x8004A818BFB912233c491871b3d84c89A494BD9e`):** Canonical on-chain Agent Identity Registry. Agent wallet binding is validated on every single execution; revoking or rotating an agent's ERC-8004 NFT immediately cuts off spending power.

### 2. Smart Contract Engineering
- **Language:** Solidity `0.8.24` (via IR optimization enabled, 200 runs).
- **Toolchain:** Foundry (`forge`, `cast`, `anvil` Osaka hardfork).
- **Security Features:**
  - Strict low-S signature normalization ($s \le n/2$) preventing ECDSA malleability.
  - Zero-storage-leak isolated vault mappings (`mandateBalances[mandateId]`).
  - Strict caller gating: `CallerNotAuthorized` CRIT-01 defense.
  - Reentrancy guards and ERC-20 safe transfer wrappers.

### 3. Client & Agent Integration Layer
- **Language & Runtime:** TypeScript 5.5+, Node.js 20+ ESM.
- **Web3 Client:** [Viem](https://viem.sh) v2 for type-safe EVM serialization and contract interaction.
- **Model Context Protocol (MCP):** Standards-compliant MCP server exposing `mandate_status`, `check_action`, `execute_action`, and `pay_token` tools to Claude Desktop, Claude Code, Cursor, and ElizaOS.
- **Testing Frameworks:** Vitest 2.1 for SDK and cryptographic digest parity tests; Node.js test runner (`tsx --test`) for integration suites.

### 4. Infrastructure & Gas Relayer Layer
- **Framework:** Next.js 15 (App Router, Server Components, API Route Handlers).
- **Gasless Relayer:** Server-side sponsored transactions via `/api/relay`. Evaluates signatures via local `eth_call` simulations prior to network broadcasting to prevent gas griefing.
- **Abuse Prevention:** Sliding-window IP rate limiting (10 req/min), per-tx spend cap (0.05 MON), per-IP daily cap (0.10 MON), and global daily spend cap (0.50 MON).
- **Hosting:** Vercel Production (`https://monad-hackathon-amber.vercel.app`).

---

## ⚖️ Architectural Comparison

| Architectural Dimension | Traditional Hot Key | Session Keys (ERC-4337) | Off-Chain Policy Engine | AgentTrust (Monad Native) |
| :--- | :---: | :---: | :---: | :---: |
| **Enforcement Boundary** | Client runtime (None) | Smart Account Bundler | Off-chain API Server | **On-Chain EVM Consensus** |
| **Root of Trust** | Raw Private Key | Contract Wallet Vendor | Centralized SaaS API | **Hardware Passkey (Touch/Face ID)** |
| **Prompt Injection Defense** | ❌ Vulnerable | ⚠️ Partial | ⚠️ Server Dependable | **Immutable Smart Contract** |
| **Agent Identity Binding** | ❌ None | ❌ None | ⚠️ Web2 Database | **ERC-8004 On-Chain Registry** |
| **Gas Cost for Passkey Auth** | N/A | ~350,000 gas (Bytecode) | N/A | **~6,900 gas (RIP-7212 Precompile)** |
| **Vendor Lock-In** | None | High (Vendor-specific) | Critical (Single SaaS point) | **Open Protocol (Zero Vendor Lock)** |

---

## ⚡ Quickstart & Developer Experience

### Prerequisites
- [Node.js](https://nodejs.org) >= 20.0.0
- [Foundry](https://getfoundry.sh) (`curl -L https://foundry.paradigm.xyz | bash && foundryup`)

### 1. Clone & Build
```bash
git clone https://github.com/gnshx/monad-hackathon.git
cd monad-hackathon
npm install
npm run build:sdk
```

### 2. Run Comprehensive Test Matrix (142 / 142 Passing)
```bash
# 1. Run Solidity contract suite (72 tests, 1,000-run fuzzing)
npm run test:contracts

# 2. Run TypeScript SDK unit & WebAuthn digest suites (34 tests)
npm run test:sdk

# 3. Run Judge Mode runner, rate limiter & relayer security suites (19 tests)
npm run test:judge

# 4. Run Strict Testnet Receipt & Bytecode Auditor (9 tests)
npm run test:auditor

# 5. Run Model Context Protocol server suite (8 tests)
npm run test:mcp
```

### 3. Local End-to-End Simulation with Precompile
Simulates the full lifecycle locally by launching Anvil with the Osaka hardfork (exposing the P-256 precompile at `0x0100`):
```bash
npm run e2e
```
*Flow executed: Passkey creation ➔ Relayed mandate grant ➔ Allowed action ➔ Stablecoin payment ➔ Over-limit revert ➔ Rogue target revert ➔ 1-tap passkey revocation ➔ Vault reclaim.*

---

## 🔌 Integration Guide

### Option A: Connect an Agent via Model Context Protocol (MCP)

AgentTrust provides a zero-config MCP server compatible with **Claude Desktop**, **Claude Code**, **Cursor**, and **ElizaOS**.

Add the server to your MCP client configuration (`claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "agenttrust": {
      "command": "node",
      "args": ["/path/to/monad-hackathon/packages/mcp/dist/index.js"],
      "env": {
        "AGENTTRUST_CONTRACT": "0xc911e902bf3b3f532bffc1a988e2d00969a1237c",
        "AGENTTRUST_MANDATE_ID": "1",
        "AGENT_PRIVATE_KEY": "0x<AGENT_HOT_KEY>",
        "MONAD_RPC_URL": "https://testnet-rpc.monad.xyz"
      }
    }
  }
}
```

The agent is granted four typed tools:
1. `mandate_status`: Reads remaining budget, expiration, and approved targets.
2. `check_action`: Dry-runs any action before executing; returns `{ ok: false, blockedBy: 'ExceedsPerCallLimit' }` without spending gas if out of policy.
3. `execute_action`: Executes the permitted transaction on Monad.
4. `pay_token`: Dispatches payments in allowlisted ERC-20 stablecoins.

### Option B: Direct Integration via TypeScript SDK

```ts
import { AgentMandates, createBrowserPasskey, signWithBrowserPasskey, encode } from '@agenttrust/sdk';
import { createPublicClient, http } from 'viem';

const publicClient = createPublicClient({ transport: http('https://testnet-rpc.monad.xyz') });
const mandates = new AgentMandates('0xc911e902bf3b3f532bffc1a988e2d00969a1237c', publicClient);

// 1. Human Owner: Authorize mandate with Face ID / Touch ID (Zero Wallet Needed)
const { publicKey, credentialId } = await createBrowserPasskey('alice');
const challenge = await mandates.createChallenge(publicKey, terms);
const assertion = await signWithBrowserPasskey(challenge, credentialId);

// 2. Dispatch via gasless relayer
await fetch('https://monad-hackathon-amber.vercel.app/api/relay', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ data: encode.createMandate(publicKey, terms, assertion) })
});

// 3. Autonomous Agent: Execute transaction within policy bounds
const check = await mandates.checkAction(mandateId, agentAddress, targetAddress, calldata, valueWei);
if (check.allowed) {
  const hash = await mandates.execute(mandateId, targetAddress, calldata, valueWei);
  console.log(`Executed: https://testnet.monadexplorer.com/tx/${hash}`);
}
```

### Option C: Synchronous Protocol Gating (Solidity)

Counterparty protocols can synchronously verify agent authority on-chain without trusting any off-chain API:

```solidity
// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

interface IAgentMandates {
    function checkAction(
        uint256 mandateId,
        address agent,
        address target,
        bytes calldata data,
        uint256 value
    ) external view returns (bool allowed, bytes4 reason);
}

contract MonadDeFiRouter {
    address public immutable MANDATES;

    constructor(address mandates) {
        MANDATES = mandates;
    }

    function executeOrder(uint256 mandateId, bytes calldata orderPayload) external payable {
        (bool authorized, ) = IAgentMandates(MANDATES).checkAction(
            mandateId,
            msg.sender,
            address(this),
            msg.data,
            msg.value
        );
        require(authorized, "AgentTrust: Action exceeds human authorization");
        
        // Settle order logic...
    }
}
```

---

## ⛓️ Live Monad Testnet Deployments & Evidence

All contracts are deployed on **Monad Testnet (Chain ID `10143`)**. Every execution scenario and security revert is mined on-chain and verifiable via Monad Explorer.

### Core Deployments
| Contract / Primitive | Monad Testnet Address | Bytecode Size | Explorer Link |
| :--- | :--- | :---: | :--- |
| **AgentMandates (Primary)** | `0xc911e902bf3b3f532bffc1a988e2d00969a1237c` | 26,274 hex chars | [View on Explorer](https://testnet.monadexplorer.com/address/0xc911e902bf3b3f532bffc1a988e2d00969a1237c) |
| **MandateManager (Core v1)** | `0x3550f9fc84640a9cfd7c51330615a1e05cb948be` | 7,556 hex chars | [View on Explorer](https://testnet.monadexplorer.com/address/0x3550f9fc84640a9cfd7c51330615a1e05cb948be) |
| **ERC-8004 Agent Registry** | `0x8004A818BFB912233c491871b3d84c89A494BD9e` | Canonical Monad | [Agent #2304 Bound](https://testnet.monadexplorer.com/address/0x8004A818BFB912233c491871b3d84c89A494BD9e) |
| **RIP-7212 P-256 Precompile** | `0x0000000000000000000000000000000000000100` | Native Monad | Verified at `0x0100` |
| **MockTarget Router** | `0xd856e20dbf9280299739efdc0082e431fa644e73` | Test Target | [View on Explorer](https://testnet.monadexplorer.com/address/0xd856e20dbf9280299739efdc0082e431fa644e73) |
| **Test USDC Stablecoin** | `0x540564511d46e74c0ed48a6d63de8c79e61a860a` | ERC-20 Vault | [View on Explorer](https://testnet.monadexplorer.com/address/0x540564511d46e74c0ed48a6d63de8c79e61a860a) |

### Mined On-Chain Transaction Audit Matrix
Every scenario was executed live on Monad Testnet and confirmed in [`deployments.mandates.json`](deployments.mandates.json):

| Scenario | Category | On-Chain Result | Block | Transaction Hash |
| :--- | :--- | :---: | :---: | :--- |
| **Mandate Creation** | WebAuthn P-256 Signature | `SUCCESS` | #70741326 | [`0xace2016f...`](https://testnet.monadexplorer.com/tx/0xace2016fc9c0ba8d15699f156bc2ff8b2f0eb99e06ee5a706a7279b92f17cd6a) |
| **Stablecoin Deposit** | ERC-20 Vault Funding | `SUCCESS` | #70741334 | [`0x80118622...`](https://testnet.monadexplorer.com/tx/0x80118622f47f6ee7ee4f8b8e5dcbdb9325f3ad5855d265bdbb4b04d7902015c9) |
| **Allowed Agent Call** | Within Policy Limits | `SUCCESS` | #70741341 | [`0x0ad085cf...`](https://testnet.monadexplorer.com/tx/0x0ad085cf472e5707b50e9be617b7d805aba9174743a409640dbbdd6c6849d08e) |
| **Allowed Token Payment** | Payee Transfer (10 USDC) | `SUCCESS` | #70741347 | [`0x4e606cd5...`](https://testnet.monadexplorer.com/tx/0x4e606cd56aef5d1b18c7554a48c87f422742c30bd3e07f3e23907e3c9eb55246) |
| **Token Over-Limit Revert** | Attack: Exceeds Token Cap | `REVERTED` | #70741353 | [`0x28590d24...`](https://testnet.monadexplorer.com/tx/0x28590d24827efc880f7131fcfbb256a2cb73fa692fae2d5e8e48917b6f6c2377) |
| **Native Over-Limit Revert** | Attack: Exceeds Native MON | `REVERTED` | #70741359 | [`0x0eaf10cf...`](https://testnet.monadexplorer.com/tx/0x0eaf10cfccaa40d7469e8a0c8c180ba39268802226dd12002b69da09cc347be1) |
| **Rogue Target Revert** | Attack: Non-Allowlisted Target | `REVERTED` | #70741365 | [`0x7b7678d0...`](https://testnet.monadexplorer.com/tx/0x7b7678d0ceaad66f72029c61ff375366a4812541110480d3fc6334af2a4cd5a3) |
| **Stranger Caller Revert** | Attack: Impostor Agent EOA | `REVERTED` | #70741371 | [`0x7798895e...`](https://testnet.monadexplorer.com/tx/0x7798895e691a5923e3f2c6564a774543b853018483c798c0719949cd91c4945d) |

### Independent Receipt Auditor
Judges can verify all live receipts in one command directly against Monad Testnet RPC:
```bash
# Verify entire 8-scenario matrix with strict status & event assertions
npm run verify:all

# Or audit an individual transaction receipt
npm run verify:tx 0xdf928824bddee386bac134559d4148ac88fa5d79fdf9dcb710d8bcd2947e7e77
```

---

## 🛡️ Security Model & Radical Transparency

AgentTrust adheres to strict engineering honesty regarding what is proven versus what is unproven:

- **Enforced Today On-Chain:**
  - P-256 WebAuthn signature validity, low-S malleability check, and User Presence / Verification flags (`flags & 0x05`).
  - Target contract allowlist and 4-byte function selector match.
  - Per-transaction spending cap and cumulative lifetime budget for native MON (`msg.value`).
  - Designated ERC-20 vault allowances (`payToken`).
  - Isolated vault balance accounting preventing cross-mandate contamination.
  - Replay protection via domain-separated challenges and per-owner sequential nonces.
  - Live ERC-8004 identity verification on every invocation.
- **Explicit Disclosures:**
  - **No Third-Party Audit:** This software was built during a hackathon sprint and has not yet undergone a formal external security audit.
  - **No Production Adopters Claimed:** Pilot integrations and partner templates are open, but no enterprise production adoption is falsely claimed.
  - **Calldata Parameter Scope:** Spending caps explicitly bound native MON `msg.value` and designated ERC-20 vault token balances. They do not parse arbitrary multi-hop calldata parameters of unindexed external protocols.

---

## 📊 Comprehensive Test Suite Matrix (142 / 142 Passing)

```
Test Suite Summary:
─────────────────────────────────────────────────────────────────────────────
Suite                           Tooling          Tests    Status    Duration
─────────────────────────────────────────────────────────────────────────────
Solidity Contracts & Precompile  Foundry (forge)   72     PASSED     ~500 ms
TypeScript SDK & Client API      Vitest            34     PASSED     ~650 ms
Web Console & Relay Security    Node.js (tsx)     19     PASSED     ~380 ms
Testnet Auditor & Invariants     Node.js (tsx)      9     PASSED     ~210 ms
Model Context Protocol (MCP)    Node.js (tsx)      8     PASSED     ~690 ms
─────────────────────────────────────────────────────────────────────────────
TOTAL MONOREPO VERIFICATION                      142     PASSED     ~2.4 sec
```

---

## ⚖️ License & Open-Source Integrity

Distributed under the **MIT License**. Clean git history verified: zero API keys, secrets, or high-entropy private keys committed. All sensitive relayer keys are stored in secure runtime memory.
