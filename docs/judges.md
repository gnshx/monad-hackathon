# 🛡️ AgentTrust — Master Judging & Investment Dossier

> **Hackathon Track:** Metropolis — Trust & Data Ownership Layer  
> **Prepared For:** Metropolis Hackathon Judging Panel & Investment Committee  
> **Judges Reference:** Keone Hon, Tina Qi, Maria Shen, Will Nuelle, Frankie, Evan Feng, Ajit Tripathi, Francesco Andreoli  

**Judges & Evaluators Quick Links:**
- 🏆 **Official Submission Package & Portal Copy:** [`docs/submission-package.md`](submission-package.md)
- 🎬 **Video Storyboards & Integration Outreach:** [`docs/storyboard-and-outreach.md`](storyboard-and-outreach.md)
- 📊 **Claim vs. Evidence Matrix:** [`docs/claim-vs-evidence.md`](claim-vs-evidence.md)
- 🎙️ **Interview Defense Brief & Rehearsed Answers:** [`docs/interview-brief.md`](interview-brief.md)
- ⚡ **1-Command Independent Verifier:** `npm run verify:tx <txHash>`

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

## 🦊 3. The MetaMask Question: Complementary Architecture

> *Special Briefing for Francesco Andreoli (MetaMask DevRel Lead & Delegation Architect)*

### "How does AgentTrust relate to MetaMask's delegation initiatives (e.g. [MetaMask Delegation Toolkit](https://docs.metamask.io/delegation-framework/) and [ERC-7715](https://eips.ethereum.org/EIPS/eip-7715))?"

**The Short Answer:** AgentTrust is **complementary, not competing**. We do not make assumptions about MetaMask's internal caveat enforcers or future roadmap. Instead, a human owner can use their standard wallet (including MetaMask) or device passkey to create and fund an AgentTrust mandate vault. 

AgentTrust provides three concrete, on-chain primitives purpose-built for autonomous AI agents on Monad:

1. **Passkey Root via Monad's RIP-7212 P-256 Precompile (`0x0100`):**
   - Mandate authorization can be anchored directly to hardware biometrics / WebAuthn passkeys (TouchID, FaceID, YubiKey) via secp256r1.
   - Verified directly on-chain on Monad at 6,900 gas (per Monad docs, ~50x cheaper than EVM bytecode verifiers).
   - Zero MPC networks, zero relayer custodianship, and zero off-chain verification servers needed to validate human consent.

2. **Native ERC-8004 Agent Identity Binding:**
   - Directly composes on-chain with Monad Testnet's **ERC-8004 Trustless Agent Identity Registry** (`0x8004A818BFB912233c491871b3d84c89A494BD9e`).
   - Every mandate explicitly authorizes an on-chain registered agent identity (`agentId`), preventing execution by unauthorized agents and establishing provenance.

3. **Independent Counterparty Receipts Without Server Trust:**
   - Every authorized action emits a canonical `ActionExecuted(mandateId, target, selector, value, returnData)` event.
   - Any counterparty, DEX, or compliance auditor can verify execution receipts directly against Monad RPC using our standalone zero-dependency verifier (`npm run verify:tx <txHash>` / `verifyReceipt`), without trusting or pinging an AgentTrust backend.

**The Synergy:** A user connects their wallet (e.g. MetaMask) or passkey to establish a scoped mandate. The autonomous AI agent (running headless in LangChain, Eliza, CrewAI, or an MCP server) executes on-chain within those immutable bounds.

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

### 📍 Live Monad Testnet Deployments (Chain ID: 10143)
- **MandateManager:** [`0x3550f9fc84640a9cfd7c51330615a1e05cb948be`](https://testnet.monadexplorer.com/address/0x3550f9fc84640a9cfd7c51330615a1e05cb948be)
- **MockTarget Router:** [`0x0758fdc78e20f748fa89e2d53f84748697cb177f`](https://testnet.monadexplorer.com/address/0x0758fdc78e20f748fa89e2d53f84748697cb177f)
- **ERC-8004 Registry:** [`0x8004A818BFB912233c491871b3d84c89A494BD9e`](https://testnet.monadexplorer.com/address/0x8004A818BFB912233c491871b3d84c89A494BD9e)
- **Native RIP-7212 Precompile:** `0x0000000000000000000000000000000000000100`

### ⛓️ Mined On-Chain Transaction Proofs (Every Scenario Executed on Monad Testnet)
| Scenario | On-Chain Action | Status | Mined Transaction Hash | Monad Explorer Link |
| :--- | :--- | :--- | :--- | :--- |
| **Setup** | WebAuthn Credential Registration | Confirmed | `0x3eafdec02f64a2fb...` | [View Tx](https://testnet.monadexplorer.com/tx/0x3eafdec02f64a2fb78e0ae3fef6f7ba4eea5da0cb142e58041d100605a5d21d2) |
| **Mandate Creation** | P-256 WebAuthn Envelope Authorization | Block #70689675 | `0xd9e9a355baa9d16c...` | [View Tx](https://testnet.monadexplorer.com/tx/0xd9e9a355baa9d16c37c3411349a9437c6c09c9dcf2ffc0940cf049c7c8182e32) |
| **Scenario 1** | Allowed Agent Action (0.02 MON spend) | Block #70689680 | `0xdf928824bddee386...` | [View Tx](https://testnet.monadexplorer.com/tx/0xdf928824bddee386bac134559d4148ac88fa5d79fdf9dcb710d8bcd2947e7e77) |
| **Scenario 2** | Rogue Target Call Attempt | Block #70689692 (Reverted) | `0x83df0f92e5135024...` | [View Tx](https://testnet.monadexplorer.com/tx/0x83df0f92e51350248df49713c9a19c6a9b2b2d0e7eb40dca6dd8155318228c7a) |
| **Scenario 3** | Over-Limit Spend (0.1 > 0.05 MON cap) | Block #70689698 (Reverted) | `0x959dbe12d49225b1...` | [View Tx](https://testnet.monadexplorer.com/tx/0x959dbe12d49225b19d1fea8344077f849b89a3dc5a1d7b38b9aa24ba3a0cc0bd) |
| **Scenario 4** | Stranger Caller Hijack Attempt | Block #70689703 (Reverted) | `0xc9ca8bfa073880c6...` | [View Tx](https://testnet.monadexplorer.com/tx/0xc9ca8bfa073880c6818d0b43ac023ef490a56b31a7a95e5fcc3653fe909cd691) |
| **Scenario 5** | Human Owner Instant Revocation | Block #70689710 | `0x5b082de833511df8...` | [View Tx](https://testnet.monadexplorer.com/tx/0x5b082de833511df83bd84d7351dcca5aff57eaf43a30aa2f5200a80d952e33ff) |
| **Recovery** | Unspent Vault Balance Reclaim | Block #70689714 | `0x56d206d2ae776e4a...` | [View Tx](https://testnet.monadexplorer.com/tx/0x56d206d2ae776e4aad9997059c87caeeefa44de887f1eea0c094d45f1a572f84) |
| **Scenario 6** | Standalone SDK Receipt Audit | 100% Cryptographic Proof | Verified via CLI | `npm run verify:tx 0xdf928824bddee386bac134559d4148ac88fa5d79fdf9dcb710d8bcd2947e7e77` |

### 🛠️ Verification Commands & Primitives Matrix
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
