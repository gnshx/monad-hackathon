# AgentTrust — 90-Second Hackathon Judge Demo Script

**Theme:** Give your AI agent a mandate, not unlimited power.  
**Total Runtime:** 90 Seconds  
**Format:** Live Walkthrough & Narration  

---

### [0:00 - 0:10] The Core Problem
> "AI agents are becoming economic actors, but giving an autonomous LLM a private key is an existential risk. A single prompt injection, hallucination, or rogue call can completely drain a user's wallet. What agents need is delegated, bounded authority."

### [0:10 - 0:25] Step 1: Scoped Mandate Configuration
> "Here on the AgentTrust console, we don't grant unlimited wallet access. We compile a scoped policy: designating Agent #42, allowlisting only the Uniswap DEX router and the `swap` selector, setting a 0.2 MON per-tx ceiling, and capping the total budget at 1 MON with a 48-hour expiration."

### [0:25 - 0:38] Step 2: Hardware Passkey Authorization (P-256)
> "To activate this policy, the human owner doesn't store a session key in hot browser memory. They authorize it using their device hardware passkey—TouchID, FaceID, or a YubiKey. On Monad, this SECP256R1 signature is verified natively on-chain using the RIP-7212 precompile at `0x0100`."

### [0:38 - 0:53] Step 3: Permitted Action Execution
> "Now the agent goes to work. In our local test environment, the agent submits a 0.1 MON swap to the allowlisted DEX target. The contract verifies caller authorization, checks the target allowlist, checks the spending ceiling, and approves the transaction. The vault balance safely updates."

### [0:53 - 1:05] Step 4: Policy Revert on Rogue Call
> "What happens if the agent goes rogue? In Attack Scenario #2, a prompt injection instructs the agent to drain 0.1 MON to an unapproved hacker address. The contract immediately reverts with `TargetNotAllowed()`. The transaction fails, and the user's vault balance remains 100% intact."

### [1:05 - 1:15] Step 5: Instant Human Revocation
> "If the user detects anomalous agent behavior, they retain instant on-chain revocation power. With one click, the owner revokes the mandate on-chain. All subsequent agent transactions immediately revert with `MandateIsRevoked()`, and any unspent vault funds can be withdrawn back to the owner."

### [1:15 - 1:25] Step 6: Independent Receipt Verification
> "Finally, how does anyone know what really happened? Using the AgentTrust Receipt Inspector—powered by our zero-backend TypeScript SDK—any judge, developer, or counterparty can take a transaction hash, query Monad RPC, and independently verify that the execution strictly complied with the authorized mandate."

### [1:25 - 1:30] Conclusion & Call to Action
> "AgentTrust delivers passkey-authorized delegation, contract-enforced bounds on Monad, and independently verifiable execution receipts. Give your AI agents a mandate, not unlimited power."
