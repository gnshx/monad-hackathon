# AgentTrust — Hackathon Judging Interview Brief & Defense Guide

**Theme:** Give your AI agent a mandate, not unlimited power.  
**Audience:** Technical Judges, Security Auditors, Protocol Engineers  
**Target Execution Environment:** Monad (10,000 TPS, 1-second finality, native P-256 precompile)

---

## 1. The 30-Second Product Pitch
> "Autonomous AI agents can perform high-value on-chain actions, but giving an LLM unrestricted wallet private keys creates an existential security failure: a single prompt injection or hallucination can completely drain funds. 
> 
> AgentTrust solves this through passkey-authorized delegation and smart contract enforcement on Monad. A human owner approves a scoped, expiring mandate using their hardware passkey (TouchID, FaceID, or Windows Hello). The Monad smart contract strictly enforces caller permissions, allowlisted target contracts, 4-byte method selectors, and per-transaction spending ceilings at runtime. The human can revoke authority instantly, and our zero-backend TypeScript SDK allows anyone to independently verify execution receipts directly against RPC evidence. 
> 
> We give agents a mandate, not unlimited power."

---

## 2. 90-Second Demo Sequence (Step-by-Step)

| Time | Stage | Exact Actions & Visual Proof | Talking Points |
| :--- | :--- | :--- | :--- |
| **0–10s** | **The Problem** | Overview screen on warm editorial console. Point to "Agent authority, under control." | "Agents need on-chain execution authority, but giving an autonomous agent an unconstrained private key is an unmitigated risk." |
| **10–25s** | **Policy-to-Proof Explorer** | Click **"Run guided demo"**. Load the canonical scenario: "Swap up to 0.2 MON on the approved contract for 1 hour." Review the structured EVM bounds and the **Actionable Policy Linter**. | "We draft an explicit EVM boundary. Notice our policy linter: rather than a subjective AI score, it evaluates concrete EVM invariants—target allowlist, 4-byte selector specificity, per-tx ceiling, and expiry." |
| **25–40s** | **Passkey Authorization** | Open the Passkey Authorization modal. Show the Monad chainId 10143 binding, contract address, and WebAuthn prompt. | "The human authorizes the policy with a hardware passkey (P-256). The signature challenge is cryptographically bound to the Monad chain ID, contract, and policy parameters. If the prompt is cancelled or unavailable, it fails closed—zero fake authorizations." |
| **40–55s** | **Security Invariant Tests** | In Step 03 of Explorer, run the 3 preflight invariant tests: 1. Permitted DEX Swap (`Success`), 2. Rogue Target prompt injection (`TargetNotAllowed()`), 3. Ceiling Breach (`ExceedsPerTxLimit()`). | "We test the exact policy against three invariants. When prompt injection attempts to redirect funds to an unapproved hacker address, the contract reverts with `TargetNotAllowed()`. When an agent attempts an over-budget transaction, it reverts with `ExceedsPerTxLimit()`. The vault balance remains intact." |
| **55–70s** | **Revocation & State Change** | Switch to Mandates Ledger or trigger Revoke on active mandate. | "If anomalous agent behavior is detected, the owner triggers immediate on-chain revocation. Subsequent agent calls revert with `MandateIsRevoked()`, and unspent vault deposits can be reclaimed." |
| **70–85s** | **Receipt Verification & Proof Dossier** | Click **"Export Proof Bundle"** (JSON dossier) and open the **Receipt Inspector**. Paste a transaction hash to query live RPC logs. | "We don't ask you to trust our frontend. Our TypeScript SDK (`@agenttrust/sdk`) decodes raw RPC receipts without a backend, validating inclusion status, contract origin, and emitted event parameters." |
| **85–90s** | **Closing & Developer Path** | Show the `@agenttrust/sdk` quickstart code snippet. | "AgentTrust is developer-first infrastructure for the emerging agent economy on Monad. You can install `@agenttrust/sdk` and integrate policy boundaries into your agent loop in under three minutes." |

---

## 3. Threat Model: What is Enforced On-Chain vs. In-Browser

### Enforced On-Chain by `MandateManager.sol`
1. **Caller Restriction (`CRIT-01`)**: Strictly `require(msg.sender == mandate.agentAddress, CallerNotAuthorized())`. Unauthorized third parties or strangers cannot invoke execution, even if they know the mandate ID.
2. **Target Allowlist**: Calldata target address must match an entry in `mandate.targets[]`. Reverts with `TargetNotAllowed()`.
3. **Method Selector Enforcement**: Calldata selector (`bytes4(msg.data[0..4])`) must match the approved selector. If `0x00000000` (wildcard), any function is permitted on the allowlisted target; otherwise, unauthorized function calls revert with `SelectorNotAllowed()`.
4. **Per-Transaction Outflow Ceiling**: Value of the transaction cannot exceed `mandate.maxValuePerTx`. Reverts with `ExceedsPerTxLimit()`.
5. **Cumulative Vault Budget**: Cumulative spending across the lifetime of the mandate cannot exceed `mandate.maxTotalValue`. Reverts with `ExceedsTotalBudget()`.
6. **Time-To-Live Expiration**: If `block.timestamp > mandate.expiresAt`, transaction reverts with `MandateExpired()`.
7. **Instant Human Revocation**: Owner calling `revokeMandate(id)` sets `mandate.revoked = true`. Subsequent agent executions revert with `MandateIsRevoked()`.
8. **Isolated Vault Accounting**: Each mandate maintains its own `balance` mapping. Execution drains only the mandate's designated deposit, preventing cross-mandate theft.
9. **P-256 WebAuthn Verification**: EIP-7212 / RIP-7212 precompile call at `0x0100` verifies the Secp256r1 signature against `(hash, r, s, pubKeyX, pubKeyY)`.

### Handled in Browser / Off-Chain (Not Trust Boundaries)
1. **Natural Language Policy Compiler**: Purely deterministic regex and string parsing in the browser to prepopulate mandate fields. **Not an enforcement mechanism**; the smart contract validates all incoming parameters regardless of how they were compiled.
2. **Local Preflight Sandbox**: Evaluates invariant logic locally before submitting transactions to save gas and demonstrate failure modes offline. Labeled prominently as `LOCAL PREFLIGHT SIMULATION`.
3. **WebAuthn Client Assembly**: Generates clientDataJSON and authenticatorData via WebAuthn API; browser is trusted only to transmit the user's authentic signature to the transaction.

---

## 4. What the Receipt Verifier Actually Proves (and What It Cannot Prove)

### What `@agenttrust/sdk` `verifyReceipt()` Proves:
1. **RPC Inclusion**: Transaction was mined in a valid block on Monad RPC (Chain ID 10143) with status `0x1 (Success)`.
2. **Emitted Event Authenticity**: Event topic `0x...` matches `ActionExecuted(uint256,address,bytes4,uint256,bytes)` emitted directly by the genuine `MandateManager` contract address (not an impersonator).
3. **Mandate Parameter Conformity**: The decoded event parameters (`mandateId`, `target`, `selector`, `value`) match the specific mandate invariants expected by the auditor.

### What the Receipt Verifier CANNOT Prove:
1. **Prompt Truthfulness**: It cannot prove that the original user prompt was truthful or that the agent had "good intentions."
2. **Off-Chain Agent Reasoning**: It cannot prove what model weights, reasoning traces, or LLM inferences the agent used off-chain.
3. **External Contract Invariants**: It verifies what call was dispatched to the target contract; it cannot prove internal business logic inside third-party contracts beyond their return status.

---

## 5. Honest Technical Status

| Component | Technical Truth & Status |
| :--- | :--- |
| **Deterministic Policy Compiler** | In-browser deterministic parser using regular expressions and EVM type validators. Zero latency, zero cloud dependency, no hallucinated policies. Clearly disclosed as deterministic in the UI. |
| **P-256 Precompile on Monad** | Monad native RIP-7212 precompile at `0x0100` tested directly via `eth_call` on `https://testnet-rpc.monad.xyz` using a valid 160-byte vector (`hash \|\| r \|\| s \|\| x \|\| y`). Returned 32-byte `1`. Invalid inputs returned `0x`. Fully functional on Monad testnet. |
| **Smart Contract Test Suite** | 29/29 Foundry tests passing (`forge test`), covering caller authorization, allowlists, spend caps, isolated vaults, replay protection, and WebAuthn signatures. |
| **SDK Test Suite** | 17/17 Vitest unit & integration tests passing (`npm run test:sdk`). |
| **Monad Testnet Deployment Status** | The configured contract address `0xa5754E89745eC4eB9d7F31f0C34eB267773531b7` currently has 0 bytes bytecode on Monad Testnet because the testnet faucet was rate-limited during the hackathon window. The UI honestly detects this (`client.getBytecode`) and presents a deployment guide and local simulation sandbox, rather than fabricating a fake testnet status. |

---

## 6. Ten Difficult Judge Questions with Precise, Defensible Answers

### Q1: "Why does this need a smart contract? Why not just use a system prompt or an API guardrail?"
> **Answer:** "A system prompt is a guideline, not a trust boundary. Prompt injection attacks (jailbreaks, indirect injection from untrusted web data, tool output hijacking) can routinely bypass system prompts. Once an LLM is compromised, any client-side API guardrail running alongside the agent can be subverted if the agent holds a private key. A smart contract enforces immutable consensus invariants at the EVM execution boundary: even if the LLM goes completely rogue, the contract code physically rejects transactions outside the allowlist or exceeding the spending cap."

### Q2: "What exactly is enforced on-chain versus handled in the browser?"
> **Answer:** "All security boundaries are enforced on-chain by `MandateManager.sol`: caller authorization, target allowlist, method selector, per-tx value cap, total budget, expiry, revocation, and vault balance isolation. The browser handles user intent drafting, passkey assertion requests, and local preflight previews. The smart contract does not trust the browser: every transaction requires a valid signature and passes on-chain validation."

### Q3: "What does the passkey actually protect?"
> **Answer:** "The passkey protects mandate authorization. It ensures that only the human owner with physical device access (biometrics or hardware security key) can grant execution authority or deposit funds into an agent's vault. It prevents malicious websites or unauthorized local processes from forging mandates. Once authorized, the on-chain policy governs what the agent is permitted to do."

### Q4: "What does your receipt verifier prove, and what can it NOT prove?"
> **Answer:** "The receipt verifier cryptographically proves that a given transaction succeeded on-chain, that the genuine `MandateManager` contract emitted the `ActionExecuted` event, and that the executed target, selector, and value matched policy bounds. It does *not* prove that the user prompt was honest, nor does it inspect off-chain LLM thought processes. It proves execution compliance, not intent."

### Q5: "Is your AI Copilot really powered by an LLM?"
> **Answer:** "No, and we are proud of that architectural choice. The Copilot is a deterministic in-browser policy compiler. For security infrastructure, deterministic parsing is superior to an LLM: it cannot hallucinate parameters, introduces zero network latency, doesn't leak sensitive wallet addresses to third-party model providers, and reliably maps plain-English constraints into EVM types. We clearly disclose this in the UI."

### Q6: "Why Monad specifically?"
> **Answer:** "Two concrete architectural reasons:
> 1. **Native P-256 Precompile**: Monad provides the RIP-7212 precompile at address `0x0100`, allowing native WebAuthn Secp256r1 signature verification in ~3,450 gas, compared to ~300,000+ gas on standard Ethereum where P-256 must be verified in user-space bytecode.
> 2. **High Throughput & Sub-Second Finality**: AI agents generate bursts of programmatic micro-transactions. Monad's 10,000 TPS and 1-second finality allow realtime agent decision loops without clogging the mempool or incurring prohibitive gas fees."

### Q7: "Who would use this first? What is your realistic target customer?"
> **Answer:** "Our first users are developers building transaction-capable autonomous agents—such as autonomous DeFi rebalancers, DAO automated treasury runners, and automated game players. These developers currently face a binary choice: grant their agent a hot private key with full wallet drain risk, or keep a human in the loop for every micro-transaction. AgentTrust gives them an SDK to grant scoped, autonomous operational freedom with guaranteed financial downside bounds."

### Q8: "How does this compare to ERC-4337 Session Keys, Safe Modules, or MetaMask Delegation?"
> **Answer:** "ERC-4337 session keys and Safe modules are designed for general account abstraction and often require full smart contract wallet migrations, Bundler infrastructure, and paymasters. MetaMask's delegation toolkit provides ERC-7715 permissions primarily geared towards browser extensions. 
> AgentTrust focuses specifically on the **autonomous agent developer workflow**: lightweight isolated vaults that work with standard EOAs via WebAuthn, paired with an open-source TypeScript SDK that agents import directly into LangChain, CrewAI, or autonomous loop runtimes, plus an independent receipt verifier for third-party auditing."

### Q9: "What happens if the P-256 precompile is unavailable or deployed on another EVM chain?"
> **Answer:** "On chains without RIP-7212, our contract architecture supports a modular verifier interface (`IP256Verifier`). We can swap the precompile call for a software-based FCL (FreshCryptoLib) P-256 verifier. However, on Monad, the precompile is active and confirmed at `0x0100`, providing massive gas savings."

### Q10: "Is the contract deployed on Monad testnet right now?"
> **Answer:** "The contract code is 100% written, tested with 29 Foundry tests, and deployment-ready via `contracts/script/Deploy.s.sol`. On Monad testnet, because the public faucet was rate-limited during the hackathon sprint, the configured address currently has 0 bytes bytecode. Rather than faking a deployment or hardcoding synthetic transaction hashes, our console honestly detects bytecode status via RPC and clearly directs judges to our fully verified local Anvil node or provides the one-command deployment script. Every claim we make is backed by verifiable code."

---

## 7. Competitor Comparison Table

| Feature / Dimension | AgentTrust | ERC-4337 Session Keys | Generic AI Agent Wallets | MetaMask Delegation (ERC-7715) |
| :--- | :--- | :--- | :--- | :--- |
| **Enforcement Layer** | Smart Contract on Monad | AA Bundler + Smart Account | System Prompt / Client API | Wallet Client / Extension |
| **Passkey Hardware Binding** | Native P-256 via Monad Precompile (`0x0100`) | Often secp256k1 or custom precompile | None (Raw private key in `.env`) | WebAuthn or EOA signature |
| **Downside Protection** | Isolated Vault + Per-Tx & Total Cap | Variable Account Rules | None (Full wallet drain risk) | Session allowance |
| **Independent Verification** | Open-source TS SDK Receipt Verifier | Bundler userOp receipt | Centralized API logs | Wallet internal state |
| **Deterministic Linter** | Actionable EVM bounds linter | None | Subjective "Security Score" | None |
| **Developer Integration** | 3-line `@agenttrust/sdk` import | Complex AA SDK & Paymaster setup | Direct private key export | Extension provider API |

---

## 8. Realistic Adoption Path & Pilot Plan (No Fabricated Metrics)

### Phase 1: Developer Friction Testing (Weeks 1–4)
- Recruit 5 developer teams currently building autonomous on-chain agents (DeFi rebalancers, NFT arbitrage bots, AI social agents).
- Observe onboarding with `@agenttrust/sdk` in an isolated testnet sandbox: track time-to-first-mandate, configuration errors, and API friction.
- Document and publish findings publicly: what policy constraints agents struggle with and where developer ergonomic friction exists.

### Phase 2: Open Source SDK Distribution (Weeks 5–8)
- Publish `@agenttrust/sdk` to npm with turnkey plugins for popular agent frameworks:
  - `@agenttrust/langchain` tool wrapper
  - `@agenttrust/eliza` plugin
  - `@agenttrust/crewai` execution tool
- Fund testnet deployment on Monad once testnet faucet tokens are distributed, recording canonical testnet transaction hashes for public explorer inspection.

### Phase 3: Mainnet Security Audit & Bug Bounty (Weeks 9–12)
- Formal verification of `MandateManager.sol` spending limit invariants.
- Community audit contest before mainnet vault deployment.

---

## 9. Final Submission Checklist & Go/No-Go Decision

### Go / No-Go Criteria Audit
- [x] **No Fabricated Data**: Zero synthetic transaction hashes; empty states when unverified. **(PASS)**
- [x] **Truthful Architecture Disclosure**: Policy compiler disclosed as deterministic. **(PASS)**
- [x] **Precompile Verification**: Confirmed via direct RPC test vector on Monad testnet. **(PASS)**
- [x] **Local Anvil E2E Lifecycle**: 6/6 demo scenarios pass with real mined receipts. **(PASS)**
- [x] **Smart Contract Suite**: 29/29 Foundry tests pass (`forge test`). **(PASS)**
- [x] **SDK Verification Suite**: 17/17 Vitest tests pass (`npm run test:sdk`). **(PASS)**
- [x] **Policy-to-Proof Explorer**: Centerpiece 4-step pipeline live on web console. **(PASS)**
- [x] **Editorial Security UI**: Warm canvas `#F7F5EF`, Monad violet `#5944DB`, high contrast. **(PASS)**

### **FINAL VERDICT: GO FOR DEMO**
**Demo Strategy:** Present the live Policy-to-Proof Explorer on the warm editorial console. Walk through the 90-second demo script. Be 100% transparent about the local simulation vs. testnet deployment distinction. Highlight the technical rigor of the contract invariants and zero-backend receipt verification.
