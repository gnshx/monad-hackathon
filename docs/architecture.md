# AgentTrust — System Architecture & Trust Layer on Monad

## Executive Summary

**AgentTrust** is a decentralized, privacy-preserving trust and data ownership protocol built natively for the AI-native internet on **Monad**. It enables users to grant cryptographic **mandates** to autonomous AI agents via biometric Passkeys (WebAuthn / P-256). These mandates are enforced directly by smart contracts deployed on Monad Testnet, ensuring that:
1. An AI agent can perform **only explicitly permitted actions** (whitelisted target contracts, allowed function selectors, and strictly enforced per-action and cumulative spending caps).
2. Any unauthorized or malicious action is rejected and **reverted at the Monad EVM level**, not by client-side filters or centralized servers.
3. Any third-party application or developer can **independently verify** execution receipts and mandate provenance without trusting AgentTrust servers.

---

## High-Level System Architecture

```mermaid
graph TD
    User([User with Biometric Passkey]) -->|WebAuthn P-256 Signature| Web[Member C: AgentTrust Dashboard]
    Web -->|Create Mandate| Contract[Member A: MandateManager.sol on Monad]
    
    subgraph Monad Network Layer
        Contract -->|RIP-7212 Precompile 0x100| P256Precompile[Native P256 Precompile (~3,450 gas)]
        Contract <-->|Query Agent Identity| Registry[ERC-8004 Agent Registry]
    end

    subgraph Autonomous AI Execution
        AI[Member B: Autonomous AI Agent] -->|Propose Action| SDK[Member B: @agenttrust/sdk]
        SDK -->|executeAction| Contract
        Contract -->|Enforce Target, Selector, Caps, Nonce| MonadState[(Monad Testnet State)]
    end

    subgraph Independent Third-Party Verifier
        Integrator[Independent App / Integrator] -->|Zero-Trust Query| SDK
        SDK -->|Direct Monad RPC Read| MonadState
        SDK -->|Verify Invariants| Integrator
    end
```

---

## Core Primitives

### 1. Native P256 Precompile (RIP-7212 / `0x100`)
Traditional EVM chains do not support the secp256r1 curve used by modern Passkeys (Apple TouchID, Windows Hello, Android Biometrics). Emulating secp256r1 in Solidity costs upwards of 300,000 gas.
Monad integrates the **native P256 precompile** at address `0x0000000000000000000000000000000000000100`:
- **Gas cost:** ~3,450 gas (100x efficiency boost).
- **Format:** 160 bytes: `[32B hash][32B r][32B s][32B x][32B y]`.
- **Result:** Native WebAuthn passkey verification directly on-chain without trusted relayers.

### 2. ERC-8004 Trustless Agent Registry
Autonomous agents are registered as first-class on-chain entities with:
- Unique `agentId` (uint256)
- Model architecture card and prompt hash
- Autonomous execution key
- Reputation score and verifiable execution record

### 3. Smart Contract Enforced Mandates (`IMandateManager.sol`)
Every mandate defines:
- `allowedTargets`: Contract address whitelist (e.g. Monad DEX Router, Staking Pools).
- `allowedSelectors`: 4-byte selector whitelist (e.g. `swapExactTokens`, `deposit`).
- `maxValuePerAction`: Upper limit on native token expenditure per transaction.
- `maxTotalValue`: Cumulative lifetime spending cap.
- `expiresAt`: Hard UNIX timestamp deadline.
- `nonce`: Monotonically increasing counter for replay protection.
- `isRevoked`: Boolean switch instantly triggerable by passkey biometric.

---

## Zero-Trust Verification Flow

No centralized AgentTrust backend exists in the verification path. To verify any transaction:
1. Integrator queries Monad public RPC for the mandate ID.
2. Integrator inspects the action receipt:
   $$\text{actionHash} = \text{keccak256}(\text{abi.encode}(\text{mandateId}, \text{target}, \text{value}, \text{data}, \text{nonce}))$$
3. Integrator confirms that the Monad EVM transaction emitted `ActionExecuted`.
4. If the contract reverted with `TargetNotAllowed` or `ValueExceedsActionLimit`, the failure is cryptographically documented on-chain.
