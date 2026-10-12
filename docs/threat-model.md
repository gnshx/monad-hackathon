# AgentTrust — Security Threat Model & Invariant Guarantees

## Threat Model Overview

In an AI-native internet, autonomous AI models (running locally, via LLM APIs, or on decentralized compute networks) are susceptible to prompt injection, hallucination, compromised model weights, or rogue sub-agents. 

AgentTrust assumes that **the AI agent is completely untrusted**. The security perimeter is shifted entirely to the on-chain smart contract on Monad.

---

## Adversarial Scenarios & Mitigations

### 1. Adversary Attempts to Drain User Funds (Rugpull / Prompt Injection)
* **Attack:** A prompt injection attack convinces the agent to call `drainVault()` or transfer funds to a malicious attacker address (`0xDead...bEEf`).
* **Mitigation:**
  - `MandateManager.sol` enforces the `allowedTargets` whitelist.
  - If `target` is not whitelisted, the transaction immediately reverts with `TargetNotAllowed(target)`.
  - Even if the target was whitelisted, `allowedSelectors` enforces function calldata parity, and `maxValuePerAction` / `maxTotalValue` enforces monetary caps.
* **Result:** **REVERTED on Monad EVM. Attacker receives 0 funds.**

### 2. Compromised AI Agent Private Key
* **Attack:** An attacker gains access to the agent's autonomous execution key (`agentKey`).
* **Mitigation:**
  - The agent key only has authorization within the constraints of active mandates granted to its `agentId`.
  - The agent key cannot modify, expand, or elevate its own mandate.
  - Mandate creation and parameter updates require a valid signature from the user's Passkey (secp256r1) verified via Monad's native P256 precompile.
  - The user can instantly revoke the mandate with a single passkey tap.
* **Result:** **Damage strictly bounded to remaining spending cap on whitelisted targets.**

### 3. Replay Attacks and Front-Running
* **Attack:** An attacker captures an agent's valid signed action and attempts to submit it repeatedly across blocks.
* **Mitigation:**
  - Each action is bound to a strict monotonically increasing `nonce` stored in the contract state:
    $$\text{nonce}_{\text{expected}} = \text{mandate.nonce}$$
  - Execution atomically increments `mandate.nonce += 1`.
  - Any replayed call fails with `InvalidNonce()`.
* **Result:** **REVERTED on Monad EVM.**

### 4. Malicious Relayer or AgentTrust Backend Outage
* **Attack:** AgentTrust servers go offline or a malicious relayer attempts to alter execution receipts.
* **Mitigation:**
  - The `@agenttrust/sdk` and `IMandateManager.sol` interface are completely decentralized and portable.
  - Developers connect directly to Monad public RPC (`https://testnet-rpc.monad.xyz`).
  - Verification logic computes cryptographic hash parity directly on the client.
* **Result:** **Zero server dependence. Censorship resistant.**

---

## Cryptographic Security Invariants

| Invariant | Enforced At | Consequence of Failure |
| :--- | :--- | :--- |
| **P256 WebAuthn Signature** | Precompile `0x100` | Revert `InvalidPasskeySignature` |
| **Whitelisted Target** | `MandateManager.sol` | Revert `TargetNotAllowed(address)` |
| **Whitelisted Selector** | `MandateManager.sol` | Revert `SelectorNotAllowed(bytes4)` |
| **Max Action Cap** | `MandateManager.sol` | Revert `ValueExceedsActionLimit` |
| **Max Cumulative Cap** | `MandateManager.sol` | Revert `ValueExceedsTotalLimit` |
| **Expiry Timestamp** | `block.timestamp` | Revert `MandateExpired` |
| **Revocation Status** | `MandateManager.sol` | Revert `MandateRevoked` |
| **Strict Nonce Ordering** | `MandateManager.sol` | Revert `InvalidNonce` |
