# 🛡️ AgentTrust — Hardware Passkey Mandates for AI Agents

<p align="center">
  <img src="./docs/assets/agenttrust_logo.jpg" alt="AgentTrust Architecture Logo" width="220" style="border-radius: 20px; box-shadow: 0 12px 40px rgba(89, 68, 219, 0.25);" />
</p>

<p align="center">
  <strong>Passkey-Authorized Hardware Delegation · Monad Native RIP-7212 P-256 Precompile · Isolated Vault Accounting · Cryptographic Execution Receipts</strong>
</p>

<p align="center">
  <a href="https://90b8bd0cc61493.lhr.life"><img src="https://img.shields.io/badge/Live_Console-90b8bd0cc61493.lhr.life-5944db?style=for-the-badge&logo=monad&logoColor=white" alt="Live Console" /></a>
  <a href="https://github.com/gnshx/monad-hackathon"><img src="https://img.shields.io/badge/GitHub-Repository-181717?style=for-the-badge&logo=github&logoColor=white" alt="GitHub Repo" /></a>
  <img src="https://img.shields.io/badge/Monad_Testnet-Chain_10143-836ef9?style=for-the-badge&logo=ethereum&logoColor=white" alt="Monad Network" />
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Contracts-29%2F29_Passed_(1k_Fuzz)-success?style=flat-square&logo=solidity" alt="Foundry Tests" />
  <img src="https://img.shields.io/badge/SDK-25%2F25_Passed_(Vitest)-success?style=flat-square&logo=typescript" alt="SDK Tests" />
  <img src="https://img.shields.io/badge/Precompile-RIP--7212_@_0x100_PROVEN-emerald?style=flat-square" alt="RIP-7212" />
  <img src="https://img.shields.io/badge/ERC--8004-Identity_Bound-blue?style=flat-square" alt="ERC-8004" />
  <img src="https://img.shields.io/badge/Next.js-15.5.27_Turbopack-black?style=flat-square&logo=next.js" alt="Next.js" />
  <img src="https://img.shields.io/badge/License-MIT-blue?style=flat-square" alt="License" />
</p>

<p align="center">
  <a href="docs/judges.md">👨‍⚖️ Master Judges Dossier</a> •
  <a href="https://90b8bd0cc61493.lhr.life">🌐 Live Web Console</a> •
  <a href="#-reproducible-judge-evaluation-guide">📋 Evaluation Guide</a> •
  <a href="#-15-minute-integrator-quickstart-drop-in-guard-middleware">🔌 SDK Guard Quickstart</a> •
  <a href="docs/claim-vs-evidence.md">📊 Claims vs. Evidence</a> •
  <a href="docs/interview-brief.md">🎙️ Interview Defense</a> •
  <a href="docs/threat-model.md">🛡️ Threat Model</a>
</p>

> 💡 **Judge Note on Live Deployment:** The public console is tunneled at **[https://90b8bd0cc61493.lhr.life](https://90b8bd0cc61493.lhr.life)**. If external tunnels are restricted by corporate firewall rules, the production console runs locally in seconds via `npm run build:web && npm run start:web` at `http://localhost:3000`.

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
- Open the live console at **[https://90b8bd0cc61493.lhr.life](https://90b8bd0cc61493.lhr.life)**.
- Connect MetaMask or Rabby. The app prompts to switch to **Monad Testnet (Chain ID 10143, RPC: `https://testnet-rpc.monad.xyz`)**.
- The app checks contract bytecode (`client.getBytecode`) on Monad Testnet before permitting live transactions.

### 6. What is real versus simulated?
| Component | Reality Status |
| :--- | :--- |
| **P-256 Precompile (`0x0100`)** | **PROVEN OPERATIONAL ON MONAD TESTNET.** Address `0x0100` on `https://testnet-rpc.monad.xyz` queried via `cast call 0x000...0100 <160_bytes_vector>`. A valid Secp256r1 signature vector returns `0x000...0001` (true), while a tampered signature vector returns `0x` (fail-closed). Directly reproducible via `npm run verify:p256`. |
| **ERC-8004 Agent Registry** | **PROVEN ON MONAD TESTNET (`0x8004A818...`).** Address `0x8004A818BFB912233c491871b3d84c89A494BD9e` queried on Monad Testnet. SDK reads `getAgentWallet(agentId)` and `ownerOf(agentId)` to prove that mandate execution permissions cryptographically bind to registered on-chain agent identities. Directly reproducible via `npm run verify:erc8004`. |
| **Receipt Inspector** | **REAL & FAIL-CLOSED.** Queries live Monad Testnet RPC (`Chain ID: 10143`); validates bytecode deployment; verifies log topics, selector match, value caps, and on-chain ERC-8004 identity binding. Flags untrusted custom contracts. |
| **WebAuthn Passkey Signing** | **REAL.** Enforces User Presence bit (`flags & 0x01`); fails closed on device prompt dismissal or errors; extracts SPKI DER P-256 public keys. |
| **Smart Contract Logic** | **PROVEN REAL.** 29/29 Foundry tests pass including 1,000-run fuzz tests. |
| **Attack Lab Scenarios** | **EXPLAINABLE SIMULATION.** Exercises local contract invariants in the browser; labeled `Execution Mode: Local Preflight` — nothing is broadcast and no transaction receipts are fabricated. |
| **Monad Testnet Deployment** | **AWAITING FAUCET GAS FOR DEPLOYMENT TRANSACTION.** Deploy script (`Deploy.s.sol`) dry-run simulated successfully on Chain 10143 (gas requirement: ~0.46 MON). Ready to broadcast immediately upon wallet funding. The reproducible local Anvil EVM environment (Chain ID 31337) remains 100% executable and tested. |

### 7. Where can I verify deployment / transactions?
- **P-256 Precompile Verification:** Run `npm run verify:p256` or `cast call 0x0000000000000000000000000000000000000100 <vector> --rpc-url https://testnet-rpc.monad.xyz` to verify Monad's live precompile.
- **ERC-8004 Identity Registry Binding:** Run `npm run verify:erc8004` to verify on-chain agent identity binding against Monad Testnet registry `0x8004A818BFB912233c491871b3d84c89A494BD9e`.
- **Local On-Chain Enforcement (Chain 31337):** Complete 6-scenario execution lifecycle runs against local Anvil with real on-chain transaction hash `0xb7cf85e1b4ec983fd3ad8cea904e8bc132236f18948e79121f7212f3095ddadd` (reproducible via `npm run demo`).
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

---

## ⚡ Why Monad? (The Architectural Moat)

AgentTrust is purpose-built for Monad because high-frequency autonomous agent security requires primitives that only Monad provides:

1. **Native RIP-7212 P-256 Precompile at `0x0100`:**
   - Standard EVM chains require ~350,000 gas to verify a Secp256r1 WebAuthn signature in Solidity bytecode.
   - Monad's native precompile executes verification in **6,900 gas per Monad's docs, roughly 50x cheaper than a Solidity verifier**, making passkey hardware delegation cheaper than centralized key-management servers or ERC-4337 bundlers.
   - Cryptographically proven live on Monad Testnet: `npm run verify:p256`.

2. **Synchronous Tool-Call Execution & Low Latency:**
   - Autonomous AI agents require immediate policy enforcement between API and on-chain tool executions.
   - Monad enables **synchronous tool-call gating**: an agent's tool execution can be checked and confirmed on-chain with instant cryptographic receipts.

3. **Composable ERC-8004 Agent Identity Ecosystem:**
   - Monad Testnet hosts the canonical ERC-8004 Agent Identity Registry (`0x8004A818BFB912233c491871b3d84c89A494BD9e`).
   - AgentTrust anchors human hardware mandates directly to on-chain agent identities, ensuring only verified agent wallets can trigger delegated actions.

---

## 🔌 15-Minute Integrator Quickstart: Drop-in `guard()` Middleware

External agent builders (LangChain, AutoGPT, Eliza, CrewAI) can guard their tools in under 15 minutes without modifying smart contracts:

```typescript
import { createAgentGuard } from '@agenttrust/sdk';

// 1. Initialize guard with human owner's on-chain mandate
const guard = createAgentGuard({
  contractAddress: '0xa5754E89745eC4eB9d7F31f0C34eB267773531b7',
  mandateId: 0n,
  agentId: 1n,
  publicClient,
  walletClient,
});

// 2. Wrap tool execution — fail-closed on spend caps or rogue targets
const result = await guard.execute({
  target: '0x1234567890123456789012345678901234567890',
  selector: '0xa9059cbb', // transfer(address,uint256)
  callData: '0x...',
  value: parseEther('0.05'),
});

console.log(`✓ Guarded Tx Broadcasted: ${result.transactionHash}`);
console.log(`✓ Receipt Verified: ${result.receipt.verified}`);
```

*See full runnable example in [`examples/integrator-guard-example.ts`](examples/integrator-guard-example.ts) and outreach guide in [`docs/integrator-quickstart.md`](docs/integrator-quickstart.md).*

---

## 🔒 Six-Scenario On-Chain Security Execution Matrix

| # | Scenario | Tested Security Invariant | Result | Verification Command |
| :-: | :--- | :--- | :--- | :--- |
| **1** | **Mandate Creation** | WebAuthn P-256 Passkey Assertion verified via precompile | **SUCCESS** | `npm run verify:p256` |
| **2** | **Allowed Execution** | Designated agent executes 0.1 MON payable router call | **SUCCESS** | `npm run demo` (Scenario 1) |
| **3** | **Rogue Target Call** | Prompt injection: agent attempts call to unallowlisted address | **REVERT** (`TargetNotAllowed`) | `npm run demo` (Scenario 2) |
| **4** | **Over-Limit Spend** | Agent requests spend exceeding per-tx native MON limit | **REVERT** (`ExceedsPerTxLimit`) | `npm run demo` (Scenario 3) |
| **5** | **Stranger Hijack** | Unauthorized stranger EOA attempts to trigger execution | **REVERT** (`CallerNotAuthorized`) | `npm run demo` (Scenario 4) |
| **6** | **Owner Revocation** | Human owner revokes mandate and recovers unspent vault balance | **SUCCESS** (`MandateRevoked`) | `npm run demo` (Scenario 5) |

*Full judge evidence dossier and Monad Explorer reference links: [`docs/evidence.md`](docs/evidence.md).*

---

## 👨‍⚖️ Zero-Gas Judge Access Instructions

Judges **do not need testnet MON or wallet funds** to evaluate AgentTrust:

1. **Interactive In-Browser Evidence Testing (Zero Gas):**
   - Open **[https://90b8bd0cc61493.lhr.life](https://90b8bd0cc61493.lhr.life)**.
   - Navigate to the **"Evidence & Proofs"** tab in the sidebar.
   - Click **"Run Live Precompile Verification Test"** to witness an interactive `eth_call` to Monad Testnet's native precompile (`0x0100`) returning `0x01` in real-time.
   - Query live agent identities on the Monad ERC-8004 Registry (`0x8004A818...`).

2. **Zero-Gas Relayer Mandate Creation:**
   - In production evaluation, judges tap TouchID/FaceID to produce a WebAuthn passkey assertion. The mandate transaction is submitted via our sponsored agent relayer without consuming judge funds.

3. **Receipt Auditor Tool:**
   - Click the **"Receipts"** tab in the console.
   - Paste any Monad testnet or local transaction hash to verify contract bytecode, log topics, and policy compliance directly against the RPC.

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
