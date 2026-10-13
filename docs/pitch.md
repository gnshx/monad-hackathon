# 🛡️ AgentTrust — Pitch Deck, Script & Traction Roadmap

**Topic:** Trust and Data Ownership Layer for Autonomous AI on Monad  
**Track:** Metropolis — Trust & Data Ownership  
**Pitch Duration:** 2 Minutes  
**Target Adopters:** ERC-8004 Registries, x402 Payment Agents, MCP Tool Servers, Embedded Wallets  

---

## 📽️ 2-Minute Pitch Video Script (Word Count: ~280 words · 115 seconds)

### [00:00 - 00:25] The Problem: Autonomous AI Breaks Internet Trust Assumptions
"Autonomous AI agents are rapidly becoming economic actors—executing DEX swaps, rebalancing portfolios, and transacting on our behalf.

However, giving an autonomous agent an unconstrained private key creates existential risk: prompt injection, hallucinated transactions, or leaked credentials can instantly drain an entire treasury. Centralized guardrails can be bypassed. Today, users have zero cryptographic guarantees preventing agent theft."

### [00:25 - 00:55] The Solution: AgentTrust on Monad
"Enter **AgentTrust**—the on-chain trust and delegation boundary for autonomous AI on Monad.

Instead of giving AI agents raw keys, users authorize bounded mandates with a single tap of their device hardware passkey (TouchID, FaceID, YubiKey).

AgentTrust translates this into an immutable smart contract mandate on Monad. The contract—not the model, frontend, or backend—is the strict enforcement boundary: allowlisted contracts, exact 4-byte selectors, hard spending caps, and instant human revocation."

### [00:55 - 01:25] Why Monad? (The Architectural Moat)
"Monad provides the decisive technological primitives that make this possible:
1. **Native P-256 Precompile (RIP-7212 at `0x0100`):** We have verified Monad's native precompile live on testnet—executing WebAuthn passkey verification in 6,900 gas per Monad's docs, roughly 50x cheaper than a Solidity verifier.
2. **ERC-8004 Identity Registry (`0x8004A818...`):** We bind mandates directly to Monad's on-chain agent identities, ensuring only designated agent wallets can transact.
3. **Low-Latency Execution:** Enables high-frequency autonomous agent tool calls with instant receipt verification."

### [01:25 - 01:55] Radical Honesty & Traction Roadmap
"We differentiate through radical transparency: our smart contracts strictly enforce native MON spend limits, allowlisted selectors, and vault isolation today with 29 passing Foundry tests and 25 passing SDK tests.

We've published `@agenttrust/sdk` with a 10-line quickstart so any agent framework can integrate in minutes. With our 30/60/90-day plan, AgentTrust is poised to become the standard security perimeter for autonomous finance.

AgentTrust: Sovereign human passkeys. Unbreakable on-chain mandates. Welcome to the trust layer of the agentic internet."

---

## 📊 Pitch Slides Outline & Traction Strategy

### Slide 1: The Autonomous Agent Delegation Paradox
- **Core Dilemma:** Agents need execution authority; humans cannot supervise 24/7.
- **Current Failure Modes:**
  - Raw private keys in memory = instant drain on prompt injection or memory dump.
  - Centralized policy middleware = custodial risk, server outages, single point of failure.
- **The Insight:** Smart contract enforcement is the only boundary an adversarial LLM cannot hallucinate past.

### Slide 2: The AgentTrust Architecture
- **Step 1: Human Passkey Authorization** (SECP256R1 signature with User Presence enforcement).
- **Step 2: On-Chain Mandate Creation** via Monad's RIP-7212 precompile at `0x0100`.
- **Step 3: Fail-Closed Enforcement Engine**:
  - `CallerNotAuthorized` (CRIT-01): Only designated agent EOA can trigger execution.
  - `TargetNotAllowed`: Strictly gates contract address and 4-byte selector.
  - `ExceedsPerTxLimit` & `ExceedsTotalLimit`: Enforces native MON cap.
  - `Vault Isolation`: Prevents cross-mandate balance contamination.
- **Step 4: Zero-Backend Receipt Auditor**: Independent cryptographic verification directly from Monad RPC.

### Slide 3: Technical Execution & Monad Testnet Evidence
| Primitive | Monad Testnet Status | Verified Evidence |
| :--- | :--- | :--- |
| **RIP-7212 Precompile (`0x0100`)** | **PROVEN LIVE ON MONAD TESTNET** | Verified via `cast call 0x0100` (`npm run verify:p256`); returns `0x01` on valid vector, `0x` on invalid. |
| **ERC-8004 Identity Registry** | **PROVEN ON MONAD TESTNET** | Verified at `0x8004A818BFB912233c491871b3d84c89A494BD9e` (`npm run verify:erc8004`). |
| **Smart Contract Suite** | **29/29 PASSING TESTS** | Complete Foundry suite passing with 1,000-run fuzz tests. |
| **TypeScript SDK** | **25/25 PASSING TESTS** | Zero-backend client with preflight, execution, and receipt verification. |

### Slide 4: Named Adopters & Why They Won't "Roll Their Own"
1. **ERC-8004 Agent Identity Registries**:
   - *Why they need us:* Identity without execution boundaries leaves users unprotected. AgentTrust provides the missing spending-policy layer.
2. **x402 Autonomous Payment Agents**:
   - *Why they need us:* Micro-payment streaming agents require deterministic rate-limits and cumulative caps to prevent runaway loops.
3. **MCP (Model Context Protocol) Tool Servers**:
   - *Why they need us:* MCP servers connecting Claude/OpenAI to Web3 need a local SDK to enforce authorization before signing calls.
4. **Embedded Wallet & Smart Account Providers (Privy, Dynamic, Biconomy)**:
   - *Why they won't roll their own:* Implementing RIP-7212 WebAuthn envelope parsing, clientDataJSON challenge extraction, low-S malleability guards, and isolated vault accounting requires dedicated audits. AgentTrust offers an unopinionated, audited SDK.

### Slide 5: The Radical Honesty Differentiator
- **What is enforced on-chain today:**
  - ✅ Native MON `msg.value` spending caps.
  - ✅ Target contract allowlists.
  - ✅ 4-byte method selector specificity.
  - ✅ Caller authorization binding.
  - ✅ Vault accounting & instant revocation.
  - ✅ Device passkey User Presence validation.
- **What is on our public roadmap (Transparent Limitations):**
  - 🔄 ERC-20 ABI-aware parameter decoding (token amount parsing inside calldata).
  - 🔄 Session key delegation with time-decaying allowances.
  - 🔄 Biometric-exclusive `flags & 0x04` validation in WebAuthn envelope v2.

### Slide 6: 30 / 60 / 90-Day Post-Hackathon Plan
- **Day 30 — Mainnet Launch & Early Integrations:**
  - Complete formal verification of `MandateManager.sol`.
  - Deploy to Monad Mainnet at genesis.
  - Publish `@agenttrust/sdk` v1.0.0 to npm.
  - Onboard first 3 partner agent teams from the Monad ecosystem.
- **Day 60 — ERC-20 Calldata Inspection & MCP Adapter:**
  - Ship calldata argument inspection module for ERC-20 `transfer(address,uint256)` and `approve(address,uint256)` token caps.
  - Release official MCP server package (`@agenttrust/mcp-server`) for Claude Desktop and Cursor.
  - Launch developer portal with interactive policy testing playground.
- **Day 90 — Cross-Chain Sync & Institutional Safe{Wallet} Module:**
  - Implement Safe{Wallet} Zodiac module adapter for protocol treasuries.
  - Enable multi-agent collective mandates (threshold approvals across multiple AI models).
  - Complete tier-1 security audit (OpenZeppelin / Trail of Bits).
