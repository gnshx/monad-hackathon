# AgentTrust — Claim vs. Evidence Matrix & Truth Inventory

This document provides a truthful, transparent breakdown of every claim made by AgentTrust, explicitly distinguishing what is fully implemented and cryptographically proven on-chain from local simulations and known limitations.

---

## 1. Truthful Evidence Inventory

| Category | Claimed Feature | Implementation & Verification Status | Underlying Evidence / Reproducible Command |
| :--- | :--- | :--- | :--- |
| **P-256 Precompile** | Monad native RIP-7212 precompile active at `0x0100` | **PROVEN ON MONAD TESTNET** | Queried `0x000...0100` on `https://testnet-rpc.monad.xyz` with valid 160-byte vector (`hash \|\| r \|\| s \|\| pubKeyX \|\| pubKeyY`). Returned 32-byte `1`. Invalid signature returned `0x` (empty bytes). |
| **Smart Contracts** | Per-tx spend cap, cumulative cap, allowlisted target & selector checks | **PROVEN ON-CHAIN (29 TESTS)** | Foundry suite passing 29/29 tests including fuzzing (`forge test`). |
| **Caller Authorization** | `CallerNotAuthorized` CRIT-01 guard prevents stranger EOAs from triggering execution | **PROVEN ON-CHAIN** | `test_execute_unauthorizedCaller_stranger_reverts` in `MandateManager.t.sol` passes. |
| **Vault Accounting** | Isolated vault balances prevent cross-mandate theft | **PROVEN ON-CHAIN** | `test_vault_isolation_preventsCrossMandateTheft` in `MandateManager.t.sol` passes. |
| **Revocation Lifecycle** | Human owner can immediately revoke active mandate on-chain | **PROVEN ON-CHAIN** | `test_execute_revoked_reverts` & `test_withdrawUnspent_afterRevoke_happy` pass. |
| **WebAuthn Fail-Closed** | Cancelled prompt or missing authenticator halts mandate creation | **PROVEN IN SDK & BROWSER** | `apps/web/src/lib/webauthn.ts` strictly throws on cancellation; tested in vitest integration suite (`test/webauthn-integration.test.ts`). |
| **Receipt Verification** | Zero-backend independent receipt auditor for Monad | **PROVEN VIA SDK** | `@agenttrust/sdk` `verifyReceipt()` passes 17/17 tests against real RPC logs. Validates chain ID 10143, deployed bytecode, contract address, event topics, and selector parameters. |
| **Local E2E Execution** | Full 6-scenario demo lifecycle on local EVM node | **PROVEN ON ANVIL (31337)** | `npx tsx scripts/run-demo.ts` executes mandate creation, token transfer, rogue target block, ceiling block, revocation, and receipt verification with real hashes on local node. |
| **Monad Testnet Deployment** | Live MandateManager contract deployed on Monad Testnet | **UNCLAIMED (NO FUNDED WALLET)** | The placeholder address `0xa5754E89745eC4eB9d7F31f0C34eB267773531b7` currently has 0 bytes bytecode on Monad Testnet. The UI honestly detects this (`client.getBytecode`) and surfaces a clear warning rather than fabricating fake state. |
| **Deterministic Policy Compiler** | Natural language task compiler | **RULE-BASED DETERMINISTIC PARSER** | Accurately disclosed in UI as a deterministic rule compiler, not a cloud LLM wrapper. Avoids hallucinated permissions. |

---

## 2. Testnet vs. Local Sandbox Distinction

AgentTrust enforces strict network isolation:
1. **`MONAD TESTNET (10143)`**:
   - Queries `https://testnet-rpc.monad.xyz`.
   - Requires real injected wallet (MetaMask / Rabby).
   - Enforces chain ID `10143`.
   - Checks deployed bytecode before permitting writes.
   - Requires real hardware P-256 WebAuthn assertion.
   - Never generates synthetic random transaction hashes.
   - Starts Receipt Inspector in unverified state (`null`).

2. **`LOCAL SIMULATION (31337)`**:
   - Runs against local Anvil development chain (`http://127.0.0.1:8545`).
   - Every card and activity item is prominently tagged with `[SIMULATED]`.
   - Reverted attack simulations are labeled `Simulated EVM Revert`, never "On-Chain Blocked".
