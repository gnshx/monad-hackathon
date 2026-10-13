# 🛡️ AgentTrust — Hardware Passkey Mandates for AI Agents

<p align="center">
  <img src="./docs/assets/agenttrust_logo.jpg" alt="AgentTrust Architecture Logo" width="220" style="border-radius: 20px; box-shadow: 0 12px 40px rgba(16, 185, 129, 0.25);" />
</p>

<p align="center">
  <strong>Passkey-Authorized Hardware Delegation · Monad Native RIP-7212 P-256 Precompile · Isolated Vault Accounting · Cryptographic Execution Receipts</strong>
</p>

<p align="center">
  <a href="https://1e9e766e0acd5a.lhr.life"><img src="https://img.shields.io/badge/Live_Console-3ed34c0a87e119.lhr.life-10b981?style=for-the-badge&logo=cloudflare&logoColor=white" alt="Live Console" /></a>
  <a href="https://github.com/gnshx/monad-hackathon"><img src="https://img.shields.io/badge/GitHub-Repository-181717?style=for-the-badge&logo=github&logoColor=white" alt="GitHub Repo" /></a>
  <img src="https://img.shields.io/badge/Monad_Testnet-Chain_10143-836ef9?style=for-the-badge&logo=ethereum&logoColor=white" alt="Monad Network" />
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Contracts-29%2F29_Passed_(1k_Fuzz)-success?style=flat-square&logo=solidity" alt="Foundry Tests" />
  <img src="https://img.shields.io/badge/SDK-17%2F17_Passed_(Vitest)-success?style=flat-square&logo=typescript" alt="SDK Tests" />
  <img src="https://img.shields.io/badge/Precompile-RIP--7212_@_0x100-emerald?style=flat-square" alt="RIP-7212" />
  <img src="https://img.shields.io/badge/Next.js-15.5.27_Turbopack-black?style=flat-square&logo=next.js" alt="Next.js" />
  <img src="https://img.shields.io/badge/License-MIT-blue?style=flat-square" alt="License" />
</p>

<p align="center">
  <a href="https://1e9e766e0acd5a.lhr.life">🌐 Live Web Console</a> •
  <a href="#-reproducible-judge-evaluation-guide">📋 Judge Evaluation Guide</a> •
  <a href="docs/claim-vs-evidence.md">📊 Claim vs. Evidence Matrix</a> •
  <a href="docs/acceptance-checklist.md">✅ 10/10 Acceptance Checklist</a> •
  <a href="docs/demo-script.md">🎬 90-Sec Video Script</a> •
  <a href="docs/competitor-analysis.md">🔍 Market & Competitor Analysis</a> •
  <a href="docs/threat-model.md">🛡️ Threat Model</a>
</p>

---

## 📋 Reproducible Judge Evaluation Guide

### 1. What problem is solved?
Autonomous AI agents are increasingly tasked with transacting on-chain (DEX swaps, yield rebalancing, micro-payments). Giving an agent an unconstrained private key creates existential risk: prompt injection, model hallucinations, logic bugs, or leaked credentials can instantly drain an entire treasury. **AgentTrust replaces unconstrained key access with hardware passkey-delegated, bounded mandates enforced on-chain by Monad.**

### 2. Who needs it?
- **AI Agent Developers & Frameworks** (Eliza, LangChain, CrewAI, AutoGPT) that need safe execution authority without custody liabilities.
- **DeFi Users & Protocol Treasuries** delegating routine transactions to autonomous agents while guaranteeing hard spending limits.
- **Auditors & Counterparties** who need independent cryptographic receipts to verify agent compliance without trusting off-chain assertions.

### 3. What is the security model?
1. **Human Root of Trust:** The owner authorizes a mandate using their device hardware passkey (TouchID, FaceID, YubiKey) generating a standard SECP256R1 (P-256) signature.
2. **On-Chain Enforcement:** `MandateManager.sol` validates the passkey signature natively via Monad's RIP-7212 precompile (`0x0100`).
3. **Hard Boundaries:** Calls are gated by allowlisted target contracts, 4-byte function selectors, per-transaction spending caps, cumulative budgets, and expiration windows.
4. **Caller Guard (CRIT-01):** Only the explicitly designated agent wallet (`msg.sender == mandate.agentAddress`) can trigger execution.
5. **Instant Revocation:** The human owner retains instant on-chain revocation power at any time, locking the mandate and enabling unspent vault recovery.

### 4. How can I run the local demo?
```bash
git clone https://github.com/gnshx/monad-hackathon.git
cd monad-hackathon
npm install
npm run demo
```
This runs `scripts/run-demo.ts` on a local EVM node, executing:
- Mandate creation with passkey envelope
- Authorized 0.1 MON token transfer
- Rogue target block (`TargetNotAllowed`)
- Over-limit spend block (`ExceedsPerTxLimit`)
- Unauthorized caller block (`CallerNotAuthorized`)
- Owner mandate revocation & fund recovery
- Standalone receipt verification via `@agenttrust/sdk`

### 5. How can I connect to Monad Testnet?
- Open the live console at **[https://1e9e766e0acd5a.lhr.life](https://1e9e766e0acd5a.lhr.life)**.
- Connect MetaMask or Rabby. The app will prompt to switch to **Monad Testnet (Chain ID 10143, RPC: `https://testnet-rpc.monad.xyz`)**.
- The app checks contract bytecode (`client.getBytecode`) on Monad Testnet before permitting live transactions.

### 6. What is real versus simulated?
| Component | Reality Status |
| :--- | :--- |
| **P-256 Precompile (`0x0100`)** | **PROVEN REAL ON MONAD TESTNET.** Tested with 160-byte input; returns 32-byte `1` for valid signatures and empty bytes for invalid input. |
| **Receipt Inspector** | **REAL.** Starts in unverified state; queries live Monad Testnet RPC (`Chain ID: 10143`); validates bytecode deployment; verifies logs. |
| **WebAuthn Passkey Signing** | **REAL.** Fails closed on device prompt dismissal or errors; extracts actual SPKI DER P-256 public keys. |
| **Smart Contract Logic** | **PROVEN REAL.** 29/29 Foundry tests pass including 1,000-run fuzz tests. |
| **Attack Lab Scenarios** | **EXPLAINABLE SIMULATION.** Exercises local contract invariants in the browser; labeled `Execution Mode: Local Preflight` — nothing is broadcast and no transaction receipts are fabricated. |
| **Monad Testnet Deployment** | **DOCUMENTED LIMITATION.** Due to lack of a funded testnet wallet during hackathon build, contracts are not claimed as deployed on testnet. The UI cleanly detects 0-byte bytecode and discloses this limitation. |

### 7. Where can I verify deployment / transactions?
- **Precompile Verification:** Tested directly against `https://testnet-rpc.monad.xyz` at `0x0000000000000000000000000000000000000100`.
- **Local Confirmed Hash:** Action executed on local node at `0x50823d6cdb9ce7124050b5d7e6d8525ea43a07f0367b316855c21b28de7be681`.
- **Receipt Auditor Tool:** Integrated in the live console under the **Trust & Receipt Explorer** tab.

### 8. What limitations and future work remain?
- **Funded Testnet Deployment:** Deployment script (`script/Deploy.s.sol`) is tested and ready to broadcast once funded testnet keys are loaded.
- **ERC-7579 Modular Account Support:** Expanding from standalone mandate vault contracts to pluggable execution validators for ERC-4337 smart accounts.
- **Batch Atomic Multi-Calls:** Slated for v2.1 to allow agents to execute multi-step DeFi routes under a single mandate transaction.

---

## ⚡ 1-Minute Reproducible Security Proof

```text
================================================================
       🛡️  AGENTTRUST LIVE DEMO — ON-CHAIN SECURITY PROOF  🛡️    
================================================================
⚡ [MODE: LOCAL ANVIL SANDBOX (Chain 31337) / MONAD TESTNET (Chain 10143)]
   ✓ Fresh MandateManager initialized: 0x7bc06c482dead17c0e297afbc32f6e63d3846650
   ✓ Fresh MockTarget initialized:     0x7969c5ed335650692bc04293b07f5bf2e7a673c0

🟢 [SCENARIO 1] Agent Executes Allowed Action within Policy         --> ✅ EXECUTED (0.1 MON)
🔴 [SCENARIO 2] Adversarial Attack: Rogue Target Call (Prompt Injection) --> 🛑 BLOCKED (TargetNotAllowed)
🔴 [SCENARIO 3] Adversarial Attack: Over-Limit Spend Attempt         --> 🛑 BLOCKED (ExceedsPerTxLimit)
🔴 [SCENARIO 4] Adversarial Attack: Unauthorized Caller Hijack       --> 🛑 BLOCKED (CallerNotAuthorized)
🟡 [SCENARIO 5] Human Owner Revokes Mandate & Recovers Vault Funds   --> ✅ 100% RECOVERED (MandateIsRevoked)
🔍 [SCENARIO 6] Independent Auditor Verifies On-Chain Receipt Logs    --> ✅ VERIFIED (Raw Event Log Proof)
================================================================
 🎉  ALL 6 DEMO SCENARIOS PASSED WITH LIVE ON-CHAIN CONSENSUS!  🎉 
================================================================
```

---

## 🏗️ System Architecture

```
                                  ┌──────────────────────────┐
                                  │       Human Owner        │
                                  │ (FaceID / TouchID P-256) │
                                  └─────────────┬────────────┘
                                                │ 1. WebAuthn Hardware Assertion
                                                ▼
                                  ┌──────────────────────────┐
                                  │  AgentTrust Web Console  │
                                  │  (Next.js 15 Dark UI)    │
                                  └─────────────┬────────────┘
                                                │ 2. Submit Mandate Envelope
                                                ▼
                 ┌─────────────────────────────────────────────────────────────┐
                 │                       Monad Blockchain                      │
                 │                                                             │
                 │  ┌────────────────────────┐     ┌────────────────────────┐  │
                 │  │   MandateManager.sol   │◄────┤  RIP-7212 Precompile   │  │
                 │  │ (Allowlists, Vaults)   │     │ (P-256 Native @ 0x100) │  │
                 │  └───────────┬────────────┘     └────────────────────────┘  │
                 │              │                                              │
                 │              │ 3. Execute allowed call                      │
                 │              ▼                                              │
                 │  ┌────────────────────────┐     ┌────────────────────────┐  │
                 │  │  Allowed Target (DEX)  │     │  ActionExecuted Event  │  │
                 │  └────────────────────────┘     └───────────┬────────────┘  │
                 └─────────────────────────────────────────────┼───────────────┘
                                                               │ 4. Verify Log
                                                               ▼
                                                   ┌───────────────────────┐
                                                   │   @agenttrust/sdk     │
                                                   │  (Receipt Auditor)    │
                                                   └───────────────────────┘
```

---

## 🧪 Testing & Quality Assurance

```bash
# 1. Foundry Contract Test Suite (29 tests + 1,000-run fuzz tests)
cd contracts && ~/.foundry/bin/forge test -vvv

# 2. TypeScript SDK Unit & WebAuthn Integration Tests (17 tests)
npm --prefix packages/sdk run test

# 3. Next.js Web Production Build
npm run build:web
```

---

## 📦 Monorepo Structure

```text
monad-hackathon/
├── contracts/                  # Foundry Smart Contracts
│   ├── src/
│   │   ├── MandateManager.sol      # Core contract enforcing mandates & vaults
│   │   ├── MockTarget.sol          # Target contract for testing DeFi swaps
│   │   └── interfaces/             # IP256Verifier, IERC8004Registry
│   └── test/
│       └── MandateManager.t.sol    # 29 unit & fuzz tests
│
├── packages/
│   └── sdk/                    # Zero-Backend TypeScript SDK (@agenttrust/sdk)
│       ├── src/
│       │   ├── client.ts           # AgentTrustClient
│       │   ├── mandate.ts          # createMandate, revokeMandate, hashing
│       │   ├── verify.ts           # Standalone verifyReceipt implementation
│       │   └── abi.ts              # Contract ABIs
│       └── test/                   # Vitest unit tests
│
├── apps/
│   ├── web/                    # Next.js 15 Web3 Security Console
│   │   ├── src/app/page.tsx        # Console dashboard with testnet isolation
│   │   ├── src/components/         # Stepped Modal, Compiler, Attack Lab, Inspector
│   │   └── src/lib/webauthn.ts     # Fail-closed WebAuthn P-256 implementation
│   └── demo-agent/             # Autonomous AI Agent demo
│
└── docs/                       # Hackathon artifacts, threat model & scripts
```

---

## 📄 License
This project is licensed under the [MIT License](LICENSE). Built for the Monad Hackathon.
