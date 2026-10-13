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

### D. Verify Any Monad Testnet Receipt via 1-Command CLI
```bash
npm run verify:tx 0xdf928824bddee386bac134559d4148ac88fa5d79fdf9dcb710d8bcd2947e7e77
```
**Expected Output:** Confirms allowed execution in Block #70689680, verifies 0.02 MON spend limit compliance, extracts ActionExecuted log, and links to Monad Explorer.

---

## 🔒 2. Live Monad Testnet Deployed Contracts & Execution Proofs

### 📍 Live Testnet Contracts (Chain ID: 10143)
- **MandateManager:** [`0x3550f9fc84640a9cfd7c51330615a1e05cb948be`](https://testnet.monadexplorer.com/address/0x3550f9fc84640a9cfd7c51330615a1e05cb948be)
- **MockTarget Router:** [`0x0758fdc78e20f748fa89e2d53f84748697cb177f`](https://testnet.monadexplorer.com/address/0x0758fdc78e20f748fa89e2d53f84748697cb177f)
- **ERC-8004 Registry:** [`0x8004A818BFB912233c491871b3d84c89A494BD9e`](https://testnet.monadexplorer.com/address/0x8004A818BFB912233c491871b3d84c89A494BD9e)
- **Native RIP-7212 Precompile:** `0x0000000000000000000000000000000000000100`

### ⛓️ Mined On-Chain Transaction Proofs (Chain ID 10143)
| Scenario | On-Chain Action | Status / Block | Mined Transaction Hash | Monad Explorer Link |
| :-: | :--- | :--- | :--- | :--- |
| **Setup** | WebAuthn Credential Registration | Confirmed | `0x3eafdec02f64a2fb78e0ae3fef6f7ba4eea5da0cb142e58041d100605a5d21d2` | [View Tx](https://testnet.monadexplorer.com/tx/0x3eafdec02f64a2fb78e0ae3fef6f7ba4eea5da0cb142e58041d100605a5d21d2) |
| **Mandate Creation** | P-256 WebAuthn Envelope Authorization | Block #70689675 | `0xd9e9a355baa9d16c37c3411349a9437c6c09c9dcf2ffc0940cf049c7c8182e32` | [View Tx](https://testnet.monadexplorer.com/tx/0xd9e9a355baa9d16c37c3411349a9437c6c09c9dcf2ffc0940cf049c7c8182e32) |
| **Scenario 1** | Allowed Agent Action (0.02 MON spend) | Block #70689680 | `0xdf928824bddee386bac134559d4148ac88fa5d79fdf9dcb710d8bcd2947e7e77` | [View Tx](https://testnet.monadexplorer.com/tx/0xdf928824bddee386bac134559d4148ac88fa5d79fdf9dcb710d8bcd2947e7e77) |
| **Scenario 2** | Rogue Target Call Attempt | Block #70689692 (Reverted) | `0x83df0f92e51350248df49713c9a19c6a9b2b2d0e7eb40dca6dd8155318228c7a` | [View Tx](https://testnet.monadexplorer.com/tx/0x83df0f92e51350248df49713c9a19c6a9b2b2d0e7eb40dca6dd8155318228c7a) |
| **Scenario 3** | Over-Limit Spend (0.1 > 0.05 MON cap) | Block #70689698 (Reverted) | `0x959dbe12d49225b19d1fea8344077f849b89a3dc5a1d7b38b9aa24ba3a0cc0bd` | [View Tx](https://testnet.monadexplorer.com/tx/0x959dbe12d49225b19d1fea8344077f849b89a3dc5a1d7b38b9aa24ba3a0cc0bd) |
| **Scenario 4** | Stranger Caller Hijack Attempt | Block #70689703 (Reverted) | `0xc9ca8bfa073880c6818d0b43ac023ef490a56b31a7a95e5fcc3653fe909cd691` | [View Tx](https://testnet.monadexplorer.com/tx/0xc9ca8bfa073880c6818d0b43ac023ef490a56b31a7a95e5fcc3653fe909cd691) |
| **Scenario 5** | Human Owner Instant Revocation | Block #70689710 | `0x5b082de833511df83bd84d7351dcca5aff57eaf43a30aa2f5200a80d952e33ff` | [View Tx](https://testnet.monadexplorer.com/tx/0x5b082de833511df83bd84d7351dcca5aff57eaf43a30aa2f5200a80d952e33ff) |
| **Recovery** | Unspent Vault Balance Reclaim | Block #70689714 | `0x56d206d2ae776e4aad9997059c87caeeefa44de887f1eea0c094d45f1a572f84` | [View Tx](https://testnet.monadexplorer.com/tx/0x56d206d2ae776e4aad9997059c87caeeefa44de887f1eea0c094d45f1a572f84) |
| **Scenario 6** | Standalone SDK Receipt Audit | 100% Cryptographic Proof | Verified via CLI & SDK | `npm run verify:tx <txHash>` |

---

## 👨‍⚖️ 3. Judge Access Instructions (Testing Without Testnet MON)

To make evaluation frictionless for judges, **judges do not need to hold testnet MON or connect funded personal wallets**:

1. **Interactive In-Browser Evidence Testing:**
   - Open the web console at **[https://f12634005c5362.lhr.life](https://f12634005c5362.lhr.life)** (or locally at `http://localhost:3000`).
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
