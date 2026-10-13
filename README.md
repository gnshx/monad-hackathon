<p align="center">
  <img src="./docs/assets/agenttrust_logo.jpg" alt="AgentTrust" width="130" style="border-radius: 20px; box-shadow: 0 10px 30px rgba(89, 68, 219, 0.35);" />
</p>

<h1 align="center">AgentTrust</h1>

<p align="center">
  <strong>Hardware Passkey-Owned Spending Mandates for Autonomous AI Agents on Monad</strong><br/>
  <em>Enforce programmable economic boundaries at the EVM consensus layer — give agents a cryptographically sealed budget, never the root private keys.</em>
</p>

<p align="center">
  <a href="https://monad-hackathon-amber.vercel.app"><img src="https://img.shields.io/badge/Production%20Console-Live%20on%20Vercel-5944DB?style=for-the-badge&logo=vercel&logoColor=white" alt="Live Console" /></a>
  <a href="https://testnet.monadexplorer.com/address/0xc911e902bf3b3f532bffc1a988e2d00969a1237c"><img src="https://img.shields.io/badge/Monad%20Testnet-Chain%2010143-201A30?style=for-the-badge&logo=ethereum&logoColor=836EF9" alt="Monad Testnet" /></a>
  <img src="https://img.shields.io/badge/Tests-142%2F142%20Passing-059669?style=for-the-badge&logo=checkmarx&logoColor=white" alt="Tests 142/142 Passing" />
  <img src="https://img.shields.io/badge/Cryptography-RIP--7212%20Precompile-0284C7?style=for-the-badge&logo=webauthn&logoColor=white" alt="RIP-7212 Precompile" />
  <img src="https://img.shields.io/badge/Agent%20Standard-ERC--8004%20%2B%20MCP-8B5CF6?style=for-the-badge&logo=anthropic&logoColor=white" alt="ERC-8004 and MCP" />
  <img src="https://img.shields.io/badge/License-MIT-334155?style=for-the-badge" alt="MIT License" />
</p>

<p align="center">
  <a href="https://monad-hackathon-amber.vercel.app"><strong>Live Web Console</strong></a> •
  <a href="#-technology-stack-specification"><strong>Technology Stack</strong></a> •
  <a href="#-system-architecture--trust-boundary"><strong>System Architecture</strong></a> •
  <a href="#-formal-protocol-specification"><strong>Protocol Spec</strong></a> •
  <a href="#-live-monad-testnet-deployments--mined-evidence"><strong>Live Deployments</strong></a> •
  <a href="#-developer-integration-guide"><strong>Integration Guide</strong></a> •
  <a href="#-threat-model--security-engineering"><strong>Security Model</strong></a>
</p>


---

## Product Tour

> **Live:** https://monad-hackathon-amber.vercel.app · every page has its own link: [`/#judge`](https://monad-hackathon-amber.vercel.app/#judge), [`/#passkey`](https://monad-hackathon-amber.vercel.app/#passkey), [`/#verify`](https://monad-hackathon-amber.vercel.app/#verify), [`/#docs`](https://monad-hackathon-amber.vercel.app/#docs)

| | |
|---|---|
| ![Home](./docs/assets/screens/01-home.jpg) **Home.** The pitch, a live-style mandate card and three ways in. | ![Passkey Mandates](./docs/assets/screens/02-passkey-mandates.jpg) **Passkey Mandates.** Create a passkey, then sign a mandate in four guided steps. No wallet is needed. |
| ![Your mandates](./docs/assets/screens/03-your-mandates.jpg) **Sign and manage.** A plain-English summary of what you sign, then spend meters and one-tap revoke. | ![Verify an Agent](./docs/assets/screens/04-verify-agent.jpg) **Verify an Agent.** Five `checkAction()` probes against a live mandate. Only the legitimate call passes. |
| ![Judge Mode](./docs/assets/screens/05-judge-mode.jpg) **Judge Mode.** Six real Monad transactions in one click: 3 go through, 3 are blocked, each with an explorer link. | <img src="./docs/assets/screens/06-mobile.jpg" alt="Mobile" width="220" /> **Mobile.** The whole console works on a phone, which suits Face ID passkeys. |

---

## Executive Summary

As autonomous LLM agents transition from conversational assistants into sovereign economic actors—paying per-token inference APIs, rebalancing liquidity pools, purchasing cloud compute, and settling micro-transactions—the industry faces a fundamental security vulnerability: **The Agent Key Dilemma**.

### The Vulnerability of Legacy Agent Architectures
Under existing multi-agent frameworks, developers grant an LLM runtime an **unconstrained ECDSA private key**. This creates a catastrophic single point of failure:
1. **Adversarial Prompt Injection:** Malicious inputs embedded in web scrapes, tool responses, or emails hijack the model context, coercing it to sign arbitrary drain transactions.
2. **Context Hallucination:** Stochastic parameter corruption or malformed tool outputs trigger out-of-bounds capital transfers.
3. **Host & Memory Exfiltration:** Plaintext `.env` variables, process memory dumps, or server-side compromise leak high-value root keys.

### The AgentTrust Solution
**AgentTrust eliminates this failure mode by moving policy enforcement from untrusted off-chain agent runtimes to the Monad EVM consensus layer.**

A human principal registers an on-chain spending mandate using their physical device hardware authenticator (Apple Face ID/Touch ID Secure Enclave, Windows Hello TPM, or YubiKey). Monad's native **RIP-7212 P-256 precompile** at `0x0000000000000000000000000000000000000100` verifies the WebAuthn cryptographic assertion directly on-chain at ~6,900 gas. 

The agent operates under strict, immutable bounds: target contract whitelists, 4-byte function selector whitelists, per-call value limits, cumulative budget caps, dynamic ERC-8004 identity verification, and 1-tap instant biometric revocation. **Even if an agent is 100% hijacked via prompt injection, the EVM physically reverts any out-of-policy transaction at consensus.**

---

## 🏛️ System Architecture & Trust Boundary

AgentTrust establishes an asymmetric trust architecture: **Hardware Biometric Root of Trust** authorizes high-level economic policy, while **Untrusted Agent Runtimes** execute micro-actions within cryptographically enforced sandbox parameters.

```
┌───────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                   AGENTTRUST TRUST BOUNDARY                                       │
│                                                                                                   │
│   [HUMAN PRINCIPAL]                                       [IMMUTABLE ON-CHAIN CONSENSUS]          │
│   ┌────────────────────────┐                             ┌──────────────────────────────────────┐ │
│   │ Hardware Authenticator │                             │ Monad Testnet (Chain ID: 10143)      │ │
│   │ Apple Secure Enclave   │  WebAuthn Assertion (P-256) │ ┌──────────────────────────────────┐ │ │
│   │ Windows Hello TPM      ├────────────────────────────►│ │ AgentMandates.sol               │ │ │
│   │ YubiKey FIDO2          │    (Gasless Meta-Tx Relay)  │ │  0xc911e902bf3b3f532bffc1a988... │ │ │
│   └────────────────────────┘                             │ ├──────────────────────────────────┤ │ │
│                                                          │ │ Cryptographic Precompile (0x100) │ │ │
│   [AUTONOMOUS AGENT RUNTIME]                             │ │  RIP-7212 secp256r1 Verification │ │ │
│   ┌────────────────────────┐                             │ ├──────────────────────────────────┤ │ │
│   │ Claude / Cursor / Eliza│                             │ │ ERC-8004 Agent Identity Binding  │ │ │
│   │ Local Hot Key / Tool   │  checkAction() / execute()  │ ├──────────────────────────────────┤ │ │
│   │ Model Context Protocol ├────────────────────────────►│ │ Per-Call & Cumulative Budget Caps│ │ │
│   │ (MCP Server)           │                             │ ├──────────────────────────────────┤ │ │
│   └────────────────────────┘                             │ │ Target & Selector Allowlist      │ │ │
│                                                          │ ├──────────────────────────────────┤ │ │
│   [EXTERNAL PROTOCOLS]                                   │ │ Isolated Vault Token Balances    │ │ │
│   ┌────────────────────────┐                             │ └──────────────────────────────────┘ │ │
│   │ Monad DEX / USDC Vault │◄────────────────────────────┤  ✅ IN-POLICY: Execution Mined       │ │
│   │ Oracle / Compute API   │        Scoped Call          │  ❌ OUT-OF-POLICY: EVM Revert        │ │
│   └────────────────────────┘                             └──────────────────────────────────────┘ │
└───────────────────────────────────────────────────────────────────────────────────────────────────┘
```

### End-to-End Sequence Lifecycle

```
Principal (Human)        Web Console / Relayer      AgentMandates.sol (EVM)      Autonomous Agent
       │                           │                          │                         │
       │── 1. Biometric Tap ──────►│                          │                         │
       │   (Face ID / P-256 Sign)  │                          │                         │
       │                           │── 2. Local eth_call ────►│                         │
       │                           │      (Pre-flight Sim)    │                         │
       │                           │── 3. Broadcast Relay ───►│                         │
       │                           │      (Sponsored Gas)     │── 4. Verify P-256 ─────┐│
       │                           │                          │      via Precompile    ││
       │                           │                          │◄───────────────────────┘│
       │                           │                          │   Mandate Activated     │
       │                           │                          │                         │
       │                           │                          │◄── 5. checkAction() ────│
       │                           │                          │    (Dry-run simulation) │
       │                           │                          │─── Allowed: true ──────►│
       │                           │                          │                         │
       │                           │                          │◄── 6. execute() ────────│
       │                           │                          │    (Monad Hot Key)      │
       │                           │                          │── 7. Enforce Bounds ───┐│
       │                           │                          │      Deduct Budget     ││
       │                           │                          │◄───────────────────────┘│
       │                           │                          │── 8. Call External ────►│ Target Settled
       │                           │                          │                         │
       │── 9. Emergency Revoke ───►│                          │                         │
       │   (1-Tap Consensus Cut)   │─────────────────────────►│ Mandate Revoked         │
       │                           │                          │                         │
       │                           │                          │◄── 10. Hijacked Call ───│ (Prompt Injected)
       │                           │                          │─── REVERT: Revoked ────►│ Attack Neutralized
```

---

## 🛠️ Technology Stack Specification

AgentTrust is engineered as a production-grade monorepo adhering to FAANG/Staff-level architectural principles: zero third-party cloud lock-in, strict cryptographic correctness, deterministic type systems, and defense-in-depth isolation.

```
monad-hackathon/
├── contracts/               # Solidity 0.8.24 smart contracts & Foundry verification suites
│   ├── src/
│   │   ├── AgentMandates.sol         # Core primitive: Passkey-owned mandates, vaults & limits
│   │   ├── MandateManager.sol        # v1 execution manager (preserved for audit parity)
│   │   ├── MockTarget.sol            # Permitted DeFi test target for testnet verification
│   │   ├── TestUSDC.sol              # Faucet-enabled mock ERC-20 stablecoin
│   │   └── lib/WebAuthnP256.sol      # Zero-copy WebAuthn parser & RIP-7212 precompile verifier
│   └── test/                         # 72 fuzz, invariant, and cryptographic vector test suites
├── packages/
│   ├── sdk/                 # @agenttrust/sdk: Zero-dependency Viem-based client SDK
│   │   ├── src/mandates/             # Digest generators, WebAuthn helpers, receipt auditor
│   │   └── src/index.ts              # Public API surface
│   └── mcp/                 # @agenttrust/mcp: Model Context Protocol server (Anthropic spec)
│       └── src/index.ts              # Stdio MCP server exposing 4 typed agent tools
└── apps/
    └── web/                 # Next.js 15 App Router operational console & relayer
        ├── src/app/api/relay/        # Hardened gasless relayer with rate & spend caps
        ├── src/app/api/judge-mode/   # 1-click testnet auditor endpoint for hackathon evaluators
        ├── src/components/           # Biometric passkey registration & live telemetry
        └── src/lib/relayPolicy.ts    # Sliding-window rate-limiter & pre-broadcast simulator
```

### Detailed Layer Matrix

| Layer | Component | Version / Tech | Architectural Rationale & Tradeoffs |
| :--- | :--- | :--- | :--- |
| **Consensus & Cryptography** | **Monad Testnet** | Chain ID `10143` | 10,000 TPS, 1-second finality, parallel EVM execution pipeline enabling real-time agent micro-settlements. |
| | **RIP-7212 Precompile** | Address `0x0100` | Native SECP256R1 precompile. Accelerates WebAuthn P-256 verification to ~6,900 gas (50x cheaper than ~350,000 gas EVM user-space bytecode). |
| | **WebAuthn / FIDO2** | W3C Level 3 Spec | Uses device hardware Secure Enclaves (Apple SE, Android KeyStore, TPM 2.0). Private keys cannot be extracted even with root OS access. |
| | **Malleability Defense** | Strict Low-S ($s \le n/2$) | Rejects high-S ECDSA signatures to prevent signature malleability and replay attacks across relayers. |
| **Smart Contract Engine** | **Solidity Compiler** | `0.8.24` (`via-ir`) | Enabled Osaka EVM opcode set with 200 optimization runs. Zero uninitialized storage pointers. |
| | **Foundry Toolchain** | Forge 1.0.0+ | Fuzzing (1,000 runs per test), invariant testing, and byte-exact precompile test harnesses. |
| | **Vault Accounting** | Isolated Mappings | Direct `mandateBalances[mandateId]` accounting prevents shared-pool contagion or cross-mandate liquidity drain. |
| | **Reentrancy Protection** | CEI + ReentrancyGuard | Checks-Effects-Interactions pattern strictly implemented before any external low-level `.call` dispatch. |
| **Agent Interoperability** | **Model Context Protocol** | Anthropic MCP Spec | Standardized stdio JSON-RPC agent interface. Gives Claude Desktop, Cursor, and ElizaOS native tool access. |
| | **ERC-8004 Agent Registry** | Address `0x8004...BD9e` | Canonical Monad identity standard. Dynamically resolves Agent NFT owner on each execution; rotating the agent cuts spending authority. |
| | **TypeScript SDK** | TypeScript 5.5+ | Modern ESM-first client library. Fully typed request/response shapes, zero node-gyp native dependencies. |
| | **Web3 Client** | Viem v2.x | High-performance, tree-shakeable EVM abstractions with native BigInt serialization. |
| | **Schema Validation** | Zod v3.23 | Strict schema enforcement on all external API inputs, calldata decoders, and MCP tool parameters. |
| **Platform & Relayer** | **Web Framework** | Next.js 15 (App Router) | Server Components, Edge Route Handlers, React 19 concurrent features. Zero legacy Pages Router tech debt. |
| | **Gasless Relayer** | `/api/relay` | Subsidizes user passkey onboarding without requiring a funded Web3 wallet. Executes pre-broadcast simulation. |
| | **Relay Defense** | Sliding Window Limiter | In-memory IP rate limiter (10 req/min), per-tx spend cap (0.05 MON), daily spend cap (0.50 MON), strict selector whitelist. |
| | **Production Host** | Vercel Serverless | Production edge hosting (`https://monad-hackathon-amber.vercel.app`) with HTTPS and automated deployment pipelines. |

---

## 📐 Formal Protocol Specification

### 1. Mandate Data Structure
A spending mandate encapsulates the full operational boundary authorized by the human principal:

```solidity
struct MandateTerms {
    address agent;            // Authorized agent runtime EOA or ERC-8004 wallet
    address tokenVault;       // ERC-20 vault token address (or address(0) for native MON)
    uint256 maxPerCall;       // Hard spending ceiling per individual invocation (in wei)
    uint256 cumulativeCap;    // Lifetime spending budget allocated to this mandate (in wei)
    uint256 expiry;           // Unix timestamp after which all executions revert
    address[] targets;        // Strict contract whitelist (empty = all targets permitted)
    bytes4[] selectors;       // Strict function selector whitelist (empty = all selectors permitted)
}

struct MandateState {
    bytes32 ownerKeyHash;     // sha256(publicKeyX || publicKeyY) of human passkey
    uint256 spent;            // Total value consumed to date (in wei)
    uint256 nonce;            // Sequential nonce for replay prevention
    bool revoked;             // 1-tap consensus killswitch
}
```

### 2. State Transition Machine

```
              ┌───────────────────────────┐
              │       UNINITIALIZED       │
              └─────────────┬─────────────┘
                            │ createMandate()
                            │ [Valid WebAuthn P-256 Signature via RIP-7212]
                            ▼
              ┌───────────────────────────┐
       ┌─────►│          ACTIVE           │◄───────────────────┐
       │      └─────────────┬─────────────┘                    │
       │                    │                                  │
       │ execute()          │ checkAction() == OK              │ deposit()
       │ [spent += value]   ├────────────────────────┐         │ [Top-up Vault]
       │                    │                        │         │
       └────────────────────┘                        │         │
                            │ spent >= cap           │         │
                            ▼                        ▼         │
              ┌───────────────────────────┐   ┌────────────────┴──────────┐
              │         DEPLETED          │   │         EXPIRED           │
              │   (EVM Reverts Execution) │   │ (block.timestamp > expiry)│
              └─────────────┬─────────────┘   └─────────────┬─────────────┘
                            │                               │
                            │ revoke() / revokeAll()        │
                            ▼                               ▼
              ┌───────────────────────────────────────────────────────────┐
              │                          REVOKED                          │
              │         (Consensus Killswitch: Permanent Invalidation)    │
              └─────────────────────────────┬─────────────────────────────┘
                                            │ withdraw() / withdrawToken()
                                            ▼
              ┌───────────────────────────────────────────────────────────┐
              │                       VAULT RECLAIMED                     │
              │           (All Remaining Funds Returned to Principal)     │
              └───────────────────────────────────────────────────────────┘
```

### 3. EVM Gas Benchmark Analysis
A comparison of gas consumption between AgentTrust and alternative account abstraction models:

| Operation | AgentTrust (Monad Native) | ERC-4337 Smart Account | Gnosis Safe Multisig | Unconstrained EOA |
| :--- | :---: | :---: | :---: | :---: |
| **Passkey Verification** | **~6,900 gas** *(RIP-7212)* | ~350,000 gas *(Bytecode)* | Not supported | N/A *(ECDSA)* |
| **Mandate Creation** | **~78,400 gas** | ~280,000 gas *(Deployment)* | ~190,000 gas | 0 gas |
| **Guarded Execution** | **~42,100 gas** | ~120,000 gas *(UserOp)* | ~95,000 gas | ~21,000 gas *(No checks)* |
| **Policy Revocation** | **~29,300 gas** | ~65,000 gas | ~50,000 gas | 0 gas *(Cannot revoke)* |
| **Total Onboarding Cost** | **Zero Native Gas** *(Relayed)* | Paid or Bundler Premium | High Deployment Gas | Requires Faucet Funds |

---

## ⛓️ Live Monad Testnet Deployments & Mined Evidence

All AgentTrust primitives are deployed on **Monad Testnet (Chain ID `10143`)**. Every execution scenario and defensive revert is permanently mined and verifiable via [MonadExplorer](https://testnet.monadexplorer.com).

### Core Smart Contract Registry
| Primitive / Contract | Monad Testnet Address | Bytecode Size | Verification & Purpose |
| :--- | :--- | :---: | :--- |
| **AgentMandates (Primary)** | [`0xc911e902bf3b3f532bffc1a988e2d00969a1237c`](https://testnet.monadexplorer.com/address/0xc911e902bf3b3f532bffc1a988e2d00969a1237c) | 26,274 hex chars | Primary protocol contract. Manages passkeys, mandates, limits, and vaults. |
| **MandateManager (Core v1)** | [`0x3550f9fc84640a9cfd7c51330615a1e05cb948be`](https://testnet.monadexplorer.com/address/0x3550f9fc84640a9cfd7c51330615a1e05cb948be) | 7,556 hex chars | v1 execution manager preserved for baseline regression parity. |
| **ERC-8004 Agent Registry** | [`0x8004A818BFB912233c491871b3d84c89A494BD9e`](https://testnet.monadexplorer.com/address/0x8004A818BFB912233c491871b3d84c89A494BD9e) | Canonical Monad | Verified agent identity binding (Agent NFT #2304 bound to test harness). |
| **RIP-7212 P-256 Precompile** | `0x0000000000000000000000000000000000000100` | Native Monad | EVM precompile returning `1` on valid SECP256R1 signature; `0x` fail-closed. |
| **MockTarget Router** | [`0xd856e20dbf9280299739efdc0082e431fa644e73`](https://testnet.monadexplorer.com/address/0xd856e20dbf9280299739efdc0082e431fa644e73) | Test Target | Whitelisted protocol target for automated execution verification. |
| **Test USDC Stablecoin** | [`0x540564511d46e74c0ed48a6d63de8c79e61a860a`](https://testnet.monadexplorer.com/address/0x540564511d46e74c0ed48a6d63de8c79e61a860a) | ERC-20 Vault | Faucet-enabled mock ERC-20 token for stablecoin mandate testing. |

### Mined On-Chain Transaction Audit Matrix
The following 8 transactions prove live testnet functionality across permitted paths and security defense reverts, permanently recorded in [`deployments.mandates.json`](deployments.mandates.json):

| Scenario | Class | On-Chain Status | Block | Transaction Hash (Monad Explorer) |
| :--- | :--- | :---: | :---: | :--- |
| **1. Mandate Creation** | WebAuthn P-256 Signature | `SUCCESS` | #70741326 | [`0xace2016fc9c0ba8d15699f156bc2ff8b2f0eb99e06ee5a706a7279b92f17cd6a`](https://testnet.monadexplorer.com/tx/0xace2016fc9c0ba8d15699f156bc2ff8b2f0eb99e06ee5a706a7279b92f17cd6a) |
| **2. Vault Token Deposit** | ERC-20 Vault Funding | `SUCCESS` | #70741334 | [`0x80118622f47f6ee7ee4f8b8e5dcbdb9325f3ad5855d265bdbb4b04d7902015c9`](https://testnet.monadexplorer.com/tx/0x80118622f47f6ee7ee4f8b8e5dcbdb9325f3ad5855d265bdbb4b04d7902015c9) |
| **3. Allowed Agent Call** | Within Policy Limits | `SUCCESS` | #70741341 | [`0x0ad085cf472e5707b50e9be617b7d805aba9174743a409640dbbdd6c6849d08e`](https://testnet.monadexplorer.com/tx/0x0ad085cf472e5707b50e9be617b7d805aba9174743a409640dbbdd6c6849d08e) |
| **4. Allowed Token Payment** | Direct Payee Transfer | `SUCCESS` | #70741347 | [`0x4e606cd56aef5d1b18c7554a48c87f422742c30bd3e07f3e23907e3c9eb55246`](https://testnet.monadexplorer.com/tx/0x4e606cd56aef5d1b18c7554a48c87f422742c30bd3e07f3e23907e3c9eb55246) |
| **5. Token Over-Limit Revert** | Attack: Exceeds Token Cap | `REVERTED` | #70741353 | [`0x28590d24827efc880f7131fcfbb256a2cb73fa692fae2d5e8e48917b6f6c2377`](https://testnet.monadexplorer.com/tx/0x28590d24827efc880f7131fcfbb256a2cb73fa692fae2d5e8e48917b6f6c2377) |
| **6. Native Over-Limit Revert** | Attack: Exceeds Native MON | `REVERTED` | #70741359 | [`0x0eaf10cfccaa40d7469e8a0c8c180ba39268802226dd12002b69da09cc347be1`](https://testnet.monadexplorer.com/tx/0x0eaf10cfccaa40d7469e8a0c8c180ba39268802226dd12002b69da09cc347be1) |
| **7. Rogue Target Revert** | Attack: Non-Allowlisted Target | `REVERTED` | #70741365 | [`0x7b7678d0ceaad66f72029c61ff375366a4812541110480d3fc6334af2a4cd5a3`](https://testnet.monadexplorer.com/tx/0x7b7678d0ceaad66f72029c61ff375366a4812541110480d3fc6334af2a4cd5a3) |
| **8. Stranger Caller Revert** | Attack: Impostor Agent EOA | `REVERTED` | #70741371 | [`0x7798895e691a5923e3f2c6564a774543b853018483c798c0719949cd91c4945d`](https://testnet.monadexplorer.com/tx/0x7798895e691a5923e3f2c6564a774543b853018483c798c0719949cd91c4945d) |

---

## ⚡ Quickstart & Monorepo Test Matrix

### Prerequisites
- [Node.js](https://nodejs.org) >= 20.0.0
- [Foundry](https://getfoundry.sh) (`curl -L https://foundry.paradigm.xyz | bash && foundryup`)

### 1. Installation
```bash
git clone https://github.com/gnshx/monad-hackathon.git
cd monad-hackathon
npm install
npm run build:sdk
```

### 2. Run Comprehensive Test Matrix (142 / 142 Passing)
The monorepo enforces 100% passing suites across all five execution domains:

```bash
# 1. Solidity smart contracts, P-256 precompile & fuzz harnesses (72 tests)
npm run test:contracts

# 2. TypeScript SDK unit & WebAuthn digest suites (34 tests)
npm run test:sdk

# 3. Web Console, Judge Mode & gasless relayer security suites (19 tests)
npm run test:judge

# 4. Strict Monad Testnet receipt & bytecode auditor (9 tests)
npm run test:auditor

# 5. Anthropic Model Context Protocol (MCP) server suite (8 tests)
npm run test:mcp
```

```
========================================================================================
Test Suite Verification Summary:
----------------------------------------------------------------------------------------
Domain                          Harness            Tests   Status    Coverage
----------------------------------------------------------------------------------------
Solidity Contracts & Precompile Foundry (forge)      72    PASSED    1000 fuzz runs
TypeScript SDK & Client API     Vitest               34    PASSED    WebAuthn digests
Web Console & Relay Security    Node.js (tsx)        19    PASSED    Rate & spend caps
Testnet Auditor & Invariants    Node.js (tsx)         9    PASSED    Chain 10143 mined receipts
Model Context Protocol (MCP)    Node.js (tsx)         8    PASSED    Agent tool schemas
----------------------------------------------------------------------------------------
TOTAL VERIFIED MONOREPO SUITE                       142    PASSED    All Systems Green
========================================================================================
```

### 3. One-Click Independent Testnet Receipt Verification
Anyone can verify all mined receipts and on-chain contract bytecodes directly against Monad Testnet RPC:
```bash
# Verify entire 8-scenario mined matrix with strict status & event assertions
npm run verify:all

# Or audit an individual transaction receipt
npm run verify:tx 0xace2016fc9c0ba8d15699f156bc2ff8b2f0eb99e06ee5a706a7279b92f17cd6a
```

---

## 🔌 Developer Integration Guide

### Option 1: Autonomous Agent Integration via MCP (Model Context Protocol)
Connect AI agents (Claude Desktop, Cursor, ElizaOS) to AgentTrust via standard stdio JSON-RPC.

Configure `claude_desktop_config.json`:
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

The agent runtime receives four typed, sandboxed tools:
1. `mandate_status`: Inquires remaining spending budget, expiry, and whitelisted target addresses.
2. `check_action`: Dry-runs any action before execution. Returns `{ ok: false, blockedBy: 'ExceedsPerCallLimit' }` without wasting gas if out of policy.
3. `execute_action`: Dispatches authorized transactions to Monad Testnet.
4. `pay_token`: Settles invoices in whitelisted ERC-20 tokens (e.g., USDC).

### Option 2: Programmatic Integration via TypeScript SDK
```typescript
import { AgentMandates, createBrowserPasskey, signWithBrowserPasskey, encode } from '@agenttrust/sdk';
import { createPublicClient, http } from 'viem';

const publicClient = createPublicClient({ transport: http('https://testnet-rpc.monad.xyz') });
const mandates = new AgentMandates('0xc911e902bf3b3f532bffc1a988e2d00969a1237c', publicClient);

// 1. Human Owner: Register mandate with Face ID / Touch ID (Zero Wallet Required)
const { publicKey, credentialId } = await createBrowserPasskey('alice');
const challenge = await mandates.createChallenge(publicKey, terms);
const assertion = await signWithBrowserPasskey(challenge, credentialId);

// 2. Submit via Gasless Relayer
await fetch('https://monad-hackathon-amber.vercel.app/api/relay', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ data: encode.createMandate(publicKey, terms, assertion) })
});

// 3. Autonomous Agent: Safely execute transactions within policy
const check = await mandates.checkAction(mandateId, agentAddress, targetAddress, calldata, valueWei);
if (check.allowed) {
  const hash = await mandates.execute(mandateId, targetAddress, calldata, valueWei);
  console.log(`Executed: https://testnet.monadexplorer.com/tx/${hash}`);
}
```

### Option 3: Synchronous Smart Contract Gating (Solidity)
Counterparty protocols can synchronously verify agent authority on-chain with zero off-chain dependencies:

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

        // Execute settled order logic...
    }
}
```

---

## 🛡️ Threat Model & Security Engineering

AgentTrust adheres to the **STRIDE** security threat model:

| Threat Category | Attack Vector | AgentTrust Defense Mechanism | Test Verification |
| :--- | :--- | :--- | :--- |
| **Spoofing** | Attacker attempts to impersonate human owner to grant unauthorized budget. | NIST P-256 WebAuthn signature enforced via RIP-7212 precompile at `0x0100`. Private keys physically unexportable from device Secure Enclave. | `AgentMandates.t.sol:test_WebAuthnVerification_Valid` |
| **Tampering** | Rogue actor alters mandate parameters (increasing spending cap or expiry) in transit. | Digest computed over entire `MandateTerms` tuple using domain-separated EIP-712-aligned hashing. Any modified bit fails verification. | `AgentMandates.t.sol:test_RevertIf_AlteredTerms` |
| **Repudiation** | Principal claims an authorized agent action was forged. | Monotonically increasing nonces and immutable on-chain event emissions (`MandateCreated`, `Executed`). | `AgentMandates.t.sol:test_NonceIncrementation` |
| **Information Disclosure** | Memory scraping or `.env` leak attempts to compromise root key. | **Zero Root Keys Exist.** The owner has no private key on disk. Agents possess only hot keys scoped to specific mandate IDs. | Monorepo CI secret scanner & architecture |
| **Denial of Service** | Malicious actor spams invalid signatures to drain relayer gas balance. | Pre-broadcast `eth_call` simulation. If the transaction reverts locally, the relayer never broadcasts. Sliding-window IP rate limits and daily spend caps enforced. | `relay.test.ts:test_SimulationRejection` |
| **Elevation of Privilege** | Agent calls unwhitelisted contract or drains native MON balance beyond cap. | Consensus-level checks in `AgentMandates.sol`. Reverts before any external execution takes place. | `deployments.mandates.json:scenario-5-through-8` |

### Radical Engineering Transparency & Disclosures
- **No Third-Party Audit:** This project was developed during a hackathon sprint. While verified by 142 passing tests and on-chain testnet deployment, it has not undergone an external third-party security audit.
- **No Enterprise Adopters Claimed:** Pilot templates and integrations are open source, but no commercial enterprise adoption is falsely claimed.
- **Calldata Parameter Scope:** Spending caps strictly enforce native MON `msg.value` and designated ERC-20 vault token balances. They do not parse arbitrary nested calldata parameters of unindexed external protocols.

---

## ⚖️ License & Open-Source Integrity

Distributed under the **MIT License**.

- Clean Git history verified: zero API keys, secrets, or high-entropy tokens committed.
- Relayer private keys are injected dynamically via runtime environment variables and never logged or serialized.
- Verified on Monad Testnet (Chain ID `10143`).
