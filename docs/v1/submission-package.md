# 🏆 AgentTrust — Metropolis Hackathon Official Submission Package

> **Track:** Trust, Identity & AI Infrastructure  
> **Prepared For:** Devpost / Hackathon Submission Portal & Judging Committee  
> **GitHub:** [https://github.com/gnshx/monad-hackathon](https://github.com/gnshx/monad-hackathon)  
> **Single Source of Truth Dossier:** [`docs/judges.md`](judges.md)

---

## 📌 1. Submission Overview & Metadata

- **Project Name:** AgentTrust
- **Short Tagline:** Cryptographic Trust & Hardware Passkey Delegation Boundary for Autonomous AI Agents on Monad
- **Hackathon Track:** Trust, Identity & AI Infrastructure
- **Team Members:** AgentTrust Team
- **Project Repository:** `https://github.com/gnshx/monad-hackathon`
- **License:** MIT License (Open Source)
- **Primary Tech Stack:** Solidity 0.8.24, Foundry, Monad RIP-7212 Precompile (`0x0100`), ERC-8004 Registry (`0x8004A818...`), TypeScript SDK (Viem), Next.js 15, Tailwind CSS

---

## ⚡ 2. Elevator Pitch (200 Words)

Autonomous AI agents are shifting from informational chat assistants to active economic actors executing swaps, yield rebalancing, and compute payments. However, **giving an AI agent an unrestricted private key creates catastrophic economic risk**: prompt injections, hallucinations, or leaked server credentials can instantly drain an entire treasury.

**AgentTrust is the cryptographic trust and delegation boundary for autonomous AI on Monad.** Instead of handing agents raw private keys, human owners authorize scoped mandates with a single biometric tap of their device hardware passkey (TouchID, FaceID, YubiKey).

The smart contract on Monad—not the model, SDK, or off-chain backend—is the strict enforcement boundary:
- **Allowlisted Targets & Method Selectors:** Agents cannot touch unapproved contracts or functions.
- **Runtime Spending Ceilings:** Strict per-action and cumulative native MON spending caps.
- **Isolated Vault Accounting:** Prevents cross-mandate fund contamination.
- **Caller Guard (CRIT-01):** Prevents third-party caller hijacking.
- **Instant Revocation:** Owners can revoke execution authority and withdraw unspent funds with one tap.

Monad’s native RIP-7212 P-256 precompile (`0x0100`) executes hardware passkey verification at 6,900 gas (~50x cheaper than EVM bytecode verifiers), making high-frequency agent delegation economically viable.

---

## 📝 3. Full Project Submission Text (Markdown for Hackathon Portal)

### 💡 Inspiration
As we observed autonomous agents evolve from static prompts to programmatic actors interacting with DeFi protocols on Monad, we noticed an existential vulnerability: **every current agent framework gives the LLM full, unrestricted custody of a hot private key.** A single prompt injection or memory dump means total financial ruin.

We realized the blockchain—specifically Monad with its sub-second consensus and native RIP-7212 precompile—must be the immutable boundary between human intent and autonomous execution.

---

### 🛡️ What It Does
AgentTrust provides an end-to-end delegation and security infrastructure for autonomous AI agents on Monad:

1. **Hardware Passkey Delegation:** Humans authorize agent spending rules using WebAuthn passkeys (TouchID, FaceID) via standard SECP256R1 signatures.
2. **Smart Contract Policy Enforcement (`MandateManager.sol`):**
   - **Target Allowlisting:** Restricts agent calls strictly to approved contract addresses.
   - **4-Byte Selector Specificity:** Prevents agents from calling unauthorized functions on approved contracts.
   - **Native MON Spending Caps:** Strict per-transaction and cumulative limits on `msg.value`.
   - **Isolated Vault Accounting:** Prevents balance theft between agents or mandates.
   - **Caller Guard (CRIT-01):** Enforces that only the authorized agent EOA can trigger execution.
   - **Instant Revocation:** Owners can lock mandates and withdraw unspent funds immediately.
3. **Native Monad Composability:**
   - **RIP-7212 Precompile (`0x0100`):** Verifies P-256 signatures on-chain at 6,900 gas per Monad documentation (~50x cheaper than Solidity).
   - **ERC-8004 Agent Identity Registry (`0x8004A818...`):** Binds execution mandates directly to verified on-chain agent identities.
4. **Zero-Backend Independent Receipt Verifier:** Counterparties and auditors can verify any transaction receipt directly against Monad RPC with a single command (`npm run verify:tx <txHash>`) without trusting our servers.
5. **Interactive Console & Attack Lab:** A modern dark-mode console featuring an in-browser precompile verifier, live ERC-8004 inspector, policy linter, and simulated adversarial attack scenarios.

---

### ⚙️ How We Built It
- **Smart Contracts:** Built in Solidity 0.8.24 using Foundry. Tested with 72 comprehensive unit, fuzz (1,000 runs), reentrancy, and vault isolation tests across contracts.
- **TypeScript SDK (`@agenttrust/sdk`):** A TypeScript client library built on viem and @noble/curves (in the repo, not on npm) providing `createAgentGuard()`, `AgentMandates` client, preflight invariant checks, and tiered receipt decoding. Tested with 34 Vitest tests.
- **Frontend Console:** Built with Next.js 15 (App Router), Tailwind CSS, Lucide icons, and Wagmi/Viem.
- **Verification Scripts:** CLI tools verifying real Monad Testnet precompile vectors (`verify:p256`), live ERC-8004 identity queries (`verify:erc8004`), and transaction receipt auditing (`verify:tx`, `verify:all`).

---

### 🛑 Challenges We Ran Into & Radical Honesty
1. **WebAuthn P-256 Signature Normalization:** Secp256r1 signatures generated by device authenticators can have high-S values. We implemented strict low-S malleability guards (`s <= n/2`) to prevent signature replay attacks on-chain.
2. **Transparent Security Boundaries:** We practice radical honesty regarding what is enforced on-chain today versus roadmap:
   - **Today:** Native MON `msg.value` spending caps, designated ERC-20 vault token allowances, target allowlists, selector gating, caller verification, isolated vault accounting, and WebAuthn User Presence and Verification (`flags & 0x05`) are strictly enforced on-chain.
   - **Roadmap (v2.0):** Arbitrary multi-hop protocol calldata parameter inspection.

---

### 🏆 Accomplishments We're Proud Of
- **100% Cryptographic Proof on Monad Testnet:** Proven live on Monad Testnet that RIP-7212 precompile at `0x0100` returns `uint256(1)` on our valid 160-byte vector and fails closed on corrupted input.
- **Live ERC-8004 Composability:** Successfully integrated with Monad Testnet's ERC-8004 Agent Registry (`0x8004A818...`), validating designated wallets and rejecting impostors.
- **Zero Key Leaks & Rigorous Testing:** 72/72 Foundry tests and 34/34 SDK tests passing (142 total tests across all suites). Clean git history with zero committed private keys.
- **1-Command Independent Verifier:** `npm run verify:tx <txHash>` and `npm run verify:all` let judges audit any transaction on Monad without trusting off-chain APIs.

---

### 🚀 What We Learned & What's Next (Startup Wedge)
AgentTrust is built to become a standalone venture in the Monad ecosystem:
- **Commercial Wedge:** Developers deploying transaction-capable agents on Monad with ERC-8004 identities and x402 payment streams.
- **Monetization:** Open-core primitive + hosted gasless passkey relayer + enterprise treasury compliance dashboard ($499/mo) + counterparty audit API.
- **Next Steps:** Formal verification with Certora, Monad Mainnet genesis deployment, and design partnerships with native Monad DeFi protocols.

---

### 📍 Live Monad Testnet Deployments (Chain ID: 10143)
- **MandateManager:** [`0x3550f9fc84640a9cfd7c51330615a1e05cb948be`](https://testnet.monadexplorer.com/address/0x3550f9fc84640a9cfd7c51330615a1e05cb948be)
- **MockTarget Router:** [`0x0758fdc78e20f748fa89e2d53f84748697cb177f`](https://testnet.monadexplorer.com/address/0x0758fdc78e20f748fa89e2d53f84748697cb177f)
- **ERC-8004 Registry:** [`0x8004A818BFB912233c491871b3d84c89A494BD9e`](https://testnet.monadexplorer.com/address/0x8004A818BFB912233c491871b3d84c89A494BD9e)
- **Native RIP-7212 Precompile:** `0x0000000000000000000000000000000000000100`

### ⛓️ Mined On-Chain Transaction Proofs (Every Scenario Executed on Monad Testnet)
| Scenario | On-Chain Action | Status / Block | Mined Transaction Hash | Monad Explorer Link |
| :--- | :--- | :--- | :--- | :--- |
| **Setup** | WebAuthn Credential Registration | Confirmed | `0x3eafdec02f64a2fb...` | [View Tx](https://testnet.monadexplorer.com/tx/0x3eafdec02f64a2fb78e0ae3fef6f7ba4eea5da0cb142e58041d100605a5d21d2) |
| **Mandate Creation** | P-256 WebAuthn Envelope Authorization | Block #70689675 | `0xd9e9a355baa9d16c...` | [View Tx](https://testnet.monadexplorer.com/tx/0xd9e9a355baa9d16c37c3411349a9437c6c09c9dcf2ffc0940cf049c7c8182e32) |
| **Scenario 1** | Allowed Agent Action (0.02 MON spend) | Block #70689680 | `0xdf928824bddee386...` | [View Tx](https://testnet.monadexplorer.com/tx/0xdf928824bddee386bac134559d4148ac88fa5d79fdf9dcb710d8bcd2947e7e77) |
| **Scenario 2** | Rogue Target Call Attempt | Block #70689692 (Reverted) | `0x83df0f92e5135024...` | [View Tx](https://testnet.monadexplorer.com/tx/0x83df0f92e51350248df49713c9a19c6a9b2b2d0e7eb40dca6dd8155318228c7a) |
| **Scenario 3** | Over-Limit Spend (0.1 > 0.05 MON cap) | Block #70689698 (Reverted) | `0x959dbe12d49225b1...` | [View Tx](https://testnet.monadexplorer.com/tx/0x959dbe12d49225b19d1fea8344077f849b89a3dc5a1d7b38b9aa24ba3a0cc0bd) |
| **Scenario 4** | Stranger Caller Hijack Attempt | Block #70689703 (Reverted) | `0xc9ca8bfa073880c6...` | [View Tx](https://testnet.monadexplorer.com/tx/0xc9ca8bfa073880c6818d0b43ac023ef490a56b31a7a95e5fcc3653fe909cd691) |
| **Scenario 5** | Human Owner Instant Revocation | Block #70689710 | `0x5b082de833511df8...` | [View Tx](https://testnet.monadexplorer.com/tx/0x5b082de833511df83bd84d7351dcca5aff57eaf43a30aa2f5200a80d952e33ff) |
| **Recovery** | Unspent Vault Balance Reclaim | Block #70689714 | `0x56d206d2ae776e4a...` | [View Tx](https://testnet.monadexplorer.com/tx/0x56d206d2ae776e4aad9997059c87caeeefa44de887f1eea0c094d45f1a572f84) |
| **Scenario 6** | Standalone SDK Receipt Audit | 100% Cryptographic Proof | Verified via CLI & SDK | `npm run verify:tx <txHash>` |

---

## 🧪 4. Commands for Judges to Reproduce

Judges can reproduce all claims in 60 seconds from any terminal:

```bash
# 1. Clone & install
git clone https://github.com/gnshx/monad-hackathon.git
cd monad-hackathon
npm install

# 2. Verify Monad Testnet Native P-256 Precompile (0x0100)
npm run verify:p256

# 3. Verify Monad Testnet ERC-8004 Agent Identity Registry
npm run verify:erc8004

# 4. Audit all 7 on-chain mined transactions across all scenarios in 5s
npm run verify:all

# 5. Audit any specific transaction hash independently on Monad Testnet
npm run verify:tx 0xdf928824bddee386bac134559d4148ac88fa5d79fdf9dcb710d8bcd2947e7e77

# 6. Run full testnet deployment & 6-scenario execution suite
npm run deploy:testnet

# 7. Run Smart Contract & SDK Test Suites
npm run test:sdk
forge test --root contracts
```

---

## 📽️ 5. Video Submission Guidelines

- **Demo Video (3 Minutes):** Follow [`docs/storyboard-and-outreach.md`](storyboard-and-outreach.md#part-2-3-minute-technical-demo-video-storyboard).
- **Pitch Video (2 Minutes):** Follow [`docs/storyboard-and-outreach.md`](storyboard-and-outreach.md#part-3-2-minute-founder-pitch-video-storyboard).
