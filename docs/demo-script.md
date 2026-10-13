# AgentTrust — 90-Second Hackathon Judge Demo Script

**Theme:** Agent authority, under control.  
**Total Runtime:** 90 Seconds  
**Format:** Live Walkthrough & Narration  
**Centerpiece Feature:** Policy-to-Proof Explorer (Judge Mode) & Local Anvil EVM Enforcement (Chain 31337)

---

### [0:00 - 0:10] The Core Problem
> "AI agents can perform high-value on-chain transactions, but giving an autonomous agent unrestricted wallet authority is an existential risk. A single prompt injection or hallucination can completely drain funds. What agents need is delegated, bounded authority. That's why we built AgentTrust."

---

### [0:10 - 0:25] Step 1: Draft Mandate & Actionable Policy Linter
*(Action: Click "Run guided demo" on the overview to open Policy-to-Proof Explorer. Preset 1 loads: Payable Execution Router.)*
> "In the Policy-to-Proof Explorer, we draft a scoped mandate: 'Call payable execution router with selector `doSomething(uint256)` transferring up to 0.2 native MON for 1 hour.'
> Notice what happens: rather than a black-box AI score, our Actionable Policy Linter evaluates explicit EVM invariants: it validates the target address, checks 4-byte selector specificity, enforces the per-call native MON ceiling of 0.2 MON, and verifies future expiration. If any blocking validation error exists, authorization is physically disabled with no silent defaults."

---

### [0:25 - 0:40] Step 2: Passkey Authorization Boundary (P-256)
*(Action: Click "Proceed to Passkey Authorization" to show the WebAuthn boundary modal.)*
> "To activate authority, the human owner doesn't store a hot private key. They authorize it with their hardware passkey—TouchID, FaceID, or Windows Hello. 
> The challenge hash binds the chain ID, contract address, and mandate parameters. The contract validates the Secp256r1 signature envelope via Monad's RIP-7212 P-256 precompile architecture at `0x0100`, enforcing the User Presence bit. If cancelled or unauthenticated, it fails closed."

---

### [0:40 - 0:55] Step 3: Security Invariant Tests (Browser Preflight & EVM Enforcement)
*(Action: In Step 03 of Explorer, click "Run Invariant Preflight Simulation", then show terminal `npm run demo` running on local Anvil Chain 31337.)*
> "We test this exact policy against real adversarial vectors.
> In our browser preflight simulation, and proven on our local Anvil EVM node (Chain 31337):
> First, the permitted payable router call executes cleanly.
> Second, when an adversarial prompt injection attempts to call an unapproved recipient, the smart contract reverts with `TargetNotAllowed()`.
> Third, when an agent attempts a 0.3 MON spend exceeding the 0.2 MON native cap, the contract halts execution with `ExceedsPerTxLimit()`. The vault balance remains intact."

---

### [0:55 - 1:10] Step 4: Human Kill Switch & Unspent Vault Recovery
*(Action: Show Scenario 5 in terminal output or Mandates Ledger.)*
> "If the owner ever detects anomalous behavior, they retain instant revocation power. 
> Demonstrated on our local Anvil EVM, the owner revokes the mandate on-chain: all subsequent agent execution immediately reverts with `MandateIsRevoked()`, and 100% of remaining unspent vault funds are safely recovered back to the owner's address."

---

### [1:10 - 1:25] Step 5: Independent Receipt Verification & Proof Dossier
*(Action: In Step 04 of Explorer, click "Export Proof Bundle" and open Receipt Inspector.)*
> "How does an auditor verify what happened? The judge can export a versioned JSON Proof Bundle.
> And in our standalone Receipt Inspector—powered by `@agenttrust/sdk`—any counterparty can audit raw EVM receipts against on-chain block inclusion, `ActionExecuted` event logs, and expected policy constraints. Missing policy constraints are flagged as partial audits, and the auditor fails closed on any mismatch."

---

### [1:25 - 1:30] Closing: The Developer Path
*(Action: Show the @agenttrust/sdk snippet and GitHub quickstart.)*
> "AgentTrust gives developers a 3-minute SDK quickstart to protect autonomous agents. Give your agents a mandate, not unlimited keys."

