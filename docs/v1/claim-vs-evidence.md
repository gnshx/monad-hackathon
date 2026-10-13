# AgentTrust — Claim vs. Evidence Matrix & Truth Inventory

This document provides a truthful, transparent breakdown of every claim made by AgentTrust, explicitly distinguishing what is fully implemented and cryptographically proven on-chain from local simulations and known limitations.

---

## 1. Truthful Evidence Inventory

| Category | Claimed Feature | Implementation & Verification Status | Underlying Evidence / Reproducible Command |
| **P-256 Precompile** | Monad native RIP-7212 precompile present at `0x0100` | **PROVEN ON MONAD TESTNET (CHAIN 10143)** | Cryptographically verified live on Monad Testnet (`https://testnet-rpc.monad.xyz`) via `cast call 0x0000000000000000000000000000000000000100 <160_bytes>`. Valid Secp256r1 signature vector returns `0x0000000000000000000000000000000000000000000000000000000000000001` (true); tampered signature returns `0x` (fail-closed). Reproducible with `npm run verify:p256`. |
| **ERC-8004 Registry** | Composability with Monad on-chain Agent Identity Registry | **PROVEN ON MONAD TESTNET (`0x8004A818...`)** | Verified live on Monad Testnet at `0x8004A818BFB912233c491871b3d84c89A494BD9e`. SDK checks `getAgentWallet(agentId)` and `ownerOf(agentId)` to cryptographically bind mandate execution permissions to registered agent identities. Reproducible with `npm run verify:erc8004`. |
| **Smart Contracts** | Per-call native spend cap, cumulative cap, allowlisted target & selector checks | **PROVEN ON-CHAIN (72 TESTS)** | Foundry suite passing 72/72 tests across AgentMandates, MandateManager, and DigestVector including 1,000-run fuzzing (`forge test`). |
| **Spending Cap Semantics** | Spending limits enforce native MON `msg.value` and designated ERC-20 vault allowances | **DOCUMENTED ARCHITECTURAL BOUNDARY** | Contract enforces `target.call{value: value}(callData)` native MON limits and designated vault ERC-20 allowances. Does not decode arbitrary calldata parameters of arbitrary external protocols. Presets and documentation explicitly label boundaries. |
| **Caller Authorization** | `CallerNotAuthorized` CRIT-01 guard prevents stranger EOAs from triggering execution | **PROVEN ON-CHAIN** | `test_execute_unauthorizedCaller_stranger_reverts` in `MandateManager.t.sol` and `test_execute_stranger_reverts` in `AgentMandates.t.sol` pass. |
| **Vault Accounting** | Isolated vault balances prevent cross-mandate theft | **PROVEN ON-CHAIN** | `test_vault_isolation_preventsCrossMandateTheft` and `test_execute_vaultIsolation_reverts` pass. |
| **Revocation Lifecycle** | Human owner can immediately revoke active mandate on-chain | **PROVEN ON-CHAIN** | `test_execute_revoked_reverts` & `test_withdrawUnspent_afterRevoke_happy` pass. |
| **WebAuthn Verification** | Fail-closed device prompt; user presence & user verification enforced | **PROVEN IN SDK & CONTRACT** | Contract enforces User Presence & User Verification bits (`flags & 0x05`). Browser requests biometric credentials. |
| **Receipt Verification** | Zero-backend independent receipt auditor with fail-closed checks | **PROVEN VIA SDK (34 TESTS)** | `@agenttrust/sdk` `verifyReceipt()` and SDK suite passes 34/34 tests. Validates expected chain ID, deployed bytecode, contract address, event topics, expected selector, and max value bounds. Differentiates `success`, `reverted`, `not_found`, `rpc_error`, and `wrong_network`. |
| **Local E2E Execution** | Full 6-scenario demo lifecycle on local EVM node | **PROVEN ON ANVIL (31337)** | `npx tsx scripts/run-demo.ts` executes mandate creation, payable call, rogue target block, ceiling block, revocation, and receipt verification with real hashes on local node. |
| **Policy-to-Proof Explorer** | Connected 4-step pipeline: Intent -> Policy -> Invariants -> Evidence | **PROVEN BROWSER PREFLIGHT** | Live component in `apps/web/src/components/PolicyToProofExplorer.tsx` connecting natural language presets to real structured EVM bounds and labeled browser preflight invariant checks. |
| **Actionable Policy Linter** | Deterministic EVM invariant linter that blocks invalid authorization | **PROVEN IN BROWSER CONSOLE** | Validates target address format, agent address, 4-byte selector specificity, positive per-tx limits, and lifetime budget constraints. Blocks authorization when errors exist. |
| **Proof Bundle Dossier Export** | JSON/MD dossier export containing policy parameters, linter checks, and test outcomes | **PROVEN IN BROWSER CONSOLE** | Generates copyable/downloadable JSON dossier with explicit simulation disclaimers and RPC verification guidance. |
| **Monad Testnet Deployment** | Live AgentMandates & MandateManager contracts deployed and verified on Monad Testnet | **PROVEN LIVE ON MONAD TESTNET (CHAIN 10143)** | Deployed AgentMandates (`0xc911e902bf3b3f532bffc1a988e2d00969a1237c`), MandateManager (`0x3550f9fc84640a9cfd7c51330615a1e05cb948be`), Test USDC (`0x540564511d46e74c0ed48a6d63de8c79e61a860a`), and MockTarget (`0xd856e20dbf9280299739efdc0082e431fa644e73` / `0x0758fdc7...`) on Monad Testnet. Complete on-chain execution matrices mined and verified on-chain. Fully inspectable via `deployments.mandates.json`, `deployments.json`, and `npm run verify:all`. |
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
   - Runs an offline in-browser sandbox; no RPC connection is made.
   - Every card and activity item is prominently tagged as simulation.
   - Sandbox wallets are randomly generated and labeled, never real addresses.
   - Attack Lab and Explorer run as labeled browser preflights (`Execution Mode: Local Preflight`), never "On-Chain Blocked".
   - Starts with zero mandates and zero activity; nothing is seeded.
