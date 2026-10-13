# AgentTrust — 90-Second Hackathon Judge Demo Script

**Theme:** Agent authority, under control.  
**Total Runtime:** 90 Seconds  
**Format:** Live Walkthrough & Narration  
**Centerpiece Feature:** Policy-to-Proof Explorer (Judge Mode)

---

### [0:00 - 0:10] The Core Problem
> "AI agents can perform high-value on-chain transactions, but giving an autonomous agent unrestricted wallet authority is an existential risk. A single prompt injection or hallucination can completely drain funds. What agents need is delegated, bounded authority. That's why we built AgentTrust."

---

### [0:10 - 0:25] Step 1: Draft Mandate & Actionable Policy Linter
*(Action: Click "Run guided demo" on the overview to open Policy-to-Proof Explorer. Preset 1 loads automatically: Payable Execution Router.)*
> "In Policy-to-Proof Explorer, we draft a scoped mandate: 'Call payable execution router with selector `doSomething(uint256)` transferring up to 0.2 native MON for 1 hour.'
> Notice what happens: rather than a black-box AI score, our Actionable Policy Linter evaluates explicit EVM invariants: it confirms the target is allowlisted, checks selector specificity, enforces the per-call native MON ceiling of 0.2 MON, and verifies a 1-hour expiration. If any blocking validation error exists, authorization is physically disabled."

---

### [0:25 - 0:40] Step 2: Passkey Authorization Boundary (P-256)
*(Action: Click "Proceed to Passkey Authorization" to show the WebAuthn boundary modal.)*
> "To activate authority, the human owner doesn't store a hot session key. They authorize it with their hardware passkey—TouchID, FaceID, or Windows Hello. 
> The challenge hash strictly binds the Monad chain ID, contract address, and mandate parameters. And if the prompt is cancelled or unauthenticated, it fails closed—zero fake authorizations."

---

### [0:40 - 0:55] Step 3: Security Invariant Tests (Allowed vs. Denied)
*(Action: In Step 03 of Explorer, click "Run Invariant Preflight Simulation".)*
> "We test this exact policy against real security invariants in a transparent browser preflight:
> First, the permitted payable router call succeeds.
> Second, when an adversarial prompt injection attempts to siphon funds to an unapproved recipient, the contract reverts with `TargetNotAllowed()`.
> Third, when an agent attempts a 0.6 MON transaction exceeding the 0.2 MON native cap, it reverts with `ExceedsPerTxLimit()`. The vault balance remains intact."

---

### [0:55 - 1:10] Step 4: Instant Human Revocation
*(Action: Switch to Mandates Ledger or trigger Revoke.)*
> "If the owner ever spots suspicious activity, they retain instant on-chain revocation power. One click revokes the mandate on-chain. All subsequent agent transactions immediately revert with `MandateIsRevoked()`, and any unspent vault deposits can be withdrawn back to the owner."

---

### [1:10 - 1:25] Step 5: Independent Receipt Verification & Proof Dossier
*(Action: In Step 04 of Explorer, click "Export Proof Bundle" and open Receipt Inspector.)*
> "How does anyone know what actually happened? With one click, the judge can export a JSON Proof Bundle dossier. 
> And with the Receipt Inspector—powered by our zero-backend TypeScript SDK—any counterparty can query raw Monad RPC logs to independently verify inclusion, event signatures, selector matching, and value caps without trusting our frontend."

---

### [1:25 - 1:30] Closing: The Developer Path
*(Action: Show the @agenttrust/sdk snippet.)*
> "AgentTrust gives developers a 3-minute integration path to protect their on-chain agents. Give your AI agents a mandate, not unlimited power."
