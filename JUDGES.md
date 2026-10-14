# Judge Evaluation Guide · AgentTrust

> **Quick Link for Evaluators:** Open the live console at **[https://monad-hackathon-amber.vercel.app/#judge](https://monad-hackathon-amber.vercel.app/#judge)** to test real on-chain Monad transactions in 60 seconds with **zero wallet, zero gas, and zero setup**.

---

## ⚡ 60-Second Evaluation Path (Zero Setup Required)

Judges do not need to install MetaMask, request testnet faucet tokens, or configure private keys. The relayer is pre-funded with **4.71 MON** on Monad Testnet (Chain ID `10143`).

1. Open **[https://monad-hackathon-amber.vercel.app/#judge](https://monad-hackathon-amber.vercel.app/#judge)**.
2. Click **"Run the live sequence"**.
3. Watch the 6-step lifecycle execute live against Monad Testnet:
   - **Step 1: Mandate Creation** — A fresh P-256 passkey signs a WebAuthn mandate; Monad's native RIP-7212 precompile (`0x0100`) verifies it on-chain (`SUCCESS`).
   - **Step 2: Allowed Call** — The registered ERC-8004 agent executes a call within its limits (`SUCCESS`).
   - **Step 3: Overspend Attack** — The agent attempts 10x its per-call cap; Monad EVM physically reverts with `ExceedsPerCallLimit` (`REVERTED`).
   - **Step 4: Rogue Target Attack** — The agent attempts to call an unapproved contract; Monad EVM reverts with `PermissionDenied` (`REVERTED`).
   - **Step 5: Owner 1-Tap Revocation** — The passkey issues an on-chain revocation (`SUCCESS`).
   - **Step 6: Post-Revoke Attack** — The agent retries the call; Monad EVM reverts with `MandateInactive` (`REVERTED`).
4. Click any **"Open in explorer"** link to verify the mined block and status on [testnet.monadexplorer.com](https://testnet.monadexplorer.com).

---

## 🧭 Live Verified On-Chain Deployments (Monad Testnet · Chain 10143)

| Contract / Primitive | Address on Monad Testnet | Verification & Details |
| :--- | :--- | :--- |
| **AgentMandates (Primary)** | [`0xc911e902bf3b3f532bffc1a988e2d00969a1237c`](https://testnet.monadexplorer.com/address/0xc911e902bf3b3f532bffc1a988e2d00969a1237c) | 26,274 hex characters bytecode confirmed. |
| **ERC-8004 Agent Registry** | [`0x8004A818BFB912233c491871b3d84c89A494BD9e`](https://testnet.monadexplorer.com/address/0x8004A818BFB912233c491871b3d84c89A494BD9e) | Agent #2304 registered to relayer. |
| **RIP-7212 Precompile** | `0x0000000000000000000000000000000000000100` | Native Monad SECP256R1 precompile (~6,900 gas). |
| **MockTarget Router** | [`0xd856e20dbf9280299739efdc0082e431fa644e73`](https://testnet.monadexplorer.com/address/0xd856e20dbf9280299739efdc0082e431fa644e73) | Whitelisted call target (`doSomething(uint256)`). |
| **Test USDC Stablecoin** | [`0x540564511d46e74c0ed48a6d63de8c79e61a860a`](https://testnet.monadexplorer.com/address/0x540564511d46e74c0ed48a6d63de8c79e61a860a) | Faucet-enabled mock ERC-20 vault token. |
| **Relayer Wallet** | [`0x5B71688146B44e9eEcCbca1847F43D9420909B0B`](https://testnet.monadexplorer.com/address/0x5B71688146B44e9eEcCbca1847F43D9420909B0B) | Pre-funded with **4.71 MON**. |

---

## 🎯 Scoring Against the Track Criteria

### 1. Technical Execution (20%)
- **Correct Use of Monad RIP-7212 Precompile:** Invokes `0x0100` directly for secp256r1 signature checks, reducing verification from ~350,000 gas in bytecode to ~6,900 gas.
- **ERC-8004 Dynamic Identity Binding:** Validates on every execution that the caller is the registered wallet or owner of the agent's ERC-8004 NFT. Rotating the agent identity cuts off spending authority instantly.
- **Cryptographic Rigor:** Strict low-S signature normalization ($s \le n/2$) prevents ECDSA malleability. Challenge digests are domain-separated using EIP-712-aligned hashing.
- **Zero Key Leaks:** Clean Git history verified; `.env` and secrets are strictly excluded and never committed.
- **200 / 200 Tests Passing:** 76 Foundry tests, 57 SDK tests, 38 Web/Judge tests, 20 MCP tests, 9 Auditor tests.

### 2. Design & Craft (20%)
- **Zero-Wallet Biometric UX:** Humans approve spending authority using Touch ID, Face ID, or Windows Hello. No seed phrases, no private keys on disk, no testnet faucet required.
- **Model Context Protocol (MCP) Server:** Anthropic-standard stdio server (`packages/mcp`) exposing `mandate_status`, `check_action`, `execute_action`, and `pay_token` to Claude Desktop, Cursor, and ElizaOS.
- **TypeScript SDK (`packages/sdk`):** Type-safe client library with native BigInt serialization and dry-run preflight checks.

### 3. Originality & Track Insight (15%)
- **Protocol Primitive, Not a Product:** A trustless infrastructure layer that other applications build on.
- **Non-Capturable:** Root identity lives on the user's hardware device; agent identity lives in open ERC-8004 records; execution rules live in immutable smart contracts. There is no proprietary SaaS, token, or platform lock-in.

### 4. Founder & Market Readiness (25%)
- Detailed adoption analysis in [`docs/adoption.md`](docs/adoption.md) for 5 distinct developer classes: MCP agent builders, multi-agent frameworks (ElizaOS, LangChain), pay-per-call APIs, ERC-8004 explorers, and embedded-wallet apps.

### 5. Traction & Path Forward (20%)
- 8 live mined testnet scenarios documented in [`deployments.mandates.json`](deployments.mandates.json).
- Clear, actionable 12-week post-hackathon roadmap in [`docs/adoption.md`](docs/adoption.md): npm package publishing with provenance, ElizaOS and LangChain plugins, rolling budgets, and external smart contract audits.

---

## 💻 Local Audit & Reproduction (From Source)

```bash
# 1. Clone repository
git clone https://github.com/gnshx/monad-hackathon.git
cd monad-hackathon

# 2. Install dependencies & build packages
npm install
npm run build:sdk
npm run build:mcp

# 3. Run full test matrix (200 / 200 Passing)
npm run test:contracts   # 76 Solidity tests with 1,000-run fuzzing
npm run test:sdk         # 57 TypeScript SDK tests
npm run test:judge       # 38 Web Console & Judge Mode tests
npm run test:mcp         # 20 Anthropic MCP Server tests
npm run test:auditor     # 9 Testnet receipt auditor tests

# 4. Run local E2E simulation with P-256 precompile (zero keys required)
npm run e2e
```
