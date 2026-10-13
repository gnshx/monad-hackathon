# 🛡️ AgentTrust — Hardware Passkey Mandates for AI Agents

<p align="center">
  <img src="./docs/assets/agenttrust_logo.jpg" alt="AgentTrust Architecture Logo" width="220" style="border-radius: 20px; box-shadow: 0 12px 40px rgba(89, 68, 219, 0.25);" />
</p>

<p align="center">
  <strong>Passkey-Authorized Hardware Delegation · Monad Native RIP-7212 P-256 Precompile · Isolated Vault Accounting · Cryptographic Execution Receipts</strong>
</p>

<p align="center">
  <a href="https://6bfd9aa4a2a198.lhr.life"><img src="https://img.shields.io/badge/Live_Console-6bfd9aa4a2a198.lhr.life-5944db?style=for-the-badge&logo=monad&logoColor=white" alt="Live Console" /></a>
  <a href="https://github.com/gnshx/monad-hackathon"><img src="https://img.shields.io/badge/GitHub-Repository-181717?style=for-the-badge&logo=github&logoColor=white" alt="GitHub Repo" /></a>
  <img src="https://img.shields.io/badge/Monad_Testnet-Chain_10143-836ef9?style=for-the-badge&logo=ethereum&logoColor=white" alt="Monad Network" />
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Contracts-29%2F29_Passed_(1k_Fuzz)-success?style=flat-square&logo=solidity" alt="Foundry Tests" />
  <img src="https://img.shields.io/badge/SDK-21%2F21_Passed_(Vitest)-success?style=flat-square&logo=typescript" alt="SDK Tests" />
  <img src="https://img.shields.io/badge/Precompile-RIP--7212_@_0x100-emerald?style=flat-square" alt="RIP-7212" />
  <img src="https://img.shields.io/badge/Next.js-15.5.27_Turbopack-black?style=flat-square&logo=next.js" alt="Next.js" />
  <img src="https://img.shields.io/badge/License-MIT-blue?style=flat-square" alt="License" />
</p>

<p align="center">
  <a href="https://6bfd9aa4a2a198.lhr.life">🌐 Live Web Console</a> •
  <a href="#-reproducible-judge-evaluation-guide">📋 Judge Evaluation Guide</a> •
  <a href="#-3-minute-developer--sdk-quickstart">⚡ 3-Min SDK Quickstart</a> •
  <a href="docs/claim-vs-evidence.md">📊 Claim vs. Evidence Matrix</a> •
  <a href="docs/acceptance-checklist.md">✅ 10/10 Acceptance Checklist</a> •
  <a href="docs/demo-script.md">🎬 90-Sec Video Script</a> •
  <a href="docs/threat-model.md">🛡️ Threat Model</a>
</p>

> 💡 **Judge Note on Live Deployment:** The public console is tunneled at **[https://6bfd9aa4a2a198.lhr.life](https://6bfd9aa4a2a198.lhr.life)**. If external tunnels are restricted by corporate firewall rules, the production console runs locally in seconds via `npm run build:web && npm run start:web` at `http://localhost:3000`.

---

## 📋 Reproducible Judge Evaluation Guide

### 1. What problem is solved?
Autonomous AI agents are increasingly tasked with transacting on-chain (DEX swaps, yield rebalancing, micro-payments). Giving an agent an unconstrained private key creates existential risk: prompt injection, model hallucinations, logic bugs, or leaked credentials can instantly drain an entire treasury. **AgentTrust replaces unconstrained key access with hardware passkey-delegated, bounded mandates enforced on-chain by Monad.**

### 2. Who needs it?
- **AI Agent Developers & Frameworks** (Eliza, LangChain, CrewAI, AutoGPT) that need safe execution authority without custody liabilities.
- **DeFi Users & Protocol Treasuries** delegating routine transactions to autonomous agents while guaranteeing hard spending limits.
- **Auditors & Counterparties** who need independent cryptographic receipts to verify agent compliance without trusting off-chain assertions.

### 3. What is the security model?
1. **Human Root of Trust:** The owner authorizes a mandate using their device hardware passkey (TouchID, FaceID, YubiKey) generating a standard SECP256R1 (P-256) signature envelope.
2. **On-Chain Enforcement:** `MandateManager.sol` validates the passkey signature natively via Monad's RIP-7212 precompile (`0x0100`).
3. **Hard Boundaries:** Calls are gated by allowlisted target contracts, 4-byte function selectors, per-transaction spending caps, cumulative budgets, and expiration windows.
4. **Caller Guard (CRIT-01):** Only the explicitly designated agent wallet (`msg.sender == mandate.agentAddress`) can trigger execution.
5. **Instant Revocation:** The human owner retains instant on-chain revocation power at any time, locking the mandate and enabling unspent vault recovery.
6. **Spending Cap Boundary:** The spending cap (`maxValuePerTx`) specifically restricts native MON passed as `msg.value` via `target.call{value: value}(callData)`. It does not parse arbitrary calldata parameters (e.g. ERC-20 token amounts). Presets explicitly declare this as "maximum native MON per call."

### 4. How can I run the local demo?
```bash
git clone https://github.com/gnshx/monad-hackathon.git
cd monad-hackathon
npm install
npm run demo
```
This runs `scripts/run-demo.ts` on a local Anvil EVM node (Chain ID 31337), executing:
- Mandate creation with passkey envelope
- Authorized 0.1 MON payable router call
- Rogue target block (`TargetNotAllowed`)
- Over-limit spend block (`ExceedsPerTxLimit`)
- Unauthorized caller block (`CallerNotAuthorized`)
- Owner mandate revocation & fund recovery
- Standalone fail-closed receipt verification via `@agenttrust/sdk`

### 5. How can I connect to Monad Testnet?
- Open the live console at **[https://6bfd9aa4a2a198.lhr.life](https://6bfd9aa4a2a198.lhr.life)**.
- Connect MetaMask or Rabby. The app prompts to switch to **Monad Testnet (Chain ID 10143, RPC: `https://testnet-rpc.monad.xyz`)**.
- The app checks contract bytecode (`client.getBytecode`) on Monad Testnet before permitting live transactions.

### 6. What is real versus simulated?
| Component | Reality Status |
| :--- | :--- |
| **P-256 Precompile (`0x0100`)** | **PRECOMPILE AVAILABILITY QUERIED ON TESTNET · LOCAL TESTS PROVEN.** Address `0x0100` on `https://testnet-rpc.monad.xyz` queried via `eth_call` confirms active precompile handler (returns non-reverting empty data for malformed inputs per Monad RIP-7212 documentation). Full valid signature verification is proven in **29 local Foundry tests (`MandateManager.t.sol`)** and **SDK unit tests**, not yet executed on Monad testnet due to testnet faucet limits. |
| **Receipt Inspector** | **REAL & FAIL-CLOSED.** Queries live Monad Testnet RPC (`Chain ID: 10143`); validates bytecode deployment; verifies log topics, selector match, and value caps. Distinguishes event decoding from full policy compliance. Flags untrusted custom contracts. |
| **WebAuthn Passkey Signing** | **REAL.** Enforces User Presence bit (`flags & 0x01`); fails closed on device prompt dismissal or errors; extracts SPKI DER P-256 public keys. |
| **Smart Contract Logic** | **PROVEN REAL.** 29/29 Foundry tests pass including 1,000-run fuzz tests. |
| **Attack Lab Scenarios** | **EXPLAINABLE SIMULATION.** Exercises local contract invariants in the browser; labeled `Execution Mode: Local Preflight` — nothing is broadcast and no transaction receipts are fabricated. |
| **Monad Testnet Deployment** | **NOT DEPLOYED ON TESTNET (LOCAL ANVIL 31337 IS PROVEN BASELINE).** AgentTrust contracts have not been deployed to Monad Testnet; no deployment transaction hash is claimed. The live web application explicitly checks bytecode, discovers 0 bytes on Monad Testnet (Chain ID 10143), and gracefully discloses this boundary while directing users to the reproducible Local Anvil EVM environment (Chain ID 31337). |

### 7. Where can I verify deployment / transactions?
- **P-256 Precompile Availability:** Queried via RPC against Monad Testnet at `0x0000000000000000000000000000000000000100`, confirming non-reverting handler for malformed input per RIP-7212 spec.
- **Local On-Chain Enforcement (Chain 31337):** Complete 6-scenario execution lifecycle runs against local Anvil with real on-chain transaction hash `0xb7cf85e1b4ec983fd3ad8cea904e8bc132236f18948e79121f7212f3095ddadd` (reproducible via `npm run demo`).
- **Monad Testnet Contracts (Chain 10143):** Explicitly unconfigured / not deployed. No false testnet deployment transaction is claimed.
- **Receipt Auditor Tool:** Integrated in the live console under the **Receipts** tab with fail-closed checks against Monad Testnet or any specified EVM RPC.

---

## ⚡ 3-Minute Developer & SDK Quickstart

AgentTrust provides a zero-backend TypeScript SDK (`@agenttrust/sdk`) so autonomous agents and monitoring services can create mandates and verify receipts independently.

### 1. Verify an Execution Receipt in 5 Lines of Code

```typescript
import { verifyReceipt } from '@agenttrust/sdk';

const result = await verifyReceipt(publicClient, contractAddress, txHash, {
  expectedChainId: 31337,
  expectedSelector: '0x50824e4f', // MockTarget.doSomething
  expectedMaxValue: 200000000000000000n, // 0.2 MON
});

console.log(result.status); // 'success' | 'reverted' | 'not_found' | 'wrong_network'
console.log(result.verified); // true
console.log(result.value); // 100000000000000000n (0.1 MON)
```

### 2. Run Local Security Enforcement Demo

```bash
# Clone and run local end-to-end demo
git clone https://github.com/gnshx/monad-hackathon.git
cd monad-hackathon
npm install
npm run demo
```

Expected terminal output:
```text
================================================================
       🛡️  AGENTTRUST LIVE DEMO — ON-CHAIN SECURITY PROOF  🛡️    
================================================================
⚡ [MODE: LOCAL ANVIL SANDBOX (Chain 31337)]
   ✓ Fresh MandateManager initialized: 0x7bc06c482dead17c0e297afbc32f6e63d3846650
   ✓ Fresh MockTarget initialized:     0x7969c5ed335650692bc04293b07f5bf2e7a673c0

🟢 [SCENARIO 1] Agent Executes Allowed Action within Policy         --> ✅ EXECUTED (0.1 MON)
🔴 [SCENARIO 2] Adversarial Attack: Rogue Target Call (Prompt Injection) --> 🛑 BLOCKED (TargetNotAllowed)
🔴 [SCENARIO 3] Adversarial Attack: Over-Limit Spend Attempt         --> 🛑 BLOCKED (ExceedsPerTxLimit)
🔴 [SCENARIO 4] Adversarial Attack: Unauthorized Caller Hijack       --> 🛑 BLOCKED (CallerNotAuthorized)
🟡 [SCENARIO 5] Human Owner Revokes Mandate & Recovers Vault Funds   --> ✅ 100% RECOVERED (MandateIsRevoked)
🔍 [SCENARIO 6] Independent Auditor Verifies On-Chain Receipt Logs    --> ✅ VERIFIED (Raw Event Log Proof)
================================================================
 🎉  ALL 6 DEMO SCENARIOS PASSED WITH LOCAL ANVIL CONSENSUS!  🎉 
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
                                  │ (Next.js 15 Warm Editorial)│
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
                 │  │ Allowed Target Router  │     │  ActionExecuted Event  │  │
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

# 2. TypeScript SDK Unit & Receipt Verification Tests (21 tests)
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
│   │   ├── MockTarget.sol          # Target contract for testing DeFi router calls
│   │   └── interfaces/             # IP256Verifier, IERC8004Registry
│   └── test/
│       └── MandateManager.t.sol    # 29 unit & fuzz tests
│
├── packages/
│   └── sdk/                    # Zero-Backend TypeScript SDK (@agenttrust/sdk)
│       ├── src/
│       │   ├── client.ts           # AgentTrustClient
│       │   ├── mandate.ts          # createMandate, revokeMandate, hashing
│       │   ├── verify.ts           # Fail-closed verifyReceipt implementation
│       │   └── abi.ts              # Contract ABIs
│       └── test/                   # 21 Vitest unit & regression tests
│
├── apps/
│   ├── web/                    # Next.js 15 Web3 Security Console
│   │   ├── src/app/page.tsx        # Console dashboard with testnet isolation
│   │   ├── src/components/         # Policy-to-Proof, Attack Lab, Receipts
│   │   └── src/lib/webauthn.ts     # Fail-closed WebAuthn P-256 implementation
│   └── demo-agent/             # Autonomous AI Agent demo
│
└── docs/                       # Hackathon artifacts, threat model & scripts
```

---

## 📄 License
This project is licensed under the [MIT License](LICENSE). Built for the Monad Hackathon.
