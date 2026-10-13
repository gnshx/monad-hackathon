# Demo video (3:00) and pitch video (2:00)

Both scripts use only the live console, so nothing depends on a local setup. Speak at a normal pace: the demo narration is about 390 words, the pitch about 270.

## Before you hit record

1. The relayer has at least 1 MON. Open `/#judge`: the chip should say **Monad Testnet · 10143 · live** with no "low on funds" warning.
2. Use a laptop with Touch ID or Windows Hello, or a phone with Face ID, in Chrome. Use a fresh browser profile so **Your mandates** starts empty.
3. Open these tabs in order: `/#home`, `/#passkey`, `/#verify`, `/#judge`, `/#docs`.
4. Do one dry run of the whole script. Then click **Revoke** on the dry-run mandate, or switch profiles, so the real take starts clean.
5. Record at 1440×900 or larger, with browser zoom at 100%.

## Demo script: 3 minutes, click by click

| Time | Click | Say |
|---|---|---|
| **0:00–0:15** | `/#home`. Let the mandate card animate ALLOWED and BLOCKED for a few seconds. | "AI agents need to spend money, and today that means pasting a private key into an env file. One prompt injection and it's drained. AgentTrust gives the agent a budget instead: signed with a passkey, enforced by Monad." |
| **0:15–0:35** | Click **Try it with your passkey**. On step 1, click **Create passkey** and confirm with Touch ID. The step turns to "Passkey ready". | "No wallet, no seed phrase, no MON. My passkey's public key becomes my on-chain identity, and the private key never leaves this laptop's secure chip." |
| **0:35–1:05** | Click the **Pay-per-call API agent** preset. Point at the **You are signing** box. Click **Sign with passkey & create** and touch ID. The green "Mandate created" toast appears and the card shows under **Your mandates** with its spend meter. Click the tx link to show the explorer for two seconds, then come back. | "I pick a preset: this agent, which is an ERC-8004 identity, may call one function on one contract, 0.005 MON per call, 0.02 in total, for 7 days. This box is exactly what I'm signing, in plain English. One tap. A relayer pays the gas, and Monad's P-256 precompile verifies my WebAuthn signature on-chain. That's a real transaction." |
| **1:05–1:40** | Click **Verify an Agent** in the sidebar. It already shows the mandate just created. Click **Run all 5 checks**. One ALLOWED and four BLOCKED appear, and the scoreboard reads 5/5 as expected. | "Now I play the attacker. Any app or contract can ask the chain one question, `checkAction`: is this agent allowed to do this, right now? The normal call is allowed. An overspend: blocked, ExceedsPerCallLimit. A rogue contract: blocked. A function I didn't allow: blocked. A different wallet pretending to be my agent: blocked. Those reasons come straight from the contract." |
| **1:40–2:15** | Click **Judge Mode**, then **Run the live sequence**. While it runs, the highlight walks down the six steps. When the scoreboard shows 3 went through, 3 blocked, 6/6 as expected, open one red **Open in explorer** link. | "Reads are nice, but here the same rules are hit with real transactions. Six live transactions on Monad: create, an allowed spend, an overspend, a rogue target, the owner revokes, and the agent tries again. Three go through and three are reverted by the contract, and every one is on the explorer." |
| **2:15–2:40** | Back to **Passkey Mandates**. On the mandate card click **Revoke** and touch ID. The card turns to Revoked. Click **Verify an Agent**, then **Run all 5 checks**: every row is BLOCKED, and the normal call now says `MandateInactive`. | "If anything looks off, one tap revokes it. Run the checks again and every call is refused, even the one that was fine a minute ago: MandateInactive. The agent is cut off at the chain level, not by a server I have to trust." |
| **2:40–3:00** | Click **Developers**. Click the **MCP (Claude, Cursor)** tab, then **Copy**. Hover the deployed addresses. | "For builders, it's one contract, a TypeScript SDK, a Solidity hook and an MCP server, so a Claude or Cursor agent gets a bounded wallet from one config block. It's open source with 144 passing tests. AgentTrust: give your agent a budget, not your keys." |

**If something misbehaves on camera:**
- The passkey prompt doesn't appear: reload and try once more in Chrome, otherwise skip to Judge Mode at 1:40 and say "the same lifecycle, signed by a test passkey on the server." (**I already have one** only recovers a passkey this site created before.)
- Judge Mode says the relayer is low on funds: the warning names the address and the amount. Fund it and reload.
- Judge Mode is cooling down (one run per 2 minutes): wait for the countdown, or cut the wait in editing.

## Pitch script: 2 minutes

**[0:00–0:15] Hook.**
"Every AI agent that pays for anything today holds a private key. That key is one prompt injection away from being emptied. We think agents should get a budget, not your keys."

**[0:15–0:40] The problem.**
"Agents are becoming economic actors. They pay for APIs, buy compute and trade. The options today are a company in the middle, holding custodial wallets or running a policy server, or lock-in to one wallet vendor's session keys. There's no open, portable way for a person to say: this agent may spend this much, on this, until then, and nothing else."

**[0:40–1:10] What we built.**
"AgentTrust is that primitive, on Monad. You sign a mandate with a passkey, Face ID or Touch ID, and Monad's native P-256 precompile verifies it on-chain. The agent is an ERC-8004 identity, re-checked on every call. The contract enforces which contracts and functions, how much per call, the total budget in MON or stablecoins, and the expiry. One tap revokes everything. And anyone, a merchant, an API or another contract, can call `checkAction` to see whether an agent is authorized before serving it."

**[1:10–1:30] Why it's infrastructure.**
"There's no server, no token and no vendor in the trust path. The owner's key lives on their device, the agent's identity is an open record, and the rules sit in a public contract. A relayer can pay gas, but it can never forge or change an action."

**[1:30–1:50] Who uses it.**
"Agent builders plug in our MCP server, so a Claude or Cursor agent gets a bounded wallet from one config block. Frameworks use the SDK. Pay-per-call APIs use `checkAction` to know a real human stands behind the agent."

**[1:50–2:00] Close.**
"It's live on Monad testnet today. Judges can run six real transactions with one click and no wallet. AgentTrust: give your agent a budget, not your keys."

## 30-second ad (optional)

A phone with Face ID, with text on screen: "Your AI agent wants your keys." Then "Give it a budget instead." Tap. Cut to Verify: a red "BLOCKED: ExceedsPerCallLimit". Tap **Revoke**. End card: "AgentTrust · passkey mandates on Monad."
