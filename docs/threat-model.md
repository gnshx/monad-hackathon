# AgentTrust — Security Threat Model & Trust Boundaries

## 1. System Overview & Roots of Trust
AgentTrust solves the problem of granting autonomous AI agents execution authority without exposing master private keys or granting unbounded economic access.

The system relies on four strict trust boundaries:
1. **Human Root of Trust:** Hardware Passkey Authenticator (Secure Enclave / TPM / FIDO2) generating SECP256R1 (P-256) signatures.
2. **On-Chain Policy Enforcer:** `MandateManager.sol` deployed on Monad, verifying passkey authorizations and gating every agent call.
3. **Execution Environment:** Monad Blockchain (10,000 TPS, 1s finality, RIP-7212 P-256 precompile at `0x0100`).
4. **Independent Auditor:** Portable `@agenttrust/sdk` cryptographic receipt verifier.

---

## 2. Threat Analysis & Mitigations

| Threat | Attack Vector | AgentTrust Defense & Mitigation | Invariant Status |
| :--- | :--- | :--- | :--- |
| **Prompt Injection / Jailbreak** | Attacker instructs LLM agent to transfer treasury funds to an unapproved address. | `MandateManager` strictly checks `msg.sender` target against `allowedTargets[mandateId]`. Reverts with `TargetNotAllowed()`. | **Hard-Enforced On-Chain** |
| **Drain / Rapid Depletion** | Compromised agent attempts to drain entire vault balance in one emergency transaction. | Contract enforces `maxValuePerTx` ceiling and `maxTotalValue` cumulative budget. Reverts with `ExceedsPerTxLimit()` or `ExceedsTotalLimit()`. | **Hard-Enforced On-Chain** |
| **Caller Impersonation (CRIT-01)** | Rogue third-party EOA calls `execute()` pretending to be the agent. | `MandateManager` strictly asserts `msg.sender == mandate.agentAddress`. Reverts with `CallerNotAuthorized()`. | **Hard-Enforced On-Chain** |
| **Replay Attack** | Attacker re-submits a previously authorized passkey signature. | Signature commits canonically to `nonce`, `chainId`, `contractAddr`, and target array. `ownerNonces` increments on creation; `executionNonces` tracks calls. Reverts with `BadNonce()` or `ReplayDetected()`. | **Hard-Enforced On-Chain** |
| **Rogue Agent After Compromise** | Compromised agent continues submitting calls after breach detection. | Human owner calls `revokeMandate(id)`. Flips `revoked = true`. Subsequent calls revert with `MandateIsRevoked()`. Unspent funds unlock for owner withdrawal. | **Hard-Enforced On-Chain** |
| **Malleable Signatures** | Attacker manipulates ECDSA `s` value to produce equivalent signature. | Contract checks `uint256(sigS) <= P256_N / 2` to prevent signature malleability. | **Hard-Enforced On-Chain** |
| **Cross-Mandate Theft** | Agent attempts to draw funds from another agent's mandate balance. | Mandate balances are segregated into isolated mappings (`mandateBalances[mandateId]`). Calls revert with `InsufficientMandateBalance()`. | **Hard-Enforced On-Chain** |

---

## 3. Known Limitations & Roadmap

1. **Testnet Wallet Funding:**
   Due to lack of funded testnet wallet keys during hackathon development, live testnet transactions are demonstrated via verified local node Anvil transactions and precompile validation, while the UI cleanly discloses when contracts are undeployed.
2. **ERC-4337 Account Abstraction Integration:**
   Currently operates as an isolated mandate manager contract with dedicated vault balances. Future versions will integrate directly with ERC-7579 modular smart account execution validators.
3. **Multi-Target Atomic Batching:**
   Currently executes single targeted contract calls per transaction. Support for atomic multi-call batches within a single mandate allowance is slated for v2.1.
