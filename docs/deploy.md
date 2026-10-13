# Deploying to Monad testnet

## 1. Deploy the contracts and record a full run

```bash
npm install
cd contracts && forge build && cd ..
cp .env.example .env            # set DEPLOYER_PRIVATE_KEY (funded from https://faucet.monad.xyz, see below for how much)
npm run e2e -- --testnet
```

Fund the deployer with about **1.5 MON** at ~100 gwei. The three contract deploys cost about 0.35 MON (Monad bills the gas limit), the script sends 0.4 MON to the agent wallet, 0.1 MON to the stranger wallet and 0.03 MON into the mandate vault, and the rest pays relay, mint and deposit gas. The 0.4 MON goes to the agent even when you reuse `AGENT_PRIVATE_KEY`.

This script:

- deploys `AgentMandates` (pointing at the ERC-8004 Identity Registry `0x8004A818BFB912233c491871b3d84c89A494BD9e` and the P-256 precompile `0x0100`), a `MockTarget`, and a `MockERC20` test stablecoin (recorded as `contracts.testUsdc`)
- registers a fresh agent wallet in ERC-8004
- signs a mandate with a software passkey and relays it, funds its token vault, then runs an allowed call and an allowed token payment, four blocked calls (mined as reverts so they are on record), a passkey revoke, one more call after the revoke (also mined as a revert) and withdrawals of both vaults
- writes every address and transaction hash to `deployments.mandates.json`

Keep the agent key if you want the console and MCP demos to reuse that agent. To do that, set `AGENT_PRIVATE_KEY` in `.env` before running.

To deploy without the scenario run:

```bash
cd contracts
forge script script/DeployAgentMandates.s.sol --rpc-url https://testnet-rpc.monad.xyz --broadcast --private-key $DEPLOYER_PRIVATE_KEY
```

## 2. Configure the console (Vercel)

In the Vercel project settings, under Environment Variables:

| Variable | Value |
|---|---|
| `NEXT_PUBLIC_AGENT_MANDATES_ADDRESS` | `contracts.agentMandates` from `deployments.mandates.json` |
| `NEXT_PUBLIC_DEMO_AGENT` | `agent` from `deployments.mandates.json` (prefills the form) |
| `NEXT_PUBLIC_DEMO_AGENT_ID` | `agentId` |
| `NEXT_PUBLIC_DEMO_TARGET` | `contracts.mockTarget` |
| `NEXT_PUBLIC_DEMO_TOKEN` | `contracts.testUsdc` (prefills the stablecoin budget) |
| `NEXT_PUBLIC_DEMO_PAYEE` | any address that may receive the test token: `merchant` from `deployments.mandates.json` when your e2e run wrote one (the committed file has none), or your own address. If you set no payee, leave `NEXT_PUBLIC_DEMO_TOKEN` unset too, or the prefilled grant fails with "Stablecoin budget needs a token address and a payee address" |
| `NEXT_PUBLIC_DEMO_MANDATE_ID` | a **live** (not revoked) mandate ID for the Verify page; the e2e run revokes its own mandate at the end, so grant a fresh one in the console. Visitors who grant their own mandate see theirs instead |
| `JUDGE_AGENT_ID` | optional, the relayer's ERC-8004 agent ID for Judge Mode. If unset, the first run registers one (one extra transaction) and logs `set JUDGE_AGENT_ID=<id>` in the function logs; set it to skip that step |
| `JUDGE_TARGET` | optional, the contract Judge Mode's agent may call (defaults to the MockTarget in `deployments.mandates.json`, or `NEXT_PUBLIC_DEMO_TARGET`) |
| `JUDGE_MODE_VERSION` | optional, set to `v1` to run Judge Mode against the old MandateManager instead of AgentMandates |
| `NEXT_PUBLIC_MOCK_TARGET_ADDRESS` | optional, overrides the v1 MockTarget used by the Lab pages and `JUDGE_MODE_VERSION=v1` |
| `NEXT_PUBLIC_SITE_URL` | optional, the public URL used for social preview images |
| `RELAYER_PRIVATE_KEY` | a **separate** key that pays gas for passkey users and for Judge Mode, where it also acts as the ERC-8004 agent (server-side only). Fund it with at least 1 MON: Monad bills the gas limit, so one Judge Mode run costs roughly 0.1 to 0.15 MON at ~100 gwei. The Judge Mode page shows the exact amount a run needs |
| `RELAYER_SPONSOR_MAX_WEI` | optional, the most MON the relayer puts into each new mandate's vault, in wei. Unset means `10000000000000000` (0.01 MON); `0` turns sponsorship off. On top of it the relayer allows at most 0.02 MON per IP and 0.2 MON in total per day. When it cannot sponsor (cap reached or low balance) it still relays the grant, with an empty vault. Note that `.env.example` ships `RELAYER_SPONSOR_MAX_WEI=0` (off) |

Redeploy. The status chips at the top of the **Passkey Mandates** page should show the contract and "Gas relayer online". Every page has its own link, e.g. `/#judge`, `/#passkey`, `/#verify`.

The relayer key can only pay gas and the optional capped sponsorship. It has no authority over any mandate.

## 3. Point an agent at it (MCP)

```bash
npm run build:mcp
AGENTTRUST_CONTRACT=0x… AGENTTRUST_MANDATE_ID=<your mandate id> AGENT_PRIVATE_KEY=0x… node packages/mcp/dist/index.js
```

Or add the JSON block from the README to Claude Desktop or Claude Code. Use the mandate ID you created in the console, with the agent key that matches its agent wallet.

## Judge access

Judges need no wallet and no MON. They open the console, create a passkey, and sign a mandate; the relayer submits it. The checkAction verifier is read-only. `npm run e2e` reproduces the whole lifecycle locally with no keys at all.
