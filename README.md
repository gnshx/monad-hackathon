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
  <img src="https://img.shields.io/badge/Tests-200%2F200%20Passing-059669?style=for-the-badge&logo=checkmarx&logoColor=white" alt="Tests 200/200 Passing" />
  <img src="https://img.shields.io/badge/Cryptography-RIP--7212%20Precompile-0284C7?style=for-the-badge&logo=webauthn&logoColor=white" alt="RIP-7212 Precompile" />
  <img src="https://img.shields.io/badge/Agent%20Standard-ERC--8004%20%2B%20MCP-8B5CF6?style=for-the-badge&logo=anthropic&logoColor=white" alt="ERC-8004 and MCP" />
  <img src="https://img.shields.io/badge/License-MIT-334155?style=for-the-badge" alt="MIT License" />
</p>

<p align="center">
  <a href="https://monad-hackathon-amber.vercel.app"><strong>Live Web Console</strong></a> •
  <a href="JUDGES.md"><strong>⚖️ Judge Evaluation Guide</strong></a> •
  <a href="#technology-stack-specification"><strong>Technology Stack</strong></a> •
  <a href="#system-architecture--trust-boundary"><strong>System Architecture</strong></a> •
  <a href="#formal-protocol-specification"><strong>Protocol Spec</strong></a> •
  <a href="#live-monad-testnet-deployments--mined-evidence"><strong>Live Deployments</strong></a> •
  <a href="#developer-integration-guide"><strong>Integration Guide</strong></a> •
  <a href="#threat-model--security-engineering"><strong>Security Model</strong></a>
</p>

> ⚖️ **For Metropolis Hackathon Judges:** Reviewing AgentTrust? See [**`JUDGES.md`**](JUDGES.md) for a 60-second evaluation path, scoring criteria breakdown, and live testnet verification links with zero wallet or gas setup needed.


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

## System Architecture & Trust Boundary

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

## Technology Stack Specification

AgentTrust is a monorepo built around a few principles: zero third-party cloud lock-in, strict cryptographic correctness, deterministic type systems, and defense-in-depth isolation.

```
monad-hackathon/
├── contracts/               # Solidity 0.8.24 smart contracts & Foundry tests
│   ├── src/
│   │   ├── AgentMandates.sol         # Core primitive: passkey-owned mandates, vaults & limits
│   │   ├── MandateManager.sol        # v1 contract (wallet-owned mandates), kept for the v1 testnet records
│   │   ├── IERC8004Registry.sol      # ERC-8004 identity registry interface
│   │   ├── IP256Verifier.sol         # P-256 verifier interface
│   │   └── lib/
│   │       ├── WebAuthnP256.sol      # WebAuthn assertion checks + call to the P-256 precompile
│   │       └── ReentrancyGuard.sol
│   └── test/                         # 76 tests: unit, fuzz and real WebAuthn P-256 signature vectors
│       ├── MockTarget.sol            # Allowlisted test target (deployed on testnet as "MockTarget Router")
│       └── utils/MockERC20.sol       # Mintable 6-decimal test ERC-20 (deployed on testnet as "Test USDC")
├── packages/                # Workspace packages, not published to npm (see the Integration Guide)
│   ├── sdk/                 # @agenttrust/sdk: TypeScript client built on viem and @noble/curves
│   │   ├── src/mandates/             # AgentMandates client, digests, WebAuthn helpers
│   │   └── src/index.ts              # Public API surface
│   └── mcp/                 # @agenttrust/mcp: Model Context Protocol server
│       └── src/index.ts              # Stdio MCP server: 7 tools (5 distinct, 2 aliases)
└── apps/
    └── web/                 # Next.js 15 App Router console & relayer
        ├── src/app/api/relay/        # Gasless relayer: pre-broadcast simulation, rate limit, sponsorship caps
        ├── src/app/api/judge-mode/   # One-click testnet run for judges
        ├── src/components/           # Console pages: passkeys, mandates, Verify, Judge Mode
        └── src/lib/relayPolicy.ts    # Selector allowlist, per-IP rate limit, sponsorship caps
```

### Detailed Layer Matrix

| Layer | Component | Version / Tech | Architectural Rationale & Tradeoffs |
| :--- | :--- | :--- | :--- |
| **Consensus & Cryptography** | **Monad Testnet** | Chain ID `10143` | Fast, parallel EVM execution, so per-call agent payments settle quickly. |
| | **RIP-7212 Precompile** | Address `0x0100` | Native secp256r1 precompile. One P-256 signature check costs about 6,900 gas instead of a large Solidity verifier. |
| | **WebAuthn / FIDO2** | W3C Level 3 Spec | Uses device hardware Secure Enclaves (Apple SE, Android KeyStore, TPM 2.0). The private key is generated on the device and is not exported by the platform. |
| | **Malleability Defense** | Strict Low-S ($s \le n/2$) | Rejects high-S ECDSA signatures to prevent signature malleability and replay attacks across relayers. |
| **Smart Contract Engine** | **Solidity Compiler** | `0.8.24` (`via_ir`) | Optimizer on, 200 runs. `foundry.toml` pins no `evm_version`, so Foundry's default target for solc 0.8.24 applies. |
| | **Foundry Toolchain** | Forge 1.0.0+ | Unit and fuzz tests (1,000 runs per fuzz test). Real WebAuthn P-256 signatures are verified by a Solidity RIP-7212 verifier etched at `0x0100` to stand in for the precompile. |
| | **Vault Accounting** | Per-mandate balances | Native MON in `Mandate.balance`, ERC-20 in `_tokens[mandateId][token].balance`. A mandate can only spend its own vault, never another mandate's. |
| | **Reentrancy Protection** | CEI + ReentrancyGuard | Checks-Effects-Interactions pattern strictly implemented before any external low-level `.call` dispatch. |
| **Agent Interoperability** | **Model Context Protocol** | Anthropic MCP Spec | Standardized stdio JSON-RPC agent interface. Gives Claude Desktop, Cursor, and ElizaOS native tool access. |
| | **ERC-8004 Agent Registry** | Address `0x8004...BD9e` | Canonical Monad identity standard. Dynamically resolves Agent NFT owner on each execution; rotating the agent cuts spending authority. |
| | **TypeScript SDK** | TypeScript 5.5+ | Modern ESM-first client library. Fully typed request/response shapes, zero node-gyp native dependencies. |
| | **Web3 Client** | Viem v2.x | High-performance, tree-shakeable EVM abstractions with native BigInt serialization. |
| | **Schema Validation** | Zod v3.25 | Validates MCP tool parameters (`packages/mcp` only). The web relayer does not use Zod; it checks the calldata selector against an allowlist and simulates the call. |
| **Platform & Relayer** | **Web Framework** | Next.js 15 (App Router) | React 19. The API routes (`/api/relay`, `/api/judge-mode`) are Route Handlers on the Node.js runtime. |
| | **Gasless Relayer** | `/api/relay` | Subsidizes user passkey onboarding without requiring a funded Web3 wallet. Executes pre-broadcast simulation. |
| | **Relay Defense** | Sliding Window Limiter | In-memory per-IP rate limit (10 requests/min, kept per serverless instance), selector allowlist, pre-broadcast simulation. Optional vault sponsorship (`RELAYER_SPONSOR_MAX_WEI`, default 0.01 MON per grant, `0` disables) is capped at 0.02 MON per IP and 0.2 MON overall per day; when it cannot sponsor, the grant is relayed unfunded. The relayer's gas has no daily cap beyond the rate limit. |
| | **Production Host** | Vercel Serverless | Production edge hosting (`https://monad-hackathon-amber.vercel.app`) with HTTPS and automated deployment pipelines. |

---

## Formal Protocol Specification

### 1. Mandate Data Structure
These are the types in [`contracts/src/AgentMandates.sol`](contracts/src/AgentMandates.sol). The passkey signs `MandateTerms`; the contract stores a `Mandate`.

```solidity
struct Passkey    { bytes32 x; bytes32 y; }                // P-256 public key of the owner's passkey
struct Permission { address target; bytes4 selector; }     // selector bytes4(0) = any function on target, including
                                                           // plain MON transfers; a (payee, bytes4(0)) entry also
                                                           // allows token payments to that payee
struct TokenLimit { address token; uint256 maxPerCall; uint256 budget; }   // caps for one ERC-20

struct MandateTerms {          // what the passkey signs
    address agent;             // the only wallet allowed to call execute() / payToken()
    uint256 agentId;           // ERC-8004 identity: agent must be its registered wallet or its owner
    Permission[] permissions;  // 1 to 16 entries; an empty list reverts with InvalidTerms
    uint256 maxPerCall;        // native MON cap per call (must not exceed budget)
    uint256 budget;            // lifetime native MON cap
    uint64 expiresAt;          // unix seconds; 0 = never
    TokenLimit[] tokenLimits;  // 0 to 8 ERC-20 budgets
}

struct Mandate {               // stored on-chain, returned by getMandate(id)
    bytes32 ownerKey;          // keccak256(abi.encode(x, y)) of the passkey, see ownerKeyOf(x, y)
    address agent;
    uint256 agentId;
    uint256 maxPerCall;
    uint256 budget;
    uint256 spent;             // native MON spent so far
    uint256 balance;           // this mandate's own native MON vault
    uint64 expiresAt;
    uint64 epoch;              // the owner's epoch at creation; revokeAll() bumps the owner's epoch
    bool revoked;
}
```

Rules the contract enforces:
- **Owner actions are passkey-signed.** `createMandate`, `revoke`, `revokeAll`, `withdraw` and `withdrawToken` each take a WebAuthn assertion over `keccak256(abi.encode(TYPEHASH, block.chainid, address(this), ownerKey, ..., nonce))`. Nonces are per owner key (`nonces[ownerKey]`), so every signature works once. Anyone can submit the signed call and pay its gas.
- **Agent actions are checked on every call.** `execute()` reverts unless, in this order: the caller is `agent`; the mandate is live (not revoked, `epoch == epochs[ownerKey]`, `expiresAt` not passed); the ERC-8004 registry still maps `agentId` to `agent`; the target is neither a vault token nor AgentMandates itself; `(target, selector)` is on the permission list; `value <= maxPerCall`; `spent + value <= budget`; and `value <= balance`. `payToken()` applies the same pattern with the per-token limits.
- **Vaults are per mandate.** Native MON sits in `Mandate.balance`, ERC-20s in a per-mandate `TokenAllowance { maxPerCall, budget, spent, balance, enabled }`. Anyone can `deposit` / `depositToken`; only the owner's passkey can withdraw.
- **`checkAction` / `checkPayment` are free views** that return `(allowed, reason)` using the same checks. They do not record spend.

### 2. State Transition Machine

```
createMandate(passkey, terms, assertion)   P-256 WebAuthn assertion verified by the 0x0100 precompile
               │
               ▼
┌──────────────────────────────┐   execute() / payToken() by the agent: every check above must pass,
│            ACTIVE            │   then spent += value and the vault pays. A spent budget is not a
│ not revoked, epoch current,  │   separate state: calls that would exceed it revert ExceedsBudget.
│ expiresAt not passed         │
└──────┬────────────────┬──────┘
       │                │
       │ expiresAt      │ revoke(id)            owner passkey
       │ passes         │ revokeAll(ownerKey)   owner passkey, bumps the owner's epoch
       ▼                ▼
┌─────────────┐  ┌─────────────┐
│   EXPIRED   │  │   REVOKED   │   Final: neither returns to ACTIVE.
└─────────────┘  └─────────────┘   execute() / payToken() revert with MandateInactive.

In every state: deposit() / depositToken() (anyone) add to the vault, and
withdraw() / withdrawToken() (owner passkey) move vault funds out. Neither changes the state.
```

### 3. Gas and Cost
- **P-256 verification:** each owner action makes one call to Monad's P-256 precompile at `0x0100`, which costs 6,900 gas per Monad's docs.
- **Mandate operations:** this README does not quote fixed figures for `createMandate`, `execute`, `payToken` or `revoke`. Measure them: `npm run e2e` prints the receipt `gasUsed` of each (the `gas:` line in step 8/8), and `cd contracts && forge test --match-contract AgentMandatesTest --gas-report` reports gas per function. Both run on a local chain, so read them as a lower bound for Monad, which charges more than Ethereum for cold storage and cold account access. A grant costs more with a new passkey and with more permissions and token limits.
- **Monad bills the gas limit, not gas used.** The SDK and the relayer therefore set each limit from `eth_estimateGas` plus 25% (capped at 1.2M gas for owner actions and 300k for `execute` / `payToken`) instead of a flat ceiling.
- **Who pays:** the owner pays no gas, because any relayer can submit owner actions. At about 100 gwei the hosted relayer spends roughly 0.1 to 0.15 MON on one Judge Mode run (six transactions) and a few hundredths of a MON on each passkey grant or revoke.

---

## Live Monad Testnet Deployments & Mined Evidence

All AgentTrust primitives are deployed on **Monad Testnet (Chain ID `10143`)**. Every execution scenario and defensive revert is permanently mined and verifiable via [MonadExplorer](https://testnet.monadexplorer.com).

### Core Smart Contract Registry
| Primitive / Contract | Monad Testnet Address | Bytecode Size | Verification & Purpose |
| :--- | :--- | :---: | :--- |
| **AgentMandates (Primary)** | [`0xc911e902bf3b3f532bffc1a988e2d00969a1237c`](https://testnet.monadexplorer.com/address/0xc911e902bf3b3f532bffc1a988e2d00969a1237c) | 26,274 hex chars | Primary protocol contract. Manages passkeys, mandates, limits, and vaults. |
| **MandateManager (Core v1)** | [`0x3550f9fc84640a9cfd7c51330615a1e05cb948be`](https://testnet.monadexplorer.com/address/0x3550f9fc84640a9cfd7c51330615a1e05cb948be) | 7,556 hex chars | v1 execution manager preserved for baseline regression parity. |
| **ERC-8004 Agent Registry** | [`0x8004A818BFB912233c491871b3d84c89A494BD9e`](https://testnet.monadexplorer.com/address/0x8004A818BFB912233c491871b3d84c89A494BD9e) | Canonical Monad | Verified agent identity binding (Agent NFT #2304 bound to test harness). |
| **RIP-7212 P-256 Precompile** | `0x0000000000000000000000000000000000000100` | Native Monad | EVM precompile returning `1` on valid SECP256R1 signature; `0x` fail-closed. |
| **MockTarget Router** | [`0xd856e20dbf9280299739efdc0082e431fa644e73`](https://testnet.monadexplorer.com/address/0xd856e20dbf9280299739efdc0082e431fa644e73) | Test Target | [`contracts/test/MockTarget.sol`](contracts/test/MockTarget.sol). The allowlisted call target in the recorded scenarios. |
| **Test USDC Stablecoin** | [`0x540564511d46e74c0ed48a6d63de8c79e61a860a`](https://testnet.monadexplorer.com/address/0x540564511d46e74c0ed48a6d63de8c79e61a860a) | Test ERC-20 | [`contracts/test/utils/MockERC20.sol`](contracts/test/utils/MockERC20.sol) (6 decimals, anyone can `mint`). Used for the stablecoin budget scenarios. |

### Mined On-Chain Transaction Audit Matrix
The following 8 transactions, recorded in [`deployments.mandates.json`](deployments.mandates.json), show the permitted paths and the defensive reverts on testnet. They come from `npm run e2e -- --testnet`, which signs the mandate with a software P-256 passkey (`createSoftwarePasskey` in the SDK), so no device was involved:

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

## Quickstart & Monorepo Test Matrix

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

### 2. Run the tests (200 / 200 passing)
Five suites, all green:

```bash
# 1. Solidity smart contracts, P-256 precompile & fuzz harnesses (76 tests)
npm run test:contracts

# 2. TypeScript SDK unit & WebAuthn digest suites (57 tests)
npm run test:sdk

# 3. Web Console, Judge Mode & gasless relayer security suites (38 tests)
npm run test:judge

# 4. Receipt & bytecode auditor for the v1 MandateManager testnet records (9 tests)
npm run test:auditor

# 5. Anthropic Model Context Protocol (MCP) server suite (20 tests)
npm run test:mcp
```

```
========================================================================================
Test Suite Verification Summary:
----------------------------------------------------------------------------------------
Domain                          Harness            Tests   Status    Coverage
----------------------------------------------------------------------------------------
Solidity Contracts & Precompile Foundry (forge)      76    PASSED    1000 fuzz runs
TypeScript SDK & Client API     Vitest               57    PASSED    WebAuthn digests
Web Console & Relay Security    Node.js (tsx)        38    PASSED    Rate limit & sponsor caps
Testnet Auditor & Invariants    Node.js (tsx)         9    PASSED    Chain 10143 mined receipts
Model Context Protocol (MCP)    Node.js (tsx)        20    PASSED    Agent tool schemas
----------------------------------------------------------------------------------------
TOTAL                                               200    PASSED
========================================================================================
```

### 3. Independent Verification
**AgentMandates (current):** every transaction in the matrix above links to MonadExplorer, where its status, events and gas can be checked without this repo. To reproduce the whole scenario yourself, run `npm run e2e` (spawns a local anvil chain with the P-256 precompile; needs Foundry and `cd contracts && forge build`, but no keys) or `npm run e2e -- --testnet` (see [`docs/deploy.md`](docs/deploy.md)).

**MandateManager (v1):** the command-line auditors predate AgentMandates. They read [`deployments.json`](deployments.json) (contract `0x3550f9fc84640a9cfd7c51330615a1e05cb948be`) and decode events with the v1 ABI, so they report AgentMandates transactions as unverified. They check the v1 records against Monad Testnet RPC:
```bash
# v1: chain ID, bytecode, and the expected status (plus the event, for successes) of the 8 recorded MandateManager transactions
npm run verify:all

# v1: audit one MandateManager receipt (the recorded allowed execution)
npm run verify:tx 0xdf928824bddee386bac134559d4148ac88fa5d79fdf9dcb710d8bcd2947e7e77
```

---

## Developer Integration Guide

### Install from this repository
The SDK (`packages/sdk`) and the MCP server (`packages/mcp`) are **not published on npm**. The `@agenttrust` scope on npm belongs to an unrelated publisher, so do not `npm install` or `npx` those names. Build them from a clone:

```bash
git clone https://github.com/gnshx/monad-hackathon.git
cd monad-hackathon
npm install
npm run build:sdk      # packages/sdk/dist; workspace code imports it as '@agenttrust/sdk'
npm run build:mcp      # packages/mcp/dist/index.js (also builds the SDK)
```

### Option 1: Agent Integration via MCP (Model Context Protocol)
Connect an MCP client (Claude Desktop, Claude Code, Cursor) to AgentTrust over stdio. Configure `claude_desktop_config.json`:
```json
{
  "mcpServers": {
    "agenttrust": {
      "command": "node",
      "args": ["/absolute/path/to/monad-hackathon/packages/mcp/dist/index.js"],
      "env": {
        "AGENTTRUST_CONTRACT": "0xc911e902bf3b3f532bffc1a988e2d00969a1237c",
        "AGENTTRUST_MANDATE_ID": "<your mandate id>",
        "AGENT_PRIVATE_KEY": "0x<AGENT_HOT_KEY>",
        "AGENTTRUST_RPC_URL": "https://testnet-rpc.monad.xyz"
      }
    }
  }
}
```
`AGENTTRUST_RPC_URL` is optional and defaults to Monad testnet. Use a live mandate whose `agent` is the address of `AGENT_PRIVATE_KEY`, for example one you grant on the console's Passkey Mandates page (mandate #1 from the recorded run is revoked).

The server registers seven tools, two of which are aliases:

| Tool | What it does | Result |
| :--- | :--- | :--- |
| `mandate_status` (alias `agenttrust_check_mandate`, which also accepts a `mandateId`) | Reads the mandate from chain: allowed targets and functions, per-call cap, remaining budget, vault balance, token budgets, expiry and status | Status object |
| `check_action` | Dry-runs a call with `checkAction()`. Sends nothing | `{ allowed: true, target, valueMON }` or `{ allowed: false, reason: 'ExceedsPerCallLimit', target, valueMON }` |
| `execute_action` (alias `agenttrust_execute`) | Pre-checks, then sends `execute()` from the agent key | `{ ok: true, transactionHash, explorer }`, or `{ ok: false, blockedBy: 'PermissionDenied', note }` when the mandate forbids the call (nothing is sent) |
| `pay_token` | Pays an allowlisted payee from the mandate's ERC-20 vault with `payToken()` | Same shape as `execute_action` |
| `agenttrust_verify_receipt` | Checks that a transaction succeeded and emitted `ActionExecuted` or `TokenPaid` for the mandate | `{ verified, status, kind, ... }` |

### Option 2: Programmatic Integration via TypeScript SDK
Run this inside the repo workspace after `npm run build:sdk` (see above). The owner part runs in a browser, the agent part on the agent's server.

```typescript
import {
  AgentMandates, createBrowserPasskey, signWithBrowserPasskey, encode, ownerKeyOf, type MandateTerms,
} from '@agenttrust/sdk'; // packages/sdk in this repo, not the npm package of that name
import { createPublicClient, createWalletClient, http, parseEther, toFunctionSelector } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { monadTestnet } from 'viem/chains';

const MANDATES = '0xc911e902bf3b3f532bffc1a988e2d00969a1237c';
const publicClient = createPublicClient({ chain: monadTestnet, transport: http() });

// 1. Owner (browser): create a passkey and sign the terms. No wallet needed.
const terms: MandateTerms = {
  agent: AGENT_ADDRESS,            // the agent's wallet, which must hold ERC-8004 identity AGENT_ID
  agentId: AGENT_ID,
  permissions: [{ target: TARGET, selector: toFunctionSelector('doSomething(uint256)') }],
  maxPerCall: parseEther('0.005'),
  budget: parseEther('0.02'),
  expiresAt: BigInt(Math.floor(Date.now() / 1000) + 7 * 86400),
};
const reader = new AgentMandates(MANDATES, publicClient);
const { publicKey, credentialId } = await createBrowserPasskey('alice');
const assertion = await signWithBrowserPasskey(await reader.createChallenge(publicKey, terms), credentialId);

// 2. Submit it from any funded wallet: your own relayer, or the owner's wallet.
//    The optional value funds the mandate's vault.
const relayer = new AgentMandates(MANDATES, publicClient, relayerWallet); // a viem WalletClient with an account
await relayer.relay(encode.createMandate(publicKey, terms, assertion), parseEther('0.02'));
const mandateId = (await reader.mandatesOf(ownerKeyOf(publicKey))).at(-1)!;

// 3. Agent (server): dry-run, then execute under the mandate.
const agentWallet = createWalletClient({ account: privateKeyToAccount(AGENT_KEY), chain: monadTestnet, transport: http() });
const agent = new AgentMandates(MANDATES, publicClient, agentWallet);
const check = await agent.checkAction(mandateId, agentWallet.account.address, TARGET, calldata, valueWei);
if (check.allowed) {
  const { hash } = await agent.execute(mandateId, TARGET, calldata, valueWei); // throws MandateDeniedError if denied
  console.log(`Executed: https://testnet.monadexplorer.com/tx/${hash}`);
} else {
  console.log(`Blocked: ${check.reason}`); // e.g. 'ExceedsPerCallLimit'
}
```

The hosted `/api/relay` is a same-origin demo relayer for the console. It sends no CORS headers, so other sites cannot call it from a browser; integrators should run their own relayer or call `relay()` from a funded wallet as above.

### Option 3: Accepting Agent Calls in a Contract (Solidity)
A protocol that wants agent traffic only under a live mandate should be the mandate's allowlisted target and accept calls from `AgentMandates.execute()`:

```solidity
// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

contract MonadDeFiRouter {
    address public immutable MANDATES; // AgentMandates

    constructor(address mandates) {
        MANDATES = mandates;
    }

    // The agent calls AgentMandates.execute(mandateId, address(this), data, value).
    // execute() has already checked the ERC-8004 identity, the allowlist, the per-call cap,
    // the budget, the expiry and the vault balance, recorded the spend, and pays msg.value
    // from the mandate's vault. Inside this call msg.sender is AgentMandates, not the agent.
    function executeOrder(bytes calldata orderPayload) external payable {
        require(msg.sender == MANDATES, "route through AgentMandates.execute");
        // ... settle the order
    }
}
```

`checkAction(mandateId, agent, target, data, value)` is a free view that runs the same checks for an explicit agent address. Use it as a pre-flight from an app, a relayer or another contract before serving or sending a call. It does not record spend, so it does not enforce the budget, and it is not a gate on `msg.sender` inside a call that arrives through `execute()` (there `msg.sender` is AgentMandates and the check returns `NotAgent`).

---

## Threat Model & Security Engineering

AgentTrust adheres to the **STRIDE** security threat model:

| Threat Category | Attack Vector | AgentTrust Defense Mechanism | Test Verification |
| :--- | :--- | :--- | :--- |
| **Spoofing** | Attacker tries to act as the owner: grant a budget, revoke or withdraw. | Every owner action needs a WebAuthn P-256 assertion from the mandate's registered key, checked on-chain (UP and UV flags, `webauthn.get` type, challenge equal to the action digest, low-S) and verified by the precompile at `0x0100`. With a device passkey the private key stays in the authenticator. The contract cannot tell a device passkey from a software P-256 key (see disclosures below). | `AgentMandates.t.sol`: `test_create_relayedWithRealPasskeySignature`, `test_create_wrongPasskey_reverts`, `test_create_withoutUserVerification_reverts`, `test_create_highS_reverts`, `test_create_registrationCeremonyOutput_reverts` |
| **Tampering** | A relayer or attacker changes the terms (cap, expiry, agent, permissions) in transit. | The passkey signs `createDigest`: `keccak256` over a type hash, the chain ID, the contract address, the owner key, every term and the owner's nonce. Any change gives a different digest and the signature fails. | `test_create_tamperedTerms_reverts`, `test_create_otherChain_reverts` |
| **Repudiation** | A signed owner action is replayed, or the owner disputes what happened. | Per-owner nonces make each signature single-use. On-chain events (`MandateCreated`, `ActionExecuted`, `TokenPaid`, `MandateRevoked`) record every action. | `test_create_replay_reverts` |
| **Information Disclosure** | Memory scraping or an `.env` leak exposes keys. | The owner's key is a passkey on the owner's device, not a key in the agent's environment. A leaked agent key can only act within its mandate, and the owner can revoke it with one passkey signature. | Design property, no automated test. CI runs no secret scanner. |
| **Denial of Service** | Spam to drain the relayer's MON. | Selector allowlist (only owner actions), pre-broadcast `eth_call` (a request that would revert is never sent), 10 requests/min per IP (in memory, per serverless instance), and vault sponsorship capped at 0.01 MON per grant by default, 0.02 MON per IP and 0.2 MON overall per day. Gas for valid, correctly signed requests has no daily cap; only the rate limit bounds it. | `relay.test.ts` (`npm run test:judge`): selector allowlist, per-IP rate limit and sponsorship caps. The simulation step lives in `apps/web/src/app/api/relay/route.ts` and has no dedicated test. |
| **Elevation of Privilege** | The agent calls a contract or function it was not granted, overspends, or a stranger calls `execute()`. | `execute()` and `payToken()` check the caller, liveness, ERC-8004 identity, allowlist, per-call cap, budget and vault balance, and revert before any external call. | `test_execute_stranger_reverts`, `test_execute_wrongTarget_reverts`, `test_execute_perCallLimit_reverts`, `test_execute_budget_reverts`, `test_execute_cannotCallMandatesContract`. Mined reverts in `deployments.mandates.json`: `overLimitBlocked`, `tokenOverLimitBlocked`, `rogueTargetBlocked`, `strangerBlocked` |

### Radical Engineering Transparency & Disclosures
- **No Third-Party Audit:** This project was developed during a hackathon sprint. While covered by 200 passing tests and on-chain testnet deployment, it has not undergone an external third-party security audit.
- **No Enterprise Adopters Claimed:** Pilot templates and integrations are open source, but no commercial enterprise adoption is falsely claimed.
- **Calldata Parameter Scope:** Spending caps strictly enforce native MON `msg.value` and designated ERC-20 vault token balances. They do not parse arbitrary nested calldata parameters of unindexed external protocols.
- **A mandate proves a P-256 key signed it, not that a human did.** The contract accepts any valid P-256 public key as an owner. The UV flag is set by whoever produces the assertion, and the console registers passkeys with `attestation: 'none'`. Judge Mode and `npm run e2e` sign with software keys. So `checkAction` / `checkPayment` show that the agent holds a live mandate within these limits, signed by some P-256 key. An integrator that needs a human behind the agent must accept only owner keys it onboarded itself (`getMandate(id).ownerKey`) or verify WebAuthn attestation off-chain when it enrolls the key.
- **Relayer limits are per instance.** The rate limit and sponsorship counters live in memory, so they reset on a cold start and are not shared across Vercel instances.

---

## License & Open-Source Integrity

Distributed under the **MIT License**.

- No keys are meant to be committed: `.env*` (except `.env.example`) and `.mcp-local.env` are gitignored. There is no automated secret scanning.
- Relayer private keys are injected dynamically via runtime environment variables and never logged or serialized.
- Verified on Monad Testnet (Chain ID `10143`).
