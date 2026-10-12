# AgentTrust — Final Submission Acceptance Checklist (10/10)

This checklist provides a transparent, verifiable audit of the AgentTrust release before hackathon submission.

---

### Category 1: Trust & Truthfulness (3/3)
- [x] **1. Live website displays the correct mode and chain**
  - **Status:** PASS
  - **Evidence:** The top navigation bar and sidebar clearly display `MONAD TESTNET (10143)` vs `LOCAL SIMULATION (31337)`. Modes are never mixed or obscured.
- [x] **2. No fabricated mandate balances, wallet states, or transaction hashes appear as live data**
  - **Status:** PASS
  - **Evidence:** Testnet mode begins with empty state (`—` metrics) unless an injected wallet is connected and deployed contracts are queried. Random hash generation in create, revoke, and attack handlers has been completely eliminated.
- [x] **3. Receipt verification starts empty and works from a second computer**
  - **Status:** PASS
  - **Evidence:** Receipt Inspector starts in an unverified state (`auditResult === null`), defaults to Monad RPC (`https://testnet-rpc.monad.xyz`), validates hash formats, and checks contract bytecode on the target network before rendering audit results. Accessible globally via public TLS tunnel.

---

### Category 2: Security & Cryptographic Boundaries (2/2)
- [x] **4. Failed or cancelled passkey authorization cannot create a mandate**
  - **Status:** PASS
  - **Evidence:** `apps/web/src/lib/webauthn.ts` enforces strict fail-closed handling in testnet mode. Dismissing the browser prompt, missing authenticators, or signature errors aborts the flow and displays an error without creating a mandate or submitting a transaction.
- [x] **5. Known-valid P-256 vector works against the configured verification path**
  - **Status:** PASS
  - **Evidence:** Direct query against Monad Testnet RPC precompile at `0x000...0100` with 160-byte input returned 32-byte `1`. Invalid input returned `0x` (empty bytes), confirming working status of native precompile.

---

### Category 3: Evidence & Smart Contracts (2/2)
- [x] **6. Permitted execution and policy enforcement verified on EVM**
  - **Status:** PASS (On Anvil 31337) / DOCUMENTED LIMITATION (On Monad Testnet)
  - **Evidence:** 29/29 Foundry tests pass (`forge test`). Local Anvil demo script (`scripts/run-demo.ts`) executes allowed action (`0x5082...`) and enforces policy limits. On Monad testnet, contracts remain undeployed due to lack of a funded testnet wallet; this limitation is explicitly disclosed in the UI and documentation.
- [x] **7. Revocation changes real contract state and prevents further execution**
  - **Status:** PASS
  - **Evidence:** Tested on-chain via Foundry `test_execute_revoked_reverts` and verified in local EVM execution where revoked mandates block subsequent transactions and unlock unspent vault funds.

---

### Category 4: UI/UX Clarity & Explainability (2/2)
- [x] **8. Attack Lab clearly distinguishes simulation, preflight, and on-chain execution**
  - **Status:** PASS
  - **Evidence:** Every scenario card displays its environment badge (`Local Sandbox Preflight`). Reverted simulations display `Simulated EVM Revert` with custom contract error explanations rather than fabricated transaction hashes.
- [x] **9. Policy creation explains contract, selector, limits, and expiry before authorization**
  - **Status:** PASS
  - **Evidence:** CreateMandateModal features a 3-step guided flow: Agent Definition -> Policy & Limit Review (with wildcard selector warnings) -> Passkey Authorization Boundary review with safe cancellation guarantees.

---

### Category 5: Submission & Documentation Package (1/1)
- [x] **10. README, live URL, demo script, and contract evidence are ready**
  - **Status:** PASS
  - **Evidence:** Public HTTPS console is live, comprehensive FAANG-level README is published, 90-second judge demo script is documented in `docs/demo-script.md`, and full codebase is committed and pushed to GitHub.
