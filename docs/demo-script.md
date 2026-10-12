# AgentTrust — 3-Minute Technical Demo Video Script

**Topic:** Live Walkthrough of Deployed AgentTrust Architecture  
**Requirement:** Must show the live working product, not slides or code walkthrough  
**Target Duration:** 175 seconds  

---

### [00:00 - 00:35] Act 1: Passkey Authorization & Mandate Creation
* **Screen:** Dashboard at `http://localhost:3000` (Mandates Tab).
* **Action:**
  1. Show Monad Testnet connection badge (`Chain ID 10143`) and active P256 Precompile indicator (`0x100`).
  2. Click **"Register Passkey (P256)"** -> Show native WebAuthn biometric prompt and generated secp256r1 public key coordinates `(x, y)`.
  3. Form configuration:
     - Select AI Agent: `Apex Arbitrage Sentinel` (ERC-8004 #1).
     - Permitted Targets: `Monad DEX Router (0x7a25...)` and `Liquid Staking (0x1111...)`.
     - Permitted Selectors: `swapExactTokens` (`0x38ed1739`) and `deposit` (`0xd0e30db0`).
     - Max Value Per Action: `0.25 MON`.
     - Max Total Value: `2.50 MON`.
  4. Click **"Sign & Authorize Mandate with Passkey (P256)"**.
* **Voiceover:**
  *"We begin by establishing cryptographic authority. With a single tap of our biometric passkey, we authorize Agent #1 to execute DEX swaps up to 0.25 MON. Notice how our mandate is anchored directly on Monad using the native P256 precompile without any central server relay."*

---

### [00:35 - 01:10] Act 2: Permitted Action Succeeds
* **Screen:** Switch to **⚡ Security Proof Sandbox** tab.
* **Action:**
  1. Click **"1. Permitted Action"** (0.10 MON swap to Monad DEX Router).
  2. Transaction succeeds on Monad.
  3. Show block receipt: `Block #4892011`, `Tx: 0x3a91...`, `Gas: 48,210`, Event: `ActionExecuted`.
  4. Show spending gauge updated to `0.20 / 2.50 MON`.
* **Voiceover:**
  *"Now the autonomous agent executes a valid arbitrage swap. Target is whitelisted, function selector matches, and the value is 0.10 MON — well below our 0.25 MON cap. The Monad contract confirms execution, emits the ActionExecuted event, and updates our cumulative spending meter."*

---

### [01:10 - 01:50] Act 3: Malicious & Over-Limit Actions Revert
* **Screen:** Security Proof Sandbox.
* **Action:**
  1. Click **"2. Forbidden Target"** (Agent attempts to call unauthorized hacker contract `0xDead...bEEf`).
  2. Contract immediately reverts.
  3. Highlight on-chain EVM error: `🛑 Revert: IMandateManager.TargetNotAllowed(0xDead...bEEf)`.
  4. Click **"3. Spending Cap Exceeded"** (Agent attempts 1.50 MON action).
  5. Contract immediately reverts: `🛑 Revert: IMandateManager.ValueExceedsActionLimit(1.5 MON, max 0.25 MON)`.
* **Voiceover:**
  *"Next, we simulate an untrusted agent going rogue or suffering from prompt injection. When the agent attempts to call an unapproved drain address, the Monad smart contract halts the execution. The transaction reverts on-chain with TargetNotAllowed. When it attempts to exceed the spending cap with 1.5 MON, it reverts with ValueExceedsActionLimit. The AI cannot bypass this boundary because the EVM itself enforces the invariants."*

---

### [01:50 - 02:20] Act 4: Sovereign Passkey Revocation
* **Screen:** Mandates tab -> Click **"Revoke Mandate with Passkey"**.
* **Action:**
  1. User confirms with Passkey biometric.
  2. Mandate status badge flips to `REVOKED`.
  3. Return to Sandbox -> Run action -> Contract halts with `MandateRevoked()`.
* **Voiceover:**
  *"If the user ever wants to withdraw permission, a single passkey tap revokes the mandate on Monad. Subsequent execution attempts are dead on arrival."*

---

### [02:20 - 03:00] Act 5: Portable Zero-Trust Verification
* **Screen:** Switch to **🛡️ Zero-Trust Verifier** tab.
* **Action:**
  1. Show receipt hash entered in the verifier.
  2. Click **"Audit On Monad"**.
  3. Display the 6-point cryptographic verification checklist:
     - Direct RPC state query
     - Native P256 precompile signature verification
     - Action hash keccak256 parity
     - Target & selector check
     - Cap accounting
     - Nonce replay protection
  4. Show the portable JSON attestation proof.
* **Voiceover:**
  *"Finally, our core claim: portable verification. An independent developer or exchange can paste this transaction hash into the SDK verifier. The client audits the Monad state, verifies the P256 precompile assertion, and validates the invariants with 100% cryptographic certainty — zero trust in AgentTrust servers required."*
