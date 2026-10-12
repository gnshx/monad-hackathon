# AgentTrust — Passkey-Authorized, On-Chain Permissions for AI Agents

<p align="center">
  <img src="./docs/assets/agenttrust_logo.jpg" alt="AgentTrust Logo" width="220" style="border-radius: 20px; box-shadow: 0 8px 32px rgba(131, 110, 249, 0.4);" />
</p>

<p align="center">
  <strong>Passkey-Authorized Mandates · Monad Native P256 Precompile (RIP-7212) · ERC-8004 Trustless Agent Registry · Zero-Backend Portable Verification</strong>
</p>

<p align="center">
  <a href="./docs/pitch.md">2-Min Pitch Video Script</a> •
  <a href="./docs/demo-script.md">3-Min Demo Video Script</a> •
  <a href="./docs/integration-guide.md">Integrator Guide</a> •
  <a href="docs/final-audit.md">30-Hour Security Audit Report</a> •
  <a href="#quickstart">Quickstart</a>
</p>

> **One-sentence pitch:** AgentTrust binds autonomous AI agents to hardware passkeys, enforcing granular smart contract permissions, target allowlists, and spending limits directly on Monad so rogue agents are blocked by blockchain consensus.

> **Track:** Trust, Identity & AI Infrastructure (Metropolis Track)  
> **Target Network:** Monad Blockchain (Chain ID: `10143`)  
> **Security Audit:** Complete 30-Hour Final Audit Report available at [`docs/final-audit.md`](docs/final-audit.md)

---

## 1. Overview & Core Security Guarantee

Prompt injection, model hallucinations, and compromised agent memory make client-side guardrails unreliable. AgentTrust solves this by establishing **the smart contract as the authoritative enforcement boundary**:

1. **Hardware Passkey Delegation:** A user authorizes an AI agent by signing a canonical mandate challenge using a device **WebAuthn Passkey (P-256)**.
2. **On-Chain Policy Enforcement:** The `MandateManager` contract verifies the WebAuthn assertion / P-256 signature, binds the designated agent wallet address, and records strict target allowlists, selector rules, per-action caps, cumulative budget limits, and expiry.
3. **Deterministic Blocking:** When an agent attempts an unauthorized action (e.g., rogue target contract, unapproved selector, spending exceeding limit, or caller identity mismatch), **the transaction reverts on Monad**.
4. **Isolated Vault Accounting:** Native funds are locked in per-mandate balances (`mandateBalances`), preventing cross-mandate balance theft.
5. **Instant Revocation:** Owners can revoke mandates on-chain with immediate effect and withdraw unspent funds (`withdrawUnspent`).
6. **Independent Receipt Verification:** Any external protocol or auditor can independently verify an agent's execution receipts directly against raw Monad logs via the `@agenttrust/sdk` without trusting the web dashboard.

---

## 2. Architecture

```
                          ┌──────────────────────────┐
                          │       Human Owner        │
                          │ (Passkey / WebAuthn P256) │
                          └─────────────┬────────────┘
                                        │ WebAuthn Assertion Envelope
                                        ▼
                          ┌──────────────────────────┐
                          │    AgentTrust Web App    │
                          │   (Next.js 15 Dashboard) │
                          └─────────────┬────────────┘
                                        │ createMandate / createMandateWithWebAuthn
                                        ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                              MONAD BLOCKCHAIN                               │
│                                                                             │
│  ┌────────────────────────┐                   ┌──────────────────────────┐  │
│  │  RIP-7212 Precompile   │                   │  ERC-8004 Registry       │  │
│  │ (P-256 at address 0x100)│                   │  (Agent Identity & Op)   │  │
│  └───────────▲────────────┘                   └────────────▲─────────────┘  │
│              │ Raw 160-byte staticcall                     │ Owner / Operator│
│  ┌───────────┴─────────────────────────────────────────────┴─────────────┐  │
│  │                          MandateManager                               │  │
│  │  - Nonce & Replay Check       - Vault Isolation (mandateBalances)     │  │
│  │  - Target/Selector Allowlist   - Per-Tx & Cumulative Spending Caps    │  │
│  │  - Caller Address Auth        - Instant Owner Revoke & Withdraw       │  │
│  └───────────────────────────────────┬───────────────────────────────────┘  │
│                                      │ Atomic Execution / Revert            │
│                                      ▼                                      │
│                         ┌──────────────────────────┐                        │
│                         │ Target Protocol/Contract │                        │
│                         └──────────────────────────┘                        │
└──────────────────────────────────────▲──────────────────────────────────────┘
                                       │
                      Execute Action   │ Independent Audit Receipt
                                       │
                        ┌──────────────┴──────────────┐
                        │    AI Agent / Verifier      │
                        │    (@agenttrust/sdk)        │
                        └─────────────────────────────┘
```

---

## 3. Monorepo Structure

```
agenttrust/
├── contracts/               # Smart contracts (Solidity 0.8.24 & Foundry)
│   ├── src/
│   │   ├── MandateManager.sol   # Core permissions, vault isolation, & execution engine
│   │   ├── IP256Verifier.sol    # RIP-7212 P256 precompile interface
│   │   ├── IERC8004Registry.sol # ERC-8004 identity registry interface
│   │   └── lib/ReentrancyGuard.sol
│   ├── test/
│   │   ├── MandateManager.t.sol # 29 tests (fuzz, limits, replay, vault, WebAuthn)
│   │   ├── MockP256Verifier.sol
│   │   ├── MockERC8004Registry.sol
│   │   └── MockTarget.sol
│   ├── script/Deploy.s.sol      # Monad testnet deployment script
│   └── foundry.toml             # Foundry configuration with via_ir
│
├── packages/
│   └── sdk/                 # TypeScript SDK (@agenttrust/sdk)
│       ├── src/
│       │   ├── client.ts    # AgentTrustClient
│       │   ├── mandate.ts   # Canonical v2 hashing, creation, deposit, withdraw
│       │   ├── execute.ts   # On-chain execution wrapper
│       │   ├── verify.ts    # Independent receipt and preflight verification
│       │   ├── abi.ts       # Typed contract ABI v2
│       │   ├── types.ts     # TypeScript interfaces
│       │   └── errors.ts    # Typed error hierarchy
│       └── test/sdk.test.ts # 13 unit tests with vitest (anti-tamper, receipts)
│
├── apps/
│   ├── web/                 # Next.js 15 passkey dashboard & activity inspector
│   │   ├── src/app/         # Dashboard UI & design system
│   │   └── src/lib/         # WebAuthn passkey registration & signing
│   │
│   └── demo-agent/          # Autonomous AI agent simulation & verifier client
│       ├── src/index.ts     # Agent attempting allowed vs blocked actions
│       └── src/verifier-client.ts # Third-party receipt verification client
│
├── docs/
│   └── final-audit.md       # Comprehensive 30-hour security audit report
└── package.json             # Monorepo workspaces
```

---

## 4. Key Security Invariants & Guarantees

| Invariant | Enforcement Mechanism | Status |
|---|---|---|
| **Caller Authentication** | `msg.sender == m.agentAddress \|\| msg.sender == m.owner` | **Enforced** |
| **Vault Balance Isolation** | Isolated `mandateBalances[mandateId]` mapping; cannot spend other vaults | **Enforced** |
| **Replay Protection** | Sequential owner creation nonces + per-mandate execution nonces | **Enforced** |
| **Target & Selector Allowlist** | Strict `(target, selector)` allowlist check + calldata prefix validation | **Enforced** |
| **Spending Limits** | Atomic enforcement of `maxValuePerTx` and cumulative `maxTotalValue` | **Enforced** |
| **Call Failure Rollback** | External call revert rolls back decremented balances & spending counters | **Enforced** |
| **Reentrancy Immunity** | Checks-effects-interactions + `nonReentrant` on `execute` and `withdraw` | **Enforced** |
| **Cryptographic Bounds** | Enforces $s \le n/2$, non-zero coordinates, and field order checks | **Enforced** |
| **WebAuthn Envelope** | Validates base64url challenge in `clientDataJSON` and User Presence | **Enforced** |

---

## 5. Verified Test Results

All tests are verified and reproducible:

```
[PASS] testFuzz_spendingCap(uint256) (runs: 1000, μ: 387466, ~: 387488)
[PASS] testFuzz_totalCapExceeded() (gas: 862411)
[PASS] test_createMandateWithWebAuthn_happy() (gas: 360595)
[PASS] test_createMandateWithWebAuthn_missingUserPresence_reverts() (gas: 104187)
[PASS] test_createMandateWithWebAuthn_wrongChallenge_reverts() (gas: 121811)
[PASS] test_createMandate_badNonce_reverts() (gas: 75231)
[PASS] test_createMandate_erc8004_mismatch_reverts() (gas: 81994)
[PASS] test_createMandate_happy() (gas: 378237)
[PASS] test_createMandate_invalidAgentAddress_reverts() (gas: 71075)
[PASS] test_createMandate_invalidSig_reverts() (gas: 92060)
[PASS] test_createMandate_malleableSig_reverts() (gas: 87655)
[PASS] test_createMandate_zeroSig_reverts() (gas: 127997)
[PASS] test_execute_exceedsPerTxLimit_reverts() (gas: 386823)
[PASS] test_execute_expired_reverts() (gas: 394430)
[PASS] test_execute_happy() (gas: 450598)
[PASS] test_execute_replayNonce_reverts() (gas: 486272)
[PASS] test_execute_revoked_reverts() (gas: 420214)
[PASS] test_execute_unauthorizedCaller_stranger_reverts() (gas: 375410)
[PASS] test_execute_unauthorizedSelector_reverts() (gas: 384372)
[PASS] test_execute_unauthorizedTarget_reverts() (gas: 384704)
[PASS] test_execute_wrongAgentId_reverts() (gas: 377320)
[PASS] test_registerCredential() (gas: 12988)
[PASS] test_registerCredential_fieldOverflow_reverts() (gas: 33007)
[PASS] test_registerCredential_zeroKey_reverts() (gas: 33290)
[PASS] test_vault_insufficientBalance_reverts() (gas: 393618)
[PASS] test_vault_isolation_preventsCrossMandateTheft() (gas: 800635)
[PASS] test_withdrawUnspent_activeMandate_reverts() (gas: 368530)
[PASS] test_withdrawUnspent_afterRevoke_happy() (gas: 436550)
[PASS] test_withdrawUnspent_nonOwner_reverts() (gas: 412979)

Ran 29 tests for test/MandateManager.t.sol:MandateManagerTest: 29 passed, 0 failed.
Ran 13 tests for packages/sdk/test/sdk.test.ts: 13 passed, 0 failed.
```

---

## 6. Quickstart & Developer Guide

### Prerequisites
- Node.js >= 18
- Foundry (`forge` >= 0.2.0)

### 1. Build and Test Smart Contracts
```bash
cd contracts
forge test -vvv
forge build
```

### 2. Build and Test TypeScript SDK
```bash
cd packages/sdk
npm install
npm test
npm run build
```

### 3. Run the Next.js Web Dashboard
```bash
cd apps/web
npm install
npm run dev
# Open http://localhost:3000 in your browser
```

### 4. Run the AI Demo Agent
```bash
cd apps/demo-agent
npm install
npm run build
npm start
```

### 5. Run the Independent Receipt Verifier
```bash
# Verify any transaction hash on Monad testnet:
npm run verify-client 0xYourTransactionHash
```

---

## 7. 3-Minute Demo Script for Judges

1. **Authorize an Agent (0:00 - 0:45):**
   - Open the web dashboard at `http://localhost:3000`.
   - Click **"Create Mandate"**.
   - Set spending cap (`0.1 MON`), total budget (`1.0 MON`), allowlisted target contract, and agent address.
   - Click **"Sign with Passkey & Submit to Monad"**. Touch TouchID/FaceID to create the passkey-authorized mandate.
2. **Execute Permitted Action (0:45 - 1:30):**
   - The AI agent initiates a transaction within its allowlisted target and budget.
   - The contract executes the call atomically, emits `ActionExecuted`, and updates `spentValue`.
3. **Adversarial Attack Blocked (1:30 - 2:15):**
   - Run `npm start` in `apps/demo-agent`.
   - The agent attempts to call an unauthorized contract (`0x6666...`) or exceed its spending cap.
   - Monad contract reverts with `TargetNotAllowed()` or `ExceedsPerTxLimit()`. No funds are lost; state remains unchanged.
4. **Independent Verification & Revocation (2:15 - 3:00):**
   - Paste the execution transaction hash into the **Independent On-Chain Verifier** or run `npm run verify-client <txHash>`.
   - The SDK queries raw Monad logs, verifies event signatures, and confirms authenticity.
   - Click **"Revoke Passkey Mandate"** in the dashboard. Subsequent agent executions immediately revert on-chain.

---

## 8. Monad Network Configuration

- **Chain ID:** `10143` (`0x279f`)
- **RPC URL:** `https://testnet-rpc.monad.xyz`
- **RIP-7212 Precompile Address:** `0x0000000000000000000000000000000000000100`
- **Currency Symbol:** `MON`
- **Explorer:** `https://testnet.monadexplorer.com`

---

## 9. Testnet Deployment Procedure

To deploy to Monad testnet with a funded deployer wallet:

```bash
cd contracts
forge script script/Deploy.s.sol:Deploy \
  --rpc-url https://testnet-rpc.monad.xyz \
  --broadcast
```

Configure your deployed address in `.env`:
```env
NEXT_PUBLIC_MANDATE_MANAGER_ADDRESS=0xYourDeployedAddress
MANDATE_MANAGER_ADDRESS=0xYourDeployedAddress
```
