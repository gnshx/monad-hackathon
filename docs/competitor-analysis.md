# AgentTrust — Competitive Landscape & Positioning Analysis

## Executive Summary
Autonomous AI agents are shifting from passive advisory chat interfaces to active economic actors capable of executing on-chain transactions. However, granting an AI agent unrestricted access to a private key creates existential risk: prompt injections, model hallucinations, logic bugs, or rogue external calls can immediately drain an entire treasury.

AgentTrust positions itself in the emerging **delegated authority and policy-governed agent execution** category, sitting alongside modular account standards, programmable session keys, and agentic wallet frameworks.

---

## Comparative Matrix

| Solution | Architecture | Signing Authority | Policy Enforcement | Receipt Verification | Primary Focus |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **AgentTrust (This Project)** | Monad Native Contract + Isolated Vaults | **Hardware Passkey (WebAuthn / P-256 via RIP-7212)** | **Smart Contract (`MandateManager.sol`)** | **Portable Zero-Backend SDK (`@agenttrust/sdk`)** | Passkey-delegated authority, strict target/selector allowlists, hardware-bounded budgets, independent auditor |
| **MetaMask Agentic Security Guidance** | Security framework & architecture recommendations | Cloud Signer / TEE / Injected Key | Client-side simulation & account policies | Standard Explorer Receipt | Architectural best-practices for safe agent execution (per-tx caps, rolling allowances) |
| **Namera (`thenamespace/namera`)** | Programmable smart wallets | Session Keys / Key Delegation | Smart contract session rules | Internal ledger & subgraphs | Programmable multi-agent smart account orchestration |
| **SmartAgentKit (`smartagentkit`)** | Policy-governed agent wallet toolkit | Agent EOA or Smart Contract | Contract-enforced policy modules | Standard RPC receipts | Developer toolkit for building policy-restricted agentic accounts |
| **Rhinestone (`module-sdk`)** | ERC-7579 Modular Smart Account Modules | Session Keys / Validators | Modular execution validators | Bundler / UserOp receipts | General-purpose modular account abstraction standard |

---

## Key Differentiators for AgentTrust

1. **Hardware Passkey Roots of Trust (WebAuthn / RIP-7212):**
   Unlike session keys stored in hot browser memory or server-side environment variables, AgentTrust mandates are anchored directly to human hardware biometrics (TouchID, FaceID, YubiKey) using native SECP256R1 (P-256) signatures verified on-chain via Monad's precompile at `0x0100`.

2. **Isolated Per-Mandate Vault Accounting:**
   Funds allocated to an agent are segregated into isolated per-mandate balances on-chain. Even if an agent's logic is fully compromised, it cannot touch funds from other mandates or the owner's master wallet.

3. **Zero-Backend Independent Receipt Verifier:**
   The `@agenttrust/sdk` contains a standalone receipt auditor that runs in any browser, CLI, or microservice without requiring backend infrastructure. Anyone can take a transaction hash and cryptographically verify that it complied with the authorized mandate.

4. **Monad Execution Alignment:**
   Designed specifically to capitalize on Monad's high-throughput 10,000 TPS, 1-second finality, and native RIP-7212 precompile (`0x0100`), enabling sub-second policy enforcement at negligible gas overhead.
