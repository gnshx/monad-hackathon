# 🎬 AgentTrust — Video Storyboards & Integration Outreach Package

> **Prepared For:** Metropolis Hackathon Team & Judges  
> **Includes:**
> 1. Integration Outreach Messages (Ready to Send to Protocols, Frameworks & Registries)
> 2. 3-Minute Technical Demo Video Storyboard (Screen-by-Screen & Script)
> 3. 2-Minute Founder Pitch Video Storyboard (Slide-by-Slide & Script)

---

## 📨 Part 1: Integration Outreach Messages (Ready to Send)

These messages are tailored for real teams in the Monad and agentic Web3 ecosystems to establish design partnerships and day-1 integrations.

### Message 1: For Autonomous DeFi Protocols & DEXs on Monad (e.g. Ambient, Kuru, Liquidity Managers)
**Subject / Telegram Hook:** Scoped execution boundary for autonomous trading & rebalancing agents on Monad
```text
Hey [Name/Team],

Saw what you're building on Monad—the throughput and sub-second blocks are incredible for high-frequency DeFi.

We’re building AgentTrust (participating in the Monad Metropolis hackathon). The biggest blocker we’re hearing from teams deploying autonomous trading and yield-rebalancing bots is custody risk: if you give an AI agent hot private keys, a prompt injection or model hallucination can drain the entire treasury.

AgentTrust gives your protocol's agents an immutable on-chain mandate boundary on Monad:
- Scoped strictly to your router contract and exact 4-byte swap/rebalance selectors
- Hard per-transaction and cumulative native MON spending caps
- Isolated per-agent vaults so a compromised bot cannot touch user or treasury funds
- Owner revocation with instant fund recovery

We’ve published a zero-dependency TypeScript SDK (@agenttrust/sdk) that drops into agent loops in under 15 minutes. 

Would love to set up a quick 15-minute call or share our testnet contract address to explore a design partnership for autonomous rebalancing on Monad.

Best,
[Your Name] — AgentTrust Team
https://github.com/gnshx/monad-hackathon
```

---

### Message 2: For AI Agent Frameworks & MCP Builders (ElizaOS, LangChain, CrewAI, Claude MCP Servers)
**Subject / Discord / Twitter DM:** Drop-in hardware passkey guardrail for on-chain agent tools
```text
Hey [Name/Team],

Big fan of the work on [Eliza / LangChain / MCP]. As agents shift from chat to executing on-chain transactions, handling private keys safely is the single biggest security liability.

We built AgentTrust for Monad to solve this cleanly at the smart contract level:
Instead of giving your agent runtime an unrestricted private key, a human authorizes a scoped mandate with a single biometric tap of their device hardware passkey (TouchID / FaceID).

The smart contract on Monad enforces:
1. Target & selector allowlists (agent cannot call unapproved functions)
2. Strict spending limits (cannot overspend or drain balances)
3. Direct composability with Monad's ERC-8004 Agent Identity Registry
4. Counterparty receipts verifiable directly against Monad RPC without a backend

We built `@agenttrust/sdk` so any tool runner or agent can wrap its action execution in 10 lines:
const guard = createAgentGuard({ client, mandateId });
const receipt = await guard.execute({ target, selector, callData, value });

We'd love to contribute an official AgentTrust tool integration to [Eliza / LangChain / your repo]. Are you open to a quick PR or chat?

Repo: https://github.com/gnshx/monad-hackathon
```

---

### Message 3: For Monad ERC-8004 Agent Identity Projects
**Subject / Discord / Telegram:** Binding ERC-8004 agent identity to on-chain execution mandates on Monad
```text
Hey [Team],

We noticed your implementation of the ERC-8004 Trustless Agent Identity Registry on Monad Testnet (0x8004A818BFB912233c491871b3d84c89A494BD9e).

We built AgentTrust to provide the execution & spending policy layer for registered ERC-8004 agents. While the registry proves agent identity and wallet ownership, AgentTrust binds human owner mandates directly to registered agent IDs on-chain.

When a mandate is executed on Monad:
1. The contract verifies the mandate authorizes that specific ERC-8004 agentId
2. The agent's Hot EOA is authorized to trigger calls within strict spending & target bounds
3. Counterparties can verify the on-chain receipt and agent identity in one command (`npm run verify:tx <txHash>`)

We've already verified live composability against the Monad testnet registry in our SDK (`npm run verify:erc8004`).

Would love to coordinate on making AgentTrust the standard policy layer for agents registered on Monad!

Dossier: https://github.com/gnshx/monad-hackathon/blob/main/docs/judges.md
```

---

### Message 4: For MetaMask DevRel & Delegation Teams (Francesco Andreoli)
**Subject:** Complementary on-chain execution primitive for headless AI agents on Monad
```text
Hi Francesco,

Really admire the work you and MetaMask are doing on ERC-7715 and the Delegation Toolkit. 

For the Monad Metropolis hackathon, we built AgentTrust (https://github.com/gnshx/monad-hackathon). We view AgentTrust as completely complementary to user wallet delegation:

While MetaMask Delegation is ideal for interactive user browser dApp sessions, AgentTrust is designed for headless, 24/7 autonomous server-side agents (Eliza, LangChain, MCP daemons) that operate on Monad without a browser extension.

Our key primitives on Monad:
1. Passkey root-of-trust verified via Monad's native RIP-7212 P-256 precompile (0x0100) at 6,900 gas (~50x cheaper than Solidity)
2. On-chain composability with Monad's live ERC-8004 Agent Identity Registry
3. Standalone, zero-dependency receipt verifier (verifyReceipt) allowing counterparties to audit transactions directly against RPC without trusting our servers

A user can easily manage and fund their AgentTrust vaults using MetaMask, while autonomous agents execute within immutable smart contract boundaries.

Would love your feedback on our architecture when you have a moment!
Dossier: https://github.com/gnshx/monad-hackathon/blob/main/docs/judges.md
```

---

## 🎥 Part 2: 3-Minute Technical Demo Video Storyboard

**Goal:** Provide an engaging, undeniable proof of technical execution showing the working product, live Monad testnet primitives, fail-closed attack lab, and independent verification CLI.

| Timestamp | Visual on Screen | Audio / Narration Script | Action / Highlight |
| :--- | :--- | :--- | :--- |
| **0:00 - 0:25** | Split screen: Terminal showing an autonomous agent loop vs. a mock treasury balance dropping to 0 MON. | "Autonomous AI agents are arriving on Monad—rebalancing liquidity, placing trades, and executing tool calls. But giving an AI model raw private keys is existential risk. A prompt injection or hallucination drains the treasury instantly. Today, we show you AgentTrust: the cryptographic trust boundary for autonomous AI on Monad." | Show problem statement visually. |
| **0:25 - 0:55** | Browser showing the AgentTrust Web Console. Navigate to "Create Mandate". Select target contract, approved 4-byte selector, per-tx limit (0.05 MON), and click "Authorize with Passkey". Hardware biometric prompt pops up. | "With AgentTrust, a human owner creates a scoped mandate in seconds. Instead of exporting private keys, the owner authorizes the mandate with a single biometric tap of their hardware passkey—TouchID, FaceID, or YubiKey. On Monad, this WebAuthn signature is verified directly on-chain using Monad’s native RIP-7212 P-256 precompile at 0x0100 for just 6,900 gas—roughly 50 times cheaper than standard EVM bytecode." | Trigger biometric passkey tap. Show vault creation with isolated balance. |
| **0:55 - 1:25** | Terminal window side-by-side with Console. Run live precompile check & ERC-8004 check. Terminal outputs: `0x...01` on valid vector, `0x` fail-closed on invalid vector. Live ERC-8004 agent identity queried on Monad Testnet. | "Let's prove this live on Monad testnet right now. First, running `npm run verify:p256`: our 160-byte valid vector returns 1, confirming the hardware signature passes; corrupting a single byte returns empty fail-closed. Next, `npm run verify:erc8004`: we query the live Monad testnet ERC-8004 registry at 0x8004A818... confirming our agent's verified identity." | Highlight terminal outputs and explorer links. |
| **1:25 - 2:05** | Switch to the "Attack Lab" in the Web Console / Demo Runner. Execute Scenario 1 (Allowed Action) -> Success. Then execute Scenario 2 (Rogue Target) -> Reverts. Scenario 3 (Over-Limit Spend) -> Reverts. Scenario 4 (Stranger Hijack) -> Reverts. | "Now, let’s attack the agent. In Scenario 1, the authorized agent executes an allowlisted swap of 0.02 MON. It succeeds and updates the isolated vault balance. In Scenario 2, prompt injection tricks the agent into calling an unapproved contract. The smart contract immediately reverts with `TargetNotAllowed`. In Scenario 3, it tries to spend 0.1 MON against a 0.05 limit: reverts with `ExceedsPerTxLimit`. In Scenario 4, an attacker steals the agent key and calls from another address: blocked by our `CallerNotAuthorized` guard." | Highlight that enforcement is strictly in `MandateManager.sol`, not the client SDK. |
| **2:05 - 2:35** | Console shows "Revoke Mandate". Owner clicks revoke. Unspent funds returned to owner wallet. | "If the owner ever suspects compromise, they click 'Revoke Mandate'. The mandate is permanently locked on-chain and all unspent funds are returned to the owner’s wallet immediately." | Show status change to `Revoked` and balance returned. |
| **2:35 - 3:00** | Terminal: run `npm run verify:tx <txHash>`. Show the audit summary with zero backend dependency. Display Monad Explorer link. | "Finally, how does a counterparty know an agent acted within its mandate? They don't have to trust our servers. With one command, `npm run verify:tx`, anyone can independently verify the transaction receipt directly against Monad RPC. AgentTrust: Sovereign human passkeys, unbreakable on-chain mandates on Monad. Thank you." | Show verified audit summary in CLI. Fade to repo link. |

*Note on Live Deployment:* The contract is live on Monad Testnet at `0x3550f9fc84640a9cfd7c51330615a1e05cb948be` with all 6 scenarios mined into blocks #70689675–#70689714. All transaction links are accessible on `testnet.monadexplorer.com` and recorded in `deployments.json`.

---

## 💡 Part 3: 2-Minute Founder Pitch Video Storyboard

**Goal:** Deliver a compelling startup pitch targeted at the investor & operator judging panel (Keone Hon, Tina Qi, Maria Shen, Will Nuelle, Frankie, Evan Feng, Ajit Tripathi, Francesco Andreoli).

### Pitch Tone & Theme
- **Tone:** Confident, technical, commercial, founder-led.
- **Narrative Arc:** Clear existential problem -> Cryptographic solution uniquely enabled by Monad -> Clear commercial wedge & revenue model -> Team execution.

| Slide / Scene | Visual Presentation | Spoken Voiceover Script | Investor Trigger / Takeaway |
| :--- | :--- | :--- | :--- |
| **Slide 1: Title & The Problem** (0:00 - 0:25) | Headline: "Autonomous AI Needs an On-Chain Security Perimeter"<br>Graphic: AI Agent holding a private key -> Leaked credentials & prompt injection draining a treasury. | "Autonomous AI agents are becoming economic actors on Monad—trading, executing swaps, and paying for compute. But giving an AI model an unconstrained private key is financial suicide. Prompt injections, model hallucinations, or leaked server keys can instantly drain an entire treasury. Today, developers face an impossible choice: lock the agent behind manual approvals, or risk total wallet drain." | Identifies real, immediate market pain in agentic Web3. |
| **Slide 2: The Solution: AgentTrust** (0:25 - 0:50) | Headline: "AgentTrust: Cryptographic Trust Boundary on Monad"<br>Graphic: Human Passkey (TouchID) -> `MandateManager.sol` on Monad -> Headless Agent (Scoped Execution) -> Independent Receipt. | "AgentTrust solves this with an immutable on-chain delegation boundary. Instead of handing agents raw keys, a human owner authorizes a scoped mandate with a single biometric tap of their device hardware passkey. The smart contract on Monad—not an off-chain API—is the enforcement boundary: allowlisted contracts, exact 4-byte selectors, hard spending caps, and isolated vault accounting." | Shows clean architecture where smart contract is the trust anchor. |
| **Slide 3: Why Monad?** (0:50 - 01:15) | Headline: "Why Monad is the Only Chain for Autonomous Delegation"<br>Bullets:<br>1. Native RIP-7212 Precompile (`0x0100`) at 6,900 gas (~50x cheaper).<br>2. Live ERC-8004 Agent Identity Registry composability.<br>3. 10,000 TPS & sub-second consensus. | "Why Monad? Because Monad provides the critical cryptographic primitive that makes hardware passkey delegation viable: the native RIP-7212 P-256 precompile at 0x0100. We verified it live on testnet: 6,900 gas per Monad docs—roughly 50 times cheaper than Solidity byte-code verifiers. Combined with Monad's live ERC-8004 agent identity registry and low-latency blocks, agents can execute high-frequency tool calls with instant cryptographic receipts." | Unlocks Monad's unique technical advantages. |
| **Slide 4: Market Wedge & Monetization** (01:15 - 01:40) | Headline: "The Wedge: 15-Minute SDK Integration"<br>Table: Open-Source SDK (Free) -> Hosted Relayer (Usage Fee) -> Enterprise Compliance Dashboard ($499/mo) -> Counterparty Audit API. | "Our commercial wedge is developers deploying agents on Monad with ERC-8004 identities and x402 payment streams. Instead of spending six months building and auditing custom delegation contracts, they install `@agenttrust/sdk` in 15 minutes. We monetize through hosted relayer bundlers for gasless passkey onboarding, enterprise treasury dashboards for institutional funds, and receipt audit APIs for counterparties." | Proves viable startup roadmap and monetization. |
| **Slide 5: Execution & The Metropolis Ask** (01:40 - 02:00) | Headline: "Technical Execution & The Ask"<br>Metrics: 29 Foundry Tests, 25 SDK Tests, Tested CLI, Live Precompile & Registry Proofs.<br>Ask: Monad Ecosystem Residency & Seed Grant. | "We’ve backed every claim with code: 29 Foundry tests, 25 SDK tests, and live testnet verification tools. With Metropolis support and Monad Ecosystem Residency, we will formally verify our contracts with Certora and launch at Monad mainnet genesis as the standard security perimeter for the agentic economy. AgentTrust: Sovereign passkeys, unbreakable mandates on Monad. Thank you." | Concludes with clear, actionable ask. |

---

## 📋 Recording Checklist for the Team

- [ ] **Microphone & Audio:** Clear voiceover with zero background noise.
- [ ] **Resolution:** 1080p 60fps screen recording.
- [ ] **Pacing:** Clear, measured cadence (keep demo under 3:00, pitch under 2:00).
- [ ] **Links in Description:** Include GitHub repo, testnet contract address, and documentation link.
