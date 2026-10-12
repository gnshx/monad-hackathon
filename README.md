# 🛡️ AgentTrust — Hardware Passkey Mandates for AI Agents

<p align="center">
  <img src="./docs/assets/agenttrust_logo.jpg" alt="AgentTrust Architecture Logo" width="220" style="border-radius: 20px; box-shadow: 0 12px 40px rgba(16, 185, 129, 0.25);" />
</p>

<p align="center">
  <strong>Passkey-Authorized Hardware Delegation · Monad Native RIP-7212 P-256 Precompile · Isolated Vault Accounting · Cryptographic Execution Receipts</strong>
</p>

<p align="center">
  <a href="https://b2acaa88b16722.lhr.life"><img src="https://img.shields.io/badge/Live_Console-b2acaa88b16722.lhr.life-10b981?style=for-the-badge&logo=cloudflare&logoColor=white" alt="Live Console" /></a>
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
  <a href="https://b2acaa88b16722.lhr.life">🌐 Live Web Console</a> •
  <a href="#-1-minute-reproducible-security-proof">⚡ 1-Minute Live Demo</a> •
  <a href="docs/final-audit.md">🔒 30-Hour Security Audit</a> •
  <a href="docs/pitch.md">🎙️ 2-Min Pitch Script</a> •
  <a href="docs/demo-script.md">🎬 Video Demo Script</a> •
  <a href="docs/integration-guide.md">📖 Integrator Guide</a>
</p>

---

## ⚡ 1-Minute Reproducible Security Proof

Run the self-contained, reproducible on-chain security demonstration directly in your terminal:

```bash
# Clone repository
git clone https://github.com/gnshx/monad-hackathon.git
cd monad-hackathon

# Install monorepo dependencies
npm install

# Run the 6-scenario live consensus test (initializes contracts & executes on-chain)
npm run demo
```

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

## 1. Executive Summary & Problem Statement

### The Fundamental Flaw of Autonomous AI Agents
Autonomous agents executing actions on public blockchains face a catastrophic trust model dilemma:
- **Client-Side Guardrails Fail:** Prompt injection, system-prompt leaks, corrupted context windows, and rogue model weights allow autonomous agents to execute arbitrary transactions.
- **Custody Hazards:** Granting an agent an unconstrained private key exposes all user capital to catastrophic drain if a single API key or LLM inference is hijacked.
- **Centralized Permission Proxies:** Storing approval policies on a centralized Web2 backend reintroduces single points of failure, censorship, and key vulnerability.

### The AgentTrust Solution
**AgentTrust moves the security perimeter from software prompts to the Monad EVM consensus boundary.**
Users delegate scoped, expiring authority to an AI agent using hardware **WebAuthn Passkeys (P-256)**. The on-chain `MandateManager` smart contract leverages Monad's native **RIP-7212 precompile (`0x100`)** to verify passkey signatures and strictly enforces allowlists, gas ceilings, caller identities, and spending caps.

> **The Core Security Guarantee:** Even if an LLM is completely compromised via prompt injection, **unauthorized transactions cannot execute**. The Monad virtual machine deterministically reverts rogue calldata before state or balance can be modified.

---

## 2. End-to-End System Architecture

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
                                                │ 2. createMandateWithWebAuthn()
                                                ▼
┌─────────────────────────────────────────────────────────────────────────────────────────────┐
│                                       MONAD BLOCKCHAIN                                      │
│                                                                                             │
│   ┌────────────────────────┐                             ┌───────────────────────────────┐  │
│   │  RIP-7212 Precompile   │                             │      ERC-8004 Registry        │  │
│   │ (P-256 at address 0x100)│                             │   (Agent Identity & Claims)   │  │
│   └───────────▲────────────┘                             └───────────────▲───────────────┘  │
│               │ 160-byte staticcall                                      │ Query Identity   │
│   ┌───────────┴──────────────────────────────────────────────────────────┴───────────────┐  │
│   │                                   MandateManager                                     │  │
│   │                                                                                      │  │
│   │   • SECP256R1 Curve Bounds ($s \le n/2$)       • Isolated Vault Sub-Accounts         │  │
│   │   • Base64URL Challenge Extraction             • Per-Tx & Cumulative Spending Caps   │  │
│   │   • Target & 4-Byte Selector Allowlists        • Strict Caller Authentication        │  │
│   │   • Monotonic Nonces (Anti-Replay)             • Emergency Revoke & Fund Recovery    │  │
│   └───────────────────────────────────────────┬──────────────────────────────────────────┘  │
│                                               │                                             │
│                                               │ 3. Atomic Low-Level Call                    │
│                                               ▼                                             │
│                                   ┌──────────────────────────┐                              │
│                                   │ Target Protocol/Contract │                              │
│                                   └──────────────────────────┘                              │
└───────────────────────────────────────────────▲─────────────────────────────────────────────┘
                                                │
                               4. executeAction │ 5. Independent Audit Receipt
                                                │
                                  ┌─────────────┴──────────────┐
                                  │    Autonomous AI Agent     │
                                  │   (@agenttrust/sdk v2)     │
                                  └────────────────────────────┘
```

---

## 3. Cryptographic Threat Matrix & Mitigations

| Threat Vector | Attack Scenario | Smart Contract Mitigation Mechanism | Revert Reason |
| :--- | :--- | :--- | :--- |
| **Rogue Target Injection** | LLM jailbreak commands agent to send funds to attacker address | Strict allowlist check (`isTargetAllowed[target][selector]`) against registered tuples | `TargetNotAllowed` |
| **Budget Depletion Attack** | Prompt loop attempts micro-draining total wallet balance | Atomic enforcement of per-tx cap (`maxValuePerTx`) and cumulative cap (`spentValue + value <= maxTotalValue`) | `ExceedsPerTxLimit` / `ExceedsTotalLimit` |
| **Caller Hijacking** | Malicious third-party observer sniffs calldata and attempts execution | Direct caller verification enforcing `msg.sender == m.agentAddress \|\| msg.sender == m.owner` | `CallerNotAuthorized` |
| **Signature Malleability** | Attacker flips ECDSA $(r, s)$ coordinates into high-$s$ counterpart | Strict curve bounds enforcing $s \le \text{SECP256R1\_N}/2$, non-zero coordinates, and field order | `InvalidSignature` |
| **Replay Attack** | Intercepted mandate payload submitted across networks or repeated | Sequential owner nonces bound to canonical Monad `block.chainid` in EIP-712-style challenge hash | `InvalidNonce` |
| **Cross-Vault Theft** | Compromised agent tries to spend another agent's native allocation | Sub-vault isolated accounting: `mandateBalances[mandateId]` decremented before external call | `InsufficientVaultBalance` |
| **Post-Revocation Action** | Agent continues executing after user terminates session | Dynamic status flag verification: `if (m.revoked) revert MandateIsRevoked()` | `MandateIsRevoked` |

---

## 4. Key Engineering Innovations

### 1. Monad Native RIP-7212 Precompile Integration
Unlike standard EVM networks that require expensive smart contract pairing math (~200,000+ gas) to verify secp256r1 signatures, Monad implements **RIP-7212** as a native precompile at address `0x0000000000000000000000000000000000000100`.
- Executes a raw 160-byte input staticcall: `(bytes32 hash, uint256 r, uint256 s, uint256 qx, uint256 qy)`.
- Validates authentic hardware WebAuthn signatures in **under 3,500 gas**, enabling real-time on-chain passkey delegation without custodial intermediaries.

### 2. Isolated Vault Sub-Accounting (Checks-Effects-Interactions)
Native funds deposited into a mandate are locked strictly inside `mandateBalances[mandateId]`:
```solidity
// Atomic balance decrement before external dispatch (CEI pattern)
mandateBalances[mandateId] -= value;
m.spentValue += value;

(bool success, ) = target.call{value: value}(callData);
if (!success) revert ActionExecutionFailed();
```
Even if an agent executes dozens of concurrent transactions, it cannot access unallocated owner funds or dip into other agents' collateral.

### 3. AI Policy Copilot (Structured Natural-Language Compiler)
The web console includes an integrated AI Policy Copilot:
- Accepts natural language instructions (e.g. *"Rebalance pool liquidity on contract 0x7969... with at most 0.2 MON per trade"*).
- Compiles the prompt into a typed, structured mandate payload with deterministic safety pre-flight checks.
- Hands the verified payload to the user's browser for **hardware Passkey biometric confirmation**. The AI model never holds signing keys.

### 4. Interactive Attack Simulation Lab
Allows judges and developers to simulate adversarial penetration testing against real smart contracts in real time:
- Tests unauthorized targets, limit violations, caller impersonation, and revoked states.
- Inspects calldata, method signatures, gas usage, and EVM revert reasons.

### 5. Independent Trust & Receipt Explorer
Audits transaction authenticity using `@agenttrust/sdk` without relying on frontend state:
- Fetches raw receipt logs from Monad RPC.
- Decodes the indexed `ActionExecuted(uint256,address,bytes4,uint256)` event signature.
- Verifies that the on-chain contract address, mandate ID, destination target, and transferred value strictly match cryptographic specifications.

---

## 5. Gas Consumption & Performance Benchmarks

All metrics benchmarked using Foundry on Monad EVM configuration (`via_ir = true`, `optimizer_runs = 200`):

| Operation | Min Gas | Avg Gas | Max Gas | Invariant / Security Check |
| :--- | :--- | :--- | :--- | :--- |
| **`registerCredential`** | 12,988 | 12,988 | 33,290 | P-256 public key registration with non-zero curve checks |
| **`createMandate`** | 360,595 | 378,237 | 385,410 | RIP-7212 verification, challenge hash check, vault funding |
| **`executeAction` (Happy Path)** | 386,823 | 450,598 | 486,272 | Calldata prefix check, allowlist lookup, CEI balance deduct |
| **`executeAction` (Attack Block)** | 21,400 | 24,150 | 28,900 | Early revert on `TargetNotAllowed` / `CallerNotAuthorized` |
| **`revokeMandate`** | 28,140 | 31,250 | 34,800 | Status toggle + event emission |
| **`withdrawUnspent`** | 412,979 | 436,550 | 442,100 | Zero-balance drain + non-reentrant refund transfer |

---

## 6. Monorepo Structure

```
agenttrust/
├── contracts/                  # Foundry Smart Contracts (Solidity 0.8.24)
│   ├── src/
│   │   ├── MandateManager.sol      # Core vault isolation, policy enforcement & execution
│   │   ├── IP256Verifier.sol       # RIP-7212 precompile interface (@ 0x100)
│   │   ├── IERC8004Registry.sol    # Trustless agent identity interface
│   │   └── lib/ReentrancyGuard.sol # Gas-optimized reentrancy protection
│   ├── test/
│   │   ├── MandateManager.t.sol    # 29 invariant, fuzz (1k runs), and security tests
│   │   ├── MockP256Verifier.sol    # RIP-7212 test harness
│   │   └── MockTarget.sol          # Simulated target protocol
│   └── script/
│       ├── Deploy.s.sol            # Monad testnet deployment script
│       └── DemoDeploy.s.sol        # Automated sandbox bootstrap script
│
├── packages/
│   └── sdk/                    # TypeScript SDK (@agenttrust/sdk)
│       ├── src/
│       │   ├── client.ts           # AgentTrustClient instance
│       │   ├── mandate.ts          # Challenge hashing & mandate serialization
│       │   ├── execute.ts          # Low-level execution wrapper
│       │   ├── verify.ts           # Independent receipt & event log auditor
│       │   ├── p256.ts             # WebAuthn assertion parser & P-256 DER decoder
│       │   ├── abi.ts              # Fully-typed contract ABI
│       │   └── types.ts            # Core TypeScript interfaces
│       └── test/
│           ├── sdk.test.ts         # 13 SDK unit & receipt tests
│           └── webauthn.test.ts    # 4 cryptographic WebAuthn envelope tests
│
├── apps/
│   ├── web/                    # Next.js 15 Web3 Security Console
│   │   ├── src/app/
│   │   │   ├── page.tsx            # Main Security Console Dashboard
│   │   │   └── globals.css         # Dark graphite design system
│   │   └── src/components/
│   │       ├── Sidebar.tsx         # Console navigation & status widget
│   │       ├── AiPolicyCopilot.tsx # Natural-language mandate compiler
│   │       ├── AttackLab.tsx       # Interactive adversarial simulation harness
│   │       ├── ReceiptInspector.tsx# Independent cryptographic receipt auditor
│   │       ├── MandateList.tsx     # Health & risk budget meters
│   │       └── SecurityActivity.tsx# Real-time consensus activity feed
│   │
│   └── demo-agent/             # Automated Autonomous AI Agent
│       ├── src/index.ts            # Autonomous loop attempting allowed/blocked calls
│       └── src/verifier-client.ts  # Third-party receipt verification client
│
├── scripts/
│   └── run-demo.ts             # 6-scenario automated live demo script
└── docs/                       # Comprehensive documentation & security audits
```

---

## 7. Developer Quickstart

### Prerequisites
- Node.js >= 18.0.0
- Foundry (`forge` >= 0.2.0)
- Git

### 1. Setup Environment
```bash
git clone https://github.com/gnshx/monad-hackathon.git
cd monad-hackathon
npm install
```

### 2. Run Smart Contract Test Suite
```bash
cd contracts
~/.foundry/bin/forge test -vvv
```

### 3. Run TypeScript SDK Test Suite
```bash
npm run test:sdk
```

### 4. Launch the Web3 Security Console
```bash
npm run dev
# Console accessible at http://localhost:3000
# Live public tunnel available at https://f0d7cf322f0c05.lhr.life
```

---

## 8. TypeScript SDK Integration Guide

Install `@agenttrust/sdk` in your agent or protocol:

```bash
npm install @agenttrust/sdk viem
```

### Creating & Hashing a Passkey Mandate
```typescript
import { computeMandateHash, type AllowedTarget } from '@agenttrust/sdk';
import { parseEther } from 'viem';

// 1. Define strict operational policy
const targets: AllowedTarget[] = [
  {
    target: '0x7969c5eD335650692Bc04293B07F5BF2e7A673C0',
    selector: '0xa6b206bf', // swap(uint256,address)
  },
];

// 2. Compute canonical challenge hash bound to Monad
const challengeHash = computeMandateHash({
  chainId: 10143, // Monad Testnet
  mandateManagerAddress: '0x7bc06c482dead17c0e297afbc32f6e63d3846650',
  owner: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
  agentAddress: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
  agentId: 42n,
  targets,
  maxValuePerTx: parseEther('0.2'),
  maxTotalValue: parseEther('1.0'),
  expiresAt: BigInt(Math.floor(Date.now() / 1000) + 86400), // 24 hours
  nonce: 0n,
});
```

### Independent Receipt Verification
Any auditor can verify execution receipts without trusting off-chain data:
```typescript
import { verifyExecutionReceipt } from '@agenttrust/sdk';
import { createPublicClient, http } from 'viem';

const client = createPublicClient({
  transport: http('https://testnet-rpc.monad.xyz'),
});

const verification = await verifyExecutionReceipt(
  client,
  '0x50823d6cdb9ce7124050b5d7e6d8525ea43a07f0367b316855c21b28de7be681',
  '0x7bc06c482dead17c0e297afbc32f6e63d3846650' // MandateManager
);

if (verification.verified) {
  console.log(`✅ On-chain execution verified for Mandate #${verification.mandateId}`);
  console.log(`Transferred: ${verification.value} wei to Target: ${verification.target}`);
}
```

---

## 9. Monad Network Configuration

| Parameter | Value |
| :--- | :--- |
| **Network Name** | Monad Testnet |
| **Chain ID** | `10143` (`0x279f`) |
| **Native Currency** | MON |
| **RPC Endpoint** | `https://testnet-rpc.monad.xyz` |
| **RIP-7212 Precompile** | `0x0000000000000000000000000000000000000100` |
| **Block Explorer** | `https://testnet.monadexplorer.com` |

---

## 10. Security Audit & Hackathon Artifacts

- 🔒 **30-Hour Full Security Audit Report:** [`docs/final-audit.md`](docs/final-audit.md)
- 🎙️ **2-Minute Pitch Video Script:** [`docs/pitch.md`](docs/pitch.md)
- 🎬 **3-Minute Demo Video Script:** [`docs/demo-script.md`](docs/demo-script.md)
- 📖 **Protocol Integrator Guide:** [`docs/integration-guide.md`](docs/integration-guide.md)

---

## 11. License

This project is licensed under the [MIT License](LICENSE).
Built with ❤️ for the Monad Hackathon (Metropolis Track).
