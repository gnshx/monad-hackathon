# Deploying to Monad testnet

## 1. Deploy the contracts and record a full run

```bash
npm install
cd contracts && forge build && cd ..
cp .env.example .env            # set DEPLOYER_PRIVATE_KEY (funded from https://faucet.monad.xyz, about 0.3 MON is plenty)
npm run e2e -- --testnet
```

This script:

- deploys `AgentMandates` (pointing at the ERC-8004 Identity Registry `0x8004A818BFB912233c491871b3d84c89A494BD9e` and the P-256 precompile `0x0100`) and a `MockTarget`
- registers a fresh agent wallet in ERC-8004
- signs a mandate with a software passkey and relays it, then runs an allowed call, three blocked calls (mined as reverts so they are on record), a passkey revoke and a withdrawal
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
| `NEXT_PUBLIC_DEMO_PAYEE` | `merchant` (the payee allowed to receive the token) |
| `NEXT_PUBLIC_DEMO_MANDATE_ID` | a **live** (not revoked) mandate ID for the Verify page; the e2e run revokes its own mandate at the end, so grant a fresh one in the console. Visitors who grant their own mandate see theirs instead |
| `NEXT_PUBLIC_MOCK_TARGET_ADDRESS` | optional, overrides the v1 MockTarget that Judge Mode calls (defaults to the recorded testnet one) |
| `NEXT_PUBLIC_SITE_URL` | optional, the public URL used for social preview images |
| `RELAYER_PRIVATE_KEY` | a **separate**, lightly funded key that pays gas for passkey users (server-side only) |
| `RELAYER_SPONSOR_MAX_WEI` | optional demo vault funding per mandate, e.g. `10000000000000000` (0.01 MON); `0` to disable |

Redeploy. The status chips at the top of the **Passkey Mandates** page should show the contract and "Gas relayer online". Every page has its own link, e.g. `/#judge`, `/#passkey`, `/#verify`.

The relayer key can only pay gas and the optional capped sponsorship. It has no authority over any mandate.

## 3. Point an agent at it (MCP)

```bash
npm run build:mcp
AGENTTRUST_CONTRACT=0x… AGENTTRUST_MANDATE_ID=1 AGENT_PRIVATE_KEY=0x… node packages/mcp/dist/index.js
```

Or add the JSON block from the README to Claude Desktop or Claude Code. Use the mandate ID you created in the console, with the agent key that matches its agent wallet.

## Judge access

Judges need no wallet and no MON. They open the console, create a passkey, and sign a mandate; the relayer submits it. The checkAction verifier is read-only. `npm run e2e` reproduces the whole lifecycle locally with no keys at all.
