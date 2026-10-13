# Demo video (≤ 3 min) and pitch video (≤ 2 min)

## Before recording

1. Deploy and configure the console as described in [deploy.md](deploy.md). Then open https://monad-hackathon-amber.vercel.app on a laptop with Touch ID, or a phone with Face ID.
2. Have the MCP server configured in Claude Desktop or Claude Code for the demo agent (the MCP snippet on the console's **Developers** page, filled from `deployments.mandates.json`).
3. Open a Monad explorer tab for the AgentMandates contract.

## Technical demo: 3 minutes, live product only

| Time | Screen | Say |
|---|---|---|
| 0:00–0:15 | **Home** page (the mandate card animates allowed and blocked calls) | "AI agents need to spend money, and today that means handing them a private key. AgentTrust gives the agent a budget instead, signed with a passkey and enforced by Monad." |
| 0:15–0:35 | **Passkey Mandates** → **Create passkey** → Touch ID | "There's no wallet and no seed phrase. My passkey's public key is my on-chain identity, and the private key never leaves the secure enclave." |
| 0:35–1:05 | **Grant a mandate**: pick the *Pay-per-call API agent* preset, point at the **You are signing** summary → **Sign with passkey & create** → Touch ID → the mandate card appears → open the tx in the explorer | "One tap. The relayer pays the gas, so I never need MON. On-chain, Monad's P-256 precompile verifies the WebAuthn assertion, checks it was user-verified, and binds it to these exact terms, this chain and this contract." |
| 1:05–1:45 | Switch to Claude with the AgentTrust MCP server. Ask: "Check what you're allowed to do, then call doSomething(1) with 0.005 MON." → it calls `mandate_status`, then `execute_action` → tx hash | "My agent runs in Claude with our MCP server. It reads its mandate and acts inside it. The contract also re-checked that this wallet is still the agent's ERC-8004 identity." |
| 1:45–2:10 | Ask: "Now send 0.5 MON to it" → `blockedBy: ExceedsPerCallLimit`. Ask it to send funds to another address → `PermissionDenied` | "Here I play the attacker, as if the prompt were injected. The contract refuses, and the agent gets the exact rule it broke. A compromised model can never get past what I signed." |
| 2:10–2:30 | Console: the spend meter has moved. **Verify an Agent** → **Run all 5 checks** → one ALLOWED, four BLOCKED with reasons | "Any app or contract can ask the chain the same question before serving an agent, with no API key and no platform in between." |
| 2:30–2:50 | **Emergency: revoke all** → Touch ID. Back in Claude: try again → `MandateInactive` | "One tap kills every mandate this passkey has issued, and the agent is cut off immediately." |
| 2:50–3:00 | README / repo | "It's open source: a contract, an SDK and an MCP server, with 142 passing tests across contract, SDK, web, and MCP suites." |

Fallback if the passkey prompt misbehaves on camera: open `/#judge` and click **Run the live sequence**. It runs the same lifecycle as six live testnet transactions with explorer links. From a terminal, `npm run e2e -- --testnet` does the same.

## Pitch: 2 minutes

**[0:00–0:20] Who and why.** "I'm ___. I build AI agents, and every time an agent needs to pay for something, I end up pasting a private key into an environment file. That key is one prompt injection away from being drained."

**[0:20–0:45] Problem.** "Agents are becoming economic actors: they pay for APIs, trade and buy compute. The existing answers either put a company in the middle, like custodial agent wallets and policy servers, or lock you into one wallet vendor with session keys. Users get no simple, portable way to say 'this agent may spend this much on this, and nothing else.'"

**[0:45–1:15] What we built.** "AgentTrust is a primitive on Monad. A human signs a mandate with a passkey, Face ID or Touch ID, and Monad's native P-256 precompile verifies it. The agent is an ERC-8004 identity, checked on every call. The contract enforces the limits: which contracts, which functions, how much per call and in total, and until when. One tap revokes everything. Anyone, from a merchant to an API to another contract, can call `checkAction` to verify the agent is authorized. There's no server and no token, and nobody in the middle can capture it."

**[1:15–1:40] Who uses it.** "Agent builders use our MCP server, so a Claude or Cursor agent gets a bounded wallet from one config block. Frameworks use the SDK. Pay-per-call APIs use `checkAction` to know a real human stands behind an agent. ERC-8004 explorers use it to show what each agent is allowed to do."

**[1:40–2:00] Next.** "Next, we publish the packages, ship ElizaOS and LangChain adapters, add ERC-20 and rolling budgets, and deploy to mainnet. We're asking Metropolis teams to integrate it now. It takes ten minutes. Give your agent a budget, not your keys."

## 30-second ad (optional)

Show a phone with Face ID, then text on screen: "Your AI agent wants your keys." → "Give it a budget instead." Tap. Cut to Claude: "Blocked: ExceedsPerCallLimit". Tap "Emergency: revoke all". End card: "AgentTrust · passkey mandates on Monad."
