# AgentTrust — 2-Minute Pitch Video Script

**Topic:** Trust and Data Ownership Layer for Autonomous AI on Monad  
**Track:** Metropolis — Trust & Data Ownership  
**Target Time:** 115 seconds (~270 words)

---

### [00:00 - 00:25] The Problem: Autonomous AI Breaks Internet Trust Assumptions
"Autonomous AI agents are transitioning from conversational chatbots into economic actors that execute trades, rebalance portfolios, and interact with smart contracts on our behalf.

However, the personal context and authorization that makes AI useful today accumulates in centralized platforms that users don't own. Worse, if an agent hallucinates, falls victim to prompt injection, or leaks its API keys, users have zero cryptographic guarantees preventing their entire wallet from being drained."

---

### [00:25 - 00:55] The Solution: AgentTrust Protocol on Monad
"Enter **AgentTrust** — the protocol-level trust and data ownership primitive for the AI-native internet, built natively on Monad.

Instead of giving AI models raw private keys or trusting centralized guardrails, users authorize agents with a single tap of a biometric Passkey. 

AgentTrust translates this into an on-chain **Mandate** enforced by Monad smart contracts. Users define exactly which target contracts the agent can touch, which function selectors it can invoke, strict per-action and cumulative spending caps, and instant revocation rights."

---

### [00:55 - 01:25] Why Monad?
"Monad makes this space tractable in ways impossible on standard EVM chains:
1. **Native P256 Precompile (RIP-7212):** Monad verifies WebAuthn passkey assertions natively in ~3,450 gas — 100 times cheaper than traditional chains.
2. **ERC-8004 Agent Registry:** Agents are registered as first-class, verifiable on-chain entities with reputation and provenance.
3. **High Throughput & Low Latency:** Sub-second finality enables high-frequency autonomous agent loops without lag."

---

### [01:25 - 01:55] Portable Zero-Trust Verification & Market Readiness
"Crucially, AgentTrust guarantees **portable zero-trust verification**: any developer or third-party protocol can verify an agent's mandate and execution receipt directly from Monad RPC using our TypeScript SDK, without trusting our backend.

We aren't building a walled garden. We're building the trust rails that any agent framework — from LangChain to AutoGPT — will adopt to safely handle real user capital. 

AgentTrust: Sovereign user passkeys. Unbreakable on-chain mandates. Welcome to the trust layer of the AI-native internet."
