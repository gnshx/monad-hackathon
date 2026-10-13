# 🛡️ AgentTrust — Master Judging & Investment Dossier

> **Hackathon Track:** Metropolis — Trust & Data Ownership Layer  
> **Prepared For:** Metropolis Hackathon Judging Panel & Investment Committee  
> **Judges Reference:** Keone Hon, Tina Qi, Maria Shen, Will Nuelle, Frankie, Evan Feng, Ajit Tripathi, Francesco Andreoli  

---

## ⚡ 1. Executive Briefing (60-Second Read)

### The Problem
Autonomous AI agents are transitioning from informational chat assistants to programmatic economic actors executing DEX swaps, rebalancing liquidity, and paying for compute. However, **giving an AI model an unconstrained private key creates catastrophic economic risk**: prompt injection, model hallucinations, or leaked server credentials can instantly drain a treasury.

### The Solution: AgentTrust
**AgentTrust is the cryptographic trust and delegation boundary for autonomous AI on Monad.** 
Instead of handing agents unrestricted keys, a human owner authorizes a scoped mandate with a single biometric tap of their device hardware passkey (TouchID, FaceID, YubiKey).

The smart contract on Monad—**not the AI model, SDK, or backend**—is the strict enforcement boundary:
- **Allowlisted Targets & Method Selectors:** The agent cannot touch unapproved contracts.
- **Runtime Spending Ceilings:** Strict per-action and cumulative native spending limits.
- **Isolated Vault Accounting:** Prevents cross-mandate fund contamination.
- **Caller Guard (CRIT-01):** Prevents third-party caller hijacking.
- **Instant Human Revocation:** Humans can revoke authority and withdraw unspent funds at any time.

---

## 🚀 2. Founder & Market Readiness (The Startup Wedge)

### The Wedge: Who Adopts First?
We focus on **developers building autonomous on-chain agents** who already use ERC-8004 Agent Registries and x402 payment streams on Monad:
1. **Autonomous DeFi Agents:** Trading and yield-rebalancing bots that need execution authority without custody liability.
2. **MCP (Model Context Protocol) Tool Servers:** AI development teams connecting Claude Desktop or Cursor to Web3.
3. **Gaming & Social Agents:** Autonomous NPCs with micro-budgets for in-game interactions.

### Why Developers Won't "Roll Their Own"
Building and auditing a secure mandate boundary is painful and risky:
- **RIP-7212 WebAuthn Integration:** Parsing clientDataJSON, challenge offset verification, low-S signature normalization, and public key recovery.
- **Vault Security:** Reentrancy guards, isolated ledger accounting, and caller-binding invariants.
- **Auditing Complexity:** Building an independent receipt verifier for counterparties.
- **AgentTrust Solution:** A 15-minute drop-in `@agenttrust/sdk` with `createAgentGuard()` middleware.

### Business Model & Monetization
| Revenue Stream | Target Customer | Pricing Model |
| :--- | :--- | :--- |
| **Open Core Primitive** | Open-source agent developers | Free (MIT License) |
| **Hosted Relayer & Bundler API** | Teams wanting gasless passkey onboarding | Usage-based per transaction relay |
| **Enterprise Policy Compiler & Dashboard** | Institutional funds & protocol treasuries | $499/mo SaaS + SLA |
| **Counterparty Receipt Audit API** | Exchanges, auditors, liquidity pools | Webhook & compliance query fees |

### The Ask: What We Will Do With Metropolis Support
Winning the hackathon and entering the Monad Ecosystem Residency will fund:
1. **Formal verification** of `MandateManager.sol` with Certora / Runtime Verification.
2. **Mainnet deployment** at Monad genesis.
3. **Production design partnerships** with 3 native Monad protocols (DEXs, lending markets, agent frameworks).

---

## 🦊 3. The MetaMask Question: AgentTrust vs. MetaMask Delegation

> *Special Briefing for Francesco Andreoli (MetaMask DevRel Lead & Delegation Architect)*

### "How is AgentTrust different from MetaMask's scoped delegation framework (ERC-7715)?"

**The Short Answer:** AgentTrust is **complementary, not competing**. While MetaMask Delegation focuses on interactive browser wallet sessions for human users, AgentTrust is an on-chain execution primitive purpose-built for **headless, autonomous AI agent runtimes operating 24/7 without browser extensions**.

| Architectural Dimension | MetaMask Delegation (ERC-7715) | AgentTrust on Monad |
| :--- | :--- | :--- |
| **Primary Target User** | Interactive human wallet user in a dApp session | Headless autonomous AI agent (LangChain, Eliza, CrewAI, AutoGPT) |
| **Root of Trust** | EIP-712 signature generated inside browser extension | Hardware WebAuthn Passkey (Secure Enclave / TPM) verified via **Monad RIP-7212 (`0x0100`)** |
| **Agent Identity Binding** | Session caveat caveats tree | Composes directly with on-chain **ERC-8004 Agent Identity Registry** (`0x8004A818...`) |
| **Execution Environment** | Client-side wallet extension runtime | Server-side / background daemon via zero-dependency `@agenttrust/sdk` |
| **Receipt Auditing** | Wallet transaction history | Standalone cryptographic receipt auditor for third-party counterparties (`verifyReceipt`) |

**The Synergy:** A user can create and manage their AgentTrust vaults directly through their MetaMask wallet! AgentTrust provides the isolated on-chain execution container that the autonomous agent interacts with.

---

## 🛡️ 4. Radical Honesty: What IS and IS NOT Enforced On-Chain Today

In accordance with our engineering integrity standards:

### ✅ What IS Hard-Enforced On-Chain Today:
1. **Native MON Spending Ceilings:** Strict checks on `msg.value` passing through `target.call{value: value}` (`ExceedsPerTxLimit`, `ExceedsTotalLimit`).
2. **Target Contract Allowlisting:** Gating call destination against `allowedTargets[mandateId]` (`TargetNotAllowed`).
3. **4-Byte Function Selector Specificity:** Reverting calls to unapproved functions on allowed contracts.
4. **Caller Authorization Guard (CRIT-01):** Ensuring only `mandate.agentAddress` can trigger execution (`CallerNotAuthorized`).
5. **Isolated Vault Accounting:** Preventing cross-mandate balance theft.
6. **Instant Owner Revocation:** Locking execution and returning unspent funds immediately (`MandateRevoked`).
7. **WebAuthn User Presence:** Verifying bit `flags & 0x01` in authenticatorData on-chain.

### 🔄 What is on our Post-Hackathon Roadmap (Transparent Limitations):
1. **Nested ERC-20 Calldata Parameter Decoding:** Today's spending cap strictly limits native MON (`msg.value`). Decoding nested calldata arguments (e.g. `transfer(address,uint256)` token amounts) requires dynamic ABI decoding scheduled for v2.0.
2. **Biometric-Exclusive Flag (`flags & 0x04`):** Current WebAuthn checks enforce User Presence (touch/presence confirmation). Strict hardware biometric verification flag gating is planned for the v2 envelope.

---

## 📊 5. Technical Execution & Live Testnet Evidence

| Milestone / Primitive | Status | Live Evidence Proof |
| :--- | :--- | :--- |
| **RIP-7212 P-256 Precompile** | **PROVEN LIVE ON MONAD TESTNET** | Verified at `0x000...0100` via `npm run verify:p256`. 160B valid vector returns `uint256(1)`; corrupted vector returns `0x` fail-closed. |
| **ERC-8004 Registry Composability** | **PROVEN LIVE ON MONAD TESTNET** | Verified at `0x8004A818BFB912233c491871b3d84c89A494BD9e` via `npm run verify:erc8004`. Correctly validates designated wallet and rejects impostors. |
| **Smart Contract Suite** | **29/29 TESTS PASSING** | Foundry suite with 1,000-run fuzz tests, reentrancy guards, vault isolation (`forge test`). |
| **TypeScript SDK** | **25/25 TESTS PASSING** | Vitest suite with preflight invariant checking and tiered receipt validation (`npm run test:sdk`). |
| **1-Command Receipt Verifier** | **LIVE CLI TOOL** | `npm run verify:tx <hash>` allows anyone to independently audit any transaction against Monad RPC. |
| **Interactive Console Hub** | **LIVE INTERACTIVE** | Deployed with in-browser zero-gas precompile test, live ERC-8004 inspector, and Attack Lab. |

---

## 🎙️ 6. Core Defense Questions Rehearsed

### Q1: "What happens if the agent's hot private key is compromised?"
> **Answer:** "The damage is strictly capped on-chain. The attacker can only call the specific allowlisted contract and 4-byte selector authorized in the mandate, can only spend up to the per-transaction limit, and is capped by the remaining vault balance. They cannot touch the human owner's main wallet or other mandates. Furthermore, the human owner can revoke the mandate with one tap, instantly cutting off all execution authority and withdrawing unspent funds."

### Q2: "Why Monad specifically?"
> **Answer:** "Two concrete primitives:
> 1. **Native RIP-7212 P-256 Precompile (`0x0100`):** Reduces passkey verification cost to 6,900 gas per Monad docs (roughly 50x cheaper than Solidity bytecode on standard EVM), making passkey delegation economically viable for high-frequency agents.
> 2. **Low-Latency Synchronous Gating:** Agents executing continuous tool calls need immediate confirmation with instant cryptographic receipts, rather than waiting 15 seconds per action."

### Q3: "What does the passkey prove, and what does User Presence leave out?"
> **Answer:** "The passkey proves that a human physically interacted with their authentic device hardware authenticator to sign the canonical mandate hash bound to Monad chainId 10143. Our contract validates the WebAuthn User Presence bit (`flags & 0x01`). What it leaves out today is the User Verification bit (`flags & 0x04`), which distinguishes PIN/touch from biometric confirmation. We document this transparently as our v2 roadmap milestone."

### Q4: "Why wouldn't an agent team just roll their own check in TypeScript?"
> **Answer:** "Off-chain software checks do not provide cryptographic guarantees. An agent running in Python or Node.js can suffer memory corruption, prompt injection, or logic bugs that bypass local `if` statements. The blockchain must be the enforcement boundary. AgentTrust provides that boundary as an audited smart contract and drop-in SDK, saving teams months of cryptographic engineering."

### Q5: "What is your commercial wedge?"
> **Answer:** "Our wedge is developers already deploying agents on Monad using ERC-8004 identity registries and x402 payment streams. We provide the missing policy layer: scoped mandates, vault isolation, and counterparty receipts. We monetize through a hosted relayer, enterprise compliance dashboard, and auditor API."
