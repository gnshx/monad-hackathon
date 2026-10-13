# Adoption plan

## Who adopts this, and why they'd pick it over building their own

AgentMandates is infrastructure. Its users are developers who already have agents that need to move value, plus protocols that need to know whether an agent is allowed to act.

| Adopter | Their problem today | Why AgentMandates | Integration cost |
|---|---|---|---|
| **MCP tool and agent builders** (Claude/Cursor users, custom agent stacks) | An agent that pays for things needs a hot key in its environment, which is one prompt injection away from being drained | `npx @agenttrust/mcp`: the agent's key is useless outside the mandate. Users approve budgets with a passkey, not a seed phrase | One JSON block |
| **Agent frameworks** (ElizaOS plugins, LangChain/LangGraph tools, AgentKit-style toolkits) | Each framework reinvents "spending limits" in off-chain code that the agent process itself can bypass | `AgentMandates.execute` is a drop-in "send transaction" with limits enforced on-chain. `checkAction` gives tools a dry run with a precise denial reason | One SDK call per tool |
| **Pay-per-call APIs and x402-style merchants** | They can't tell if an agent paying them is acting for a real human or is a runaway loop | `checkAction(mandateId, agent, …)` proves a live, human-signed mandate before serving a request. Mandates link to an ERC-8004 identity | One view call |
| **ERC-8004 ecosystem** (registries, agent explorers, reputation and validation services) | Identity says *who* an agent is, not *what it may do* | Mandates are the authorization layer on top of ERC-8004 identity. `mandatesForAgent(agent)` lets explorers show each agent's live authority | Read-only |
| **Passkey and embedded-wallet apps on Monad** | Users with passkey accounts have no safe way to delegate to agents | Same P-256 key, same precompile. A passkey account can issue mandates directly | Contract call |

### Why not roll your own?

- **The WebAuthn details are easy to get wrong.** Type confusion, challenge binding, UV flags, low-S and on-curve keys are all handled here, each with a test using real signatures.
- **Session keys tie you to one smart-account vendor.** A mandate works with any EOA agent and any Monad contract, and needs no account migration.
- **Off-chain policy engines are trusted servers.** Here the policy is in a public contract, and anyone (including counterparties) can verify it.
- **ERC-8004 binding is checked on every call, not once.** Revoking an agent's identity revokes its spending authority.

## Hackathon traction (Oct 13–14)

- **Live, open primitive:** the contract on Monad testnet, the console at agenttrust.vercel.app, and MIT-licensed SDK and MCP packages.
- **Integration offer to other Metropolis teams:** any team with an agent that sends transactions can drop in the MCP server or `AgentMandates.execute` in under 15 minutes. The template is below. Every team that integrates is listed here with a link to their commit.

> Hey! We built AgentTrust for Metropolis: passkey-signed spending mandates for AI agents on Monad, with an ERC-8004-bound agent identity checked on every call. If your agent sends transactions, you can cap it in about 10 minutes: `npx @agenttrust/mcp` for MCP agents, or `mandates.execute(...)` from our SDK. Your users approve a budget with Face ID and can revoke in one tap. Happy to pair on it. The repo is github.com/gnshx/monad-hackathon

| Team | Integration | Link |
|---|---|---|
| *(open)* | | |

## After the event

**Weeks 1–2: make it installable**
- Publish `@agenttrust/sdk` and `@agenttrust/mcp` to npm with provenance.
- Ship an ElizaOS plugin and a LangChain tool wrapper as one-file examples.
- Deploy to Monad mainnet once the P-256 precompile and ERC-8004 registry addresses are final there.

**Weeks 3–6: features adopters ask for first**
- Rolling budgets (per day/week), so mandates don't need re-issuing.
- Multiple passkeys per owner and a recovery passkey.
- A subgraph/indexer for `MandateCreated` and `ActionExecuted`, so agent explorers can show authority and spend history.

**Weeks 6–12: distribution**
- Get listed as an authorization extension alongside ERC-8004 identity, reputation and validation.
- Integrations with 3 agent frameworks and 2 pay-per-call API providers on Monad.
- Apply for Monad ecosystem grants. Run an external review of `WebAuthnP256.sol` and `AgentMandates.sol`.

**Success metrics:** mandates created, distinct agent identities with live mandates, `checkAction` callers (contracts and API integrations), and value executed under mandates.
