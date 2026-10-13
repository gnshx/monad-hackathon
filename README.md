<p align="center">
  <img src="./docs/assets/agenttrust_logo.jpg" alt="AgentTrust" width="140" />
</p>

<h1 align="center">AgentTrust</h1>

<p align="center"><strong>Passkey-owned spending mandates for AI agents, enforced on Monad.</strong><br/>
Give your agent a budget, not your keys.</p>

<p align="center">
  <a href="https://monad-hackathon-amber.vercel.app">Live console</a> ·
  <a href="#quickstart">Quickstart</a> ·
  <a href="#integrate">Integrate</a> ·
  <a href="docs/security.md">Security model</a> ·
  <a href="docs/adoption.md">Adoption plan</a> ·
  <a href="docs/demo-and-pitch.md">Demo &amp; pitch scripts</a> ·
  <a href="docs/submission.md">Submission</a>
</p>

---

## The problem

AI agents now pay for APIs, trade, mint and tip. To do that they hold a private key, and whoever controls the model's context controls the key. One prompt injection, hallucinated tool call or leaked `.env` file can drain everything the key can reach. The usual fixes move the problem instead of solving it: a custodial "agent wallet" service, a policy server you have to trust, or session keys tied to one wallet vendor.

## The primitive

**AgentMandates** is a single Monad contract that lets a human hand an agent a *mandate* instead of a key:

| | |
|---|---|
| **Owner = a passkey** | The mandate belongs to a P-256 public key (Face ID, Touch ID, Windows Hello, YubiKey), not to a wallet. Every owner action is a WebAuthn assertion, verified on-chain by Monad's P-256 precompile at `0x0100`. |
| **Relayable, gasless for the human** | Because the signature *is* the authorization, anyone can submit it. The human needs no wallet, seed phrase or MON. A relayer can delay an action but cannot forge or change one. |
| **Agent = an ERC-8004 identity** | The agent wallet must be the registered wallet (or owner) of its ERC-8004 identity. This is re-checked **on every call**, so rotating or losing that identity cuts the agent off immediately. |
| **Hard limits** | Allowlisted `(contract, function)` pairs, a per-call cap, a lifetime budget, an expiry and an isolated per-mandate vault. Everything is enforced in the contract, nothing in the agent. |
| **Stablecoin budgets** | Per-token caps (e.g. 10 USDC per call, 25 USDC total) to allowlisted payees, from an isolated token vault. Generic calls can never touch custodied tokens. |
| **One-tap kill switch** | `revoke(id)` stops one mandate. `revokeAll()` kills every mandate a passkey has ever issued, in one transaction. |
| **Composable verification** | `checkAction(id, agent, target, data, value)` runs exactly the checks `execute()` runs. Any contract, relayer, API or merchant can ask "did a human authorize this agent to do this?" before serving it. |

No platform sits in the middle. The owner's identity is a key on their own device, the agent's identity is an open ERC-8004 record, and the rules live in an immutable contract that anyone can read. There is no server, vendor or token for anyone to capture.

```
 Human (passkey)                Relayer (anyone)           Monad
 ───────────────                ────────────────           ─────────────────────────────────────────
 sign createMandate  ─────────▶ submit tx  ──────────────▶ AgentMandates
   WebAuthn assertion                                         ├─ P-256 precompile 0x0100: verify passkey
                                                              ├─ store terms, fund isolated vault
 AI agent (hot key)                                           │
 ──────────────────                                           │
 execute(target, data, value) ───────────────────────────────▶├─ ERC-8004: agent wallet still bound?
                                                              ├─ allowlist, per-call cap, budget, expiry
                                                              └─ call target, emit ActionExecuted
 Any app / contract
 ──────────────────
 checkAction(...)  ──────────────────────────────────────────▶ same checks, read-only
```

## Quickstart

Requirements: Node 20+, [Foundry](https://getfoundry.sh).

```bash
git clone https://github.com/gnshx/monad-hackathon.git && cd monad-hackathon
npm install
cd contracts && forge build && forge test && cd ..   # 72 tests; the AgentMandates suite uses real P-256 signatures
npm run e2e                                          # full lifecycle on a local chain with the P-256 precompile
```

`npm run e2e` starts anvil (Osaka hardfork, which has the same P-256 precompile at `0x0100` as Monad), deploys the contracts, and then:

1. Signs a mandate with a passkey; a relayer submits it and funds the vault.
2. The agent makes an allowed call and pays a merchant 10 test-USDC.
3. Over-limit (MON and USDC), wrong-target and stranger calls are sent anyway and revert on-chain.
4. The owner revokes with the passkey; the agent's next call reverts.
5. The owner withdraws the remaining MON and USDC to a cold wallet.

Gas measured in that run (Osaka P-256 precompile, same interface and cost as Monad's): `createMandate` ≈ 597k (stores terms, permissions, a token limit and indexes, and registers the passkey on first use), `execute` ≈ 120k and `payToken` ≈ 120k (both including two ERC-8004 registry reads), `revoke` ≈ 74k (including a full WebAuthn verification).

Add `--testnet` with `DEPLOYER_PRIVATE_KEY` set to run the same flow on Monad testnet and record every transaction in `deployments.mandates.json` ([deploy guide](docs/deploy.md)).

## Integrate

### Give an AI agent a bounded wallet (MCP)

Works with Claude Desktop, Claude Code, Cursor and any MCP client.

```json
{
  "mcpServers": {
    "agenttrust": {
      "command": "node",
      "args": ["/path/to/monad-hackathon/packages/mcp/dist/index.js"],
      "env": {
        "AGENTTRUST_CONTRACT": "0x<AgentMandates>",
        "AGENTTRUST_MANDATE_ID": "1",
        "AGENT_PRIVATE_KEY": "0x<agent hot key>"
      }
    }
  }
}
```

Build it with `npm run build:mcp`. Once the package is on npm, the command becomes `npx -y @agenttrust/mcp`. The agent gets four tools: `mandate_status`, `check_action`, `execute_action` and `pay_token`. A disallowed call comes back as `{ ok: false, blockedBy: "ExceedsPerCallLimit" }` before any gas is spent. Even if the model is fully compromised, the most it can do is spend the remaining budget on the calls the human allowed. See [`packages/mcp`](packages/mcp/README.md).

### Any LLM tool loop (Claude API, OpenAI, LangChain, Eliza)

```ts
import { AgentMandates, mandateTools } from '@agenttrust/sdk';

const tools = mandateTools(new AgentMandates(address, publicClient, agentWallet), mandateId);
// Give the model the schemas…
const schemas = tools.map(({ run, ...schema }) => schema); // name, description, input_schema
// …and dispatch its tool calls:
const result = await tools.find((t) => t.name === call.name)!.run(call.input);
// → { ok: true, transactionHash } or { ok: false, blockedBy: 'ExceedsPerCallLimit' }
```

### TypeScript SDK

```ts
import { AgentMandates, createBrowserPasskey, signWithBrowserPasskey, encode } from '@agenttrust/sdk';

const mandates = new AgentMandates(address, publicClient, walletClient);

// Owner (browser): one passkey prompt, no wallet
const { publicKey, credentialId } = await createBrowserPasskey('alice');
const challenge = await mandates.createChallenge(publicKey, terms);
const auth = await signWithBrowserPasskey(challenge, credentialId);
await fetch('/api/relay', { method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ data: encode.createMandate(publicKey, terms, auth) }) });

// Agent
await mandates.checkAction(id, agent, target, data, value); // { allowed: false, reason: 'ExceedsBudget' }
await mandates.execute(id, target, data, value);            // throws MandateDeniedError before spending gas
```

### Pay-per-call APIs: only serve agents a human authorized

[`examples/paid-api.ts`](examples/paid-api.ts) is an x402-style flow. The agent signs its request, and the API calls `checkPayment()` to confirm a live mandate lets this agent pay this price, then answers `402` with the price. The agent pays through `payToken()`, and the API verifies the `TokenPaid` event before serving. Replayed payments and claims on someone else's mandate are refused. Run it with `npm run e2e:serve`, then `npm run example:paid-api`.

### Solidity: gate agent traffic in your protocol

```solidity
(bool ok, ) = IAgentMandates(MANDATES).checkAction(mandateId, msg.sender, address(this), msg.data, msg.value);
require(ok, "agent not authorized by its owner");
```

## Contract API

| Function | Who | What |
|---|---|---|
| `createMandate(passkey, terms, assertion)` | anyone (relayer) | Creates a mandate signed by `passkey`. `msg.value` funds its vault. |
| `execute(id, target, data, value)` | the mandate's agent | Runs a call within the mandate. |
| `revoke(id, assertion)` | anyone (relayer) | Owner-signed revoke of one mandate. |
| `revokeAll(ownerKey, assertion)` | anyone (relayer) | Owner-signed revoke of every mandate from this passkey. |
| `withdraw(id, to, amount, assertion)` | anyone (relayer) | Owner-signed vault withdrawal to a signed recipient. |
| `deposit(id)` | anyone | Top up the MON vault. |
| `payToken(id, token, to, amount)` | the mandate's agent | Pay an allowlisted payee in an ERC-20, within that token's caps. |
| `depositToken(id, token, amount)` / `withdrawToken(id, token, to, amount, assertion)` | anyone / relayer (owner-signed) | Fund or drain the token vault. |
| `checkPayment(id, agent, token, to, amount)` | view | Token counterpart of `checkAction`. |
| `checkAction(id, agent, target, data, value)` | view | `(allowed, reasonSelector)` with the same checks as `execute`. |
| `getMandate`, `getPermissions`, `mandatesOf(ownerKey)`, `mandatesForAgent(agent)`, `remainingBudget`, `isActive` | view | State for UIs, indexers and agents. |
| `createDigest`, `revokeDigest`, `revokeAllDigest`, `withdrawDigest` | view | The exact challenge the passkey signs (mirrored in the SDK). |

Each digest commits to chain id, contract address, owner key and a per-owner nonce, so a signature can't be replayed across chains, deployments or actions. The full list of checks and their rationale is in [docs/security.md](docs/security.md).

## Repository

```
contracts/src/AgentMandates.sol        the primitive
contracts/src/lib/WebAuthnP256.sol     strict WebAuthn verification on the P-256 precompile
contracts/test/AgentMandates.t.sol     41 tests with real P-256 signatures + fuzzing
contracts/test/DigestVector.t.sol      digest vectors shared with the SDK tests
packages/sdk                           @agenttrust/sdk: client, digests, WebAuthn helpers
packages/mcp                           @agenttrust/mcp: MCP server for AI agents
apps/web                               console: passkey mandates, relayer API, verifier
scripts/mandates-e2e.ts                local + testnet end-to-end run
contracts/src/MandateManager.sol       v1 (wallet-owned mandates), kept for its recorded testnet evidence
```

## What's real & verified

| Component | Status | Proof / Evidence |
|---|---|---|
| **AgentMandates contract & WebAuthn** | Implemented & verified | 72 Foundry tests (contracts) + 34 SDK tests. Real P-256 signatures, fuzzed invariants, shared vectors. |
| **AgentMandates on Monad Testnet** | **Live on chain 10143** | Deployed at [`0xc911e902bf3b3f532bffc1a988e2d00969a1237c`](https://testnet.monadexplorer.com/address/0xc911e902bf3b3f532bffc1a988e2d00969a1237c). 8 mined testnet transactions in [`deployments.mandates.json`](deployments.mandates.json). |
| **MandateManager (v1)** | **Live on chain 10143** | Deployed at [`0x3550f9fc84640a9cfd7c51330615a1e05cb948be`](https://testnet.monadexplorer.com/address/0x3550f9fc84640a9cfd7c51330615a1e05cb948be). 8 mined testnet transactions verified 13/13 by `npm run verify:all`. |
| **Monad RIP-7212 Precompile** | **Proven live on chain 10143** | Live P-256 precompile at `0x0100` returns `uint256(1)` for valid signature; `0x` fail-closed for tampered (`npm run verify:p256`). |
| **ERC-8004 Identity Registry** | **Live integration on chain 10143** | Live agent #2304 registered at `0x8004A818BFB912233c491871b3d84c89A494BD9e` and re-verified on every call. |
| **Passkey flow in browser** | Implemented & deployed | Live at [https://monad-hackathon-amber.vercel.app](https://monad-hackathon-amber.vercel.app). Supports Face ID, Touch ID, Windows Hello. |
| **Gas relayer (`/api/relay`)** | Implemented & secured | Forwards only passkey-signed owner actions with simulation check, per-IP rate limits, and daily spend caps. |
| **MCP server (`@agenttrust/mcp`)** | Implemented & tested | 8/8 tests passing (`npm run test:mcp`), verified denial paths for over-limit, wrong target, and revoked mandates. |
| **Honest Disclosures** | Fully disclosed | No external third-party security audit yet. No external production adopters claimed. Spending caps enforce native MON and designated ERC-20 vault tokens. |

## Test Suite Matrix (142 / 142 Passing)

```bash
~/.foundry/bin/forge test --root contracts   # 72 passed (AgentMandates, MandateManager, DigestVector)
npm run test:sdk                              # 34 passed (Client, digests, WebAuthn integration)
npm run test:judge                            # 19 passed (Judge runner, honesty guards, rate limits, relay security)
npm run test:auditor                          #  9 passed (Strict testnet receipt & event auditor)
npm run test:mcp                              #  8 passed (MCP server tools & typed denial paths)
```

## License

MIT
