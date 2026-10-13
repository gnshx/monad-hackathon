# Submission copy (Metropolis · Trust, Identity & AI Infrastructure)

Paste-ready text for the portal. Fill in the placeholders in angle brackets once the testnet deploy and the videos are done.

**Project name:** AgentTrust

**One-liner:** Passkey-owned spending mandates for AI agents on Monad. Give your agent a budget, not your keys.

**Short description (≈60 words)**
AgentTrust is an open primitive for delegating spending authority to AI agents. A human signs a mandate with a passkey; Monad's P-256 precompile verifies it on-chain. The agent, an ERC-8004 identity checked on every call, can only make allowlisted calls within per-call caps, budgets (MON and stablecoins) and an expiry. One tap revokes everything. Any app can verify an agent's authority with `checkAction`.

**Why this track**
- *Protocol, not product:* a single contract (`AgentMandates`), an SDK and an MCP server that other apps build on. The console is a reference client.
- *Uses Monad's building blocks:* the native P-256 precompile for WebAuthn, and the ERC-8004 Identity Registry as the agent identity, re-checked on every execution.
- *Not capturable:* the owner's identity is a key on their own device, the agent's identity is an open ERC-8004 record, and the rules live in an immutable public contract. There is no server, token or vendor in the trust path, and relayers can't forge or alter actions.

**Who adopts it:** MCP/agent builders (bounded wallets from one config block), agent frameworks (an on-chain-enforced `execute`), pay-per-call APIs and x402-style merchants (`checkPayment` before serving), ERC-8004 explorers (`mandatesForAgent`). Details: `docs/adoption.md`.

**Links**
- Repo: https://github.com/gnshx/monad-hackathon (make sure metropolis@hackathon.monad.xyz has access)
- Live console: https://agenttrust.vercel.app
- AgentMandates on Monad testnet: `<address from deployments.mandates.json>`
- Demo video (≤3 min): `<link>`
- Pitch video (≤2 min): `<link>`

**Judge access instructions**
1. Open https://agenttrust.vercel.app. The **Passkey Mandates** tab is the default.
2. Click **Create passkey** and confirm with Touch ID, Face ID, Windows Hello or a security key. No wallet, account or MON is needed.
3. The form is prefilled with a demo agent registered in ERC-8004. Click **Sign with passkey & create**. The relayer submits it, and it appears under **Your mandates** with a link to the transaction.
4. Click **Revoke** or **Revoke every mandate** (one more passkey tap), and watch the status change on-chain.
5. In **Verify an agent's authority**, run `checkAction()` against any mandate. It is read-only.
6. To reproduce everything from source with no keys: `npm install && cd contracts && forge build && cd .. && npm run e2e`.

No test login credentials are needed. Passkeys are created on the judge's own device, and the relayer pays the gas.

**Tech:** Solidity 0.8.24 (Foundry), WebAuthn/P-256 via precompile `0x0100`, ERC-8004 Identity Registry `0x8004A818BFB912233c491871b3d84c89A494BD9e`, viem, Next.js 15, MCP SDK.

## Deliverables checklist

- [ ] Logo: `docs/assets/agenttrust_logo.jpg` (JPG, under 3 MB)
- [ ] Repository public, with access for metropolis@hackathon.monad.xyz
- [ ] `npm run e2e -- --testnet` run, and `deployments.mandates.json` committed
- [ ] Vercel env vars set (see `docs/deploy.md`) and the console redeployed
- [ ] Demo video recorded from the live console + Claude with the MCP server (script: `docs/demo-and-pitch.md`)
- [ ] Pitch video recorded (script: `docs/demo-and-pitch.md`)
- [ ] Optional 30-second ad
