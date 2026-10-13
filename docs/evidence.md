# 🛡️ AgentTrust — On-Chain Evidence & Judge Verification Guide

> Complete cryptographic verification dossier, reproducible CLI commands, and testnet transaction index for Metropolis hackathon judges.

---

## 📑 Executive Summary for Hackathon Judges

AgentTrust solves the **Autonomous AI Agent Security Dilemma**: allowing AI models to execute on-chain transactions without handing them unconstrained private keys. 

Instead of trusting off-chain guardrails or AI model behavior, **the smart contract on Monad is the sole enforcement boundary**.

| Metric / Requirement | Status | Verifiable Evidence |
| :--- | :--- | :--- |
| **RIP-7212 P-256 Precompile** | **PROVEN LIVE ON MONAD TESTNET** | Queried `0x000...0100` on Monad Testnet (`10143`). Valid vector returns `0x01`; corrupted vector returns `0x`. Reproducible via `npm run verify:p256`. |
| **ERC-8004 Registry Composability** | **PROVEN LIVE ON MONAD TESTNET** | Composes with canonical registry `0x8004A818BFB912233c491871b3d84c89A494BD9e`. Validates `getAgentWallet(agentId)` on-chain. Reproducible via `npm run verify:erc8004`. |
| **Foundry Contract Tests** | **29/29 PASSING** | 1,000-run fuzz tests, reentrancy guards, vault isolation, caller hijacking defense (`forge test`). |
| **TypeScript SDK Tests** | **25/25 PASSING** | Vitest suite covering preflight verification, receipt auditing, and WebAuthn envelope parsing (`npm run test:sdk`). |
| **Web Console Audit Hub** | **LIVE INTERACTIVE** | Embedded Evidence Hub in console allows 1-click live testing of precompile and registry in-browser. |

---

## ⚡ 1. Reproducible Terminal Verification (1-Line Commands)

Judges can execute any of these commands locally to independently verify live Monad Testnet state in seconds:

### A. Verify Monad Testnet Native RIP-7212 P-256 Precompile (`0x0100`)
```bash
npm run verify:p256
```
Or directly using Foundry's `cast`:
```bash
cast call 0x0000000000000000000000000000000000000100 \
  0xe68364984cfebbf7673e7d1b5709b8a7c65eda22f53a14c0b40db833ce04b178a6c5f02b86876ddb1f7cc4cc764d4f3cd9cf35aaf2ec9cc67b9f914531cff2df535c66e7548b11ed8de14972b0564e7c148fa5b36e0af1b41878921e0169e26a7d03a157224f57960b21928bdad18c914043ea26c7e9acf10bbb341044e09cb339207cf254ffaabc7a78b3c0215cacb471e14870be334e13cb99059dd8da24aa \
  --rpc-url https://testnet-rpc.monad.xyz
```
**Expected Output:** `0x0000000000000000000000000000000000000000000000000000000000000001`

### B. Verify Monad Testnet ERC-8004 Agent Identity Binding
```bash
npm run verify:erc8004
```
**Expected Output:** Confirms Agent #1 is bound to designated wallet `0x133603465aDdE7C39fa0E6E34b264E1573e1FD08`, and correctly rejects impostor addresses.

### C. Run Full 6-Scenario Local On-Chain Security Suite
```bash
npm run demo
```
**Expected Output:** Executes all 6 scenarios on local Anvil EVM (Chain 31337) with real on-chain transaction receipts and fail-closed security blocks.

---

## 🔒 2. Six-Scenario On-Chain Security Execution Matrix

| # | Scenario | Tested Invariant | On-Chain Result | Local Anvil Reference Tx |
| :-: | :--- | :--- | :--- | :--- |
| **1** | **Mandate Creation** | WebAuthn P-256 Passkey Assertion verified via precompile | **SUCCESS** | `0xb7cf85e1b4ec983fd3ad8cea904e8bc132236f18948e79121f7212f3095ddadd` |
| **2** | **Allowed Execution** | Designated agent executes 0.1 MON payable router call | **SUCCESS** | `0x5c79899f81ce5b5b9e59d9c8fa7ce1a5e11d08796859e2175c4eb5e7c8449c25` |
| **3** | **Rogue Target Call** | Prompt injection: agent attempts call to unallowlisted address | **REVERT** (`TargetNotAllowed`) | Transaction reverted; zero funds transferred |
| **4** | **Over-Limit Spend** | Agent requests spend exceeding per-tx native MON limit | **REVERT** (`ExceedsPerTxLimit`) | Transaction reverted; budget untouched |
| **5** | **Stranger Caller Hijack** | Unauthorized stranger EOA attempts to trigger mandate execution | **REVERT** (`CallerNotAuthorized`) | CRIT-01 guard halts execution |
| **6** | **Owner Revocation** | Human owner revokes mandate and recovers unspent vault balance | **SUCCESS** (`MandateRevoked`) | `0x10a8c2fe24de0d674b33535cfba76ecdd96173d12234e40243b8be920958ea3a` |

---

## 👨‍⚖️ 3. Judge Access Instructions (Testing Without Testnet MON)

To make evaluation frictionless for judges, **judges do not need to hold testnet MON or connect funded personal wallets**:

1. **Interactive In-Browser Evidence Testing:**
   - Open the web console at **[https://90b8bd0cc61493.lhr.life](https://90b8bd0cc61493.lhr.life)** (or locally at `http://localhost:3000`).
   - Click the **"Evidence & Proofs"** tab in the sidebar.
   - Click **"Run Live Precompile Verification Test"** to witness an interactive RPC call to Monad Testnet's precompile returning `0x01` in real-time.
   - Query any agent ID on Monad Testnet's live ERC-8004 Identity Registry.

2. **Zero-Gas Passkey Creation (Relayer Architecture):**
   - In production and evaluation mode, passkey-signed authorization payloads are designed to be dispatched via an agent relayer, meaning the human owner only needs their device biometric passkey (TouchID / FaceID) to establish the mandate root-of-trust.

3. **Independent Receipt Auditor:**
   - Click the **"Receipts"** tab in the console.
   - Paste any transaction hash to independently audit event logs, contract bytecode deployment, and policy boundary compliance directly against Monad Testnet RPC.

---

## 🛡️ 4. Radical Honesty & Boundary Disclosure

In accordance with our commitment to engineering integrity:
* **Enforced On-Chain Today:** Native MON `msg.value` spending caps, target contract address allowlisting, 4-byte selector allowlisting, caller authorization (`CallerNotAuthorized`), isolated vault balances, and owner revocation.
* **Passkey Enforcement:** NIST P-256 (SECP256R1) curve validation with User Presence (`flags & 0x01`). Dedicated biometric-exclusive `flags & 0x04` validation is scheduled on our v2.0 roadmap.
* **Calldata Inspection Roadmap:** Spending caps restrict native MON passing through `target.call{value: value}`. Decoding nested ERC-20 token transfer amounts inside calldata is our planned post-hackathon milestone.
