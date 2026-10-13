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
- Live console: https://monad-hackathon-amber.vercel.app
- AgentMandates on Monad testnet: `0xc911e902bf3b3f532bffc1a988e2d00969a1237c`
- MandateManager (v1) on Monad testnet: `0x3550f9fc84640a9cfd7c51330615a1e05cb948be`
- Demo video (≤3 min): `<link>`
- Pitch video (≤2 min): `<link>`

**Judge access instructions**

Nothing to install. You need no wallet, no MON and no login. Passkeys are created on your own device, and the relayer pays gas.

*Fastest path (1 minute):* open https://monad-hackathon-amber.vercel.app/#judge and click **Run the live sequence**. Six real Monad testnet transactions run in order: create a passkey-signed mandate, an allowed call, an overspend (blocked), a rogue target (blocked), an owner revoke, and a call after the revoke (blocked). Each step links to the explorer.

*Full path (3 minutes):*
1. Open https://monad-hackathon-amber.vercel.app/#passkey and click **Create passkey**. Confirm with Touch ID, Face ID, Windows Hello or a security key.
2. The form is prefilled with a demo agent registered in ERC-8004. Read the **You are signing** summary, then click **Sign with passkey & create**. The mandate appears under **Your mandates** with a link to the transaction.
3. Open **Verify an Agent** (`/#verify`). It loads the mandate you just created. Click **Run all 5 checks**: the normal call is ALLOWED, and the overspend, rogue target, wrong function and impostor agent are BLOCKED, each with the contract's reason.
4. Back on **Passkey Mandates**, click **Revoke** (one more passkey tap). Run Verify again and every check now says `MandateInactive`.
5. **Developers** (`/#docs`) has the MCP config, the SDK and a Solidity snippet, plus the deployed addresses.
6. To reproduce from source with no keys: `npm install && cd contracts && forge build && cd .. && npm run e2e`.

**Tech:** Solidity 0.8.24 (Foundry), WebAuthn/P-256 via precompile `0x0100`, ERC-8004 Identity Registry `0x8004A818BFB912233c491871b3d84c89A494BD9e`, viem, Next.js 15, MCP SDK.

## Deliverables checklist

- [x] Logo: `docs/assets/agenttrust_logo.jpg` (JPG, under 3 MB)
- [x] Console redesign with deep links, Judge Mode, Verify page and README product tour (`docs/assets/screens/`)
- [x] Testnet deployment recorded in `deployments.mandates.json` (AgentMandates `0xc911e902…237c`)
- [ ] Repository public, with access for metropolis@hackathon.monad.xyz
- [ ] Vercel env vars imported (see `docs/deploy.md`) and the console redeployed
- [ ] Relayer funded with testnet MON. Judge Mode needs at least 0.005 MON per run, and the passkey relayer also pays gas for every grant and revoke
- [ ] `NEXT_PUBLIC_DEMO_MANDATE_ID` set to a live mandate: grant one in the console, then copy its number. The e2e run revokes mandate #1
- [ ] Smoke test on the live URL: `/#judge` run is green, `/#passkey` create + grant + revoke works, `/#verify` shows 5/5
- [ ] Demo video recorded (script: `docs/demo-and-pitch.md`)
- [ ] Pitch video recorded (script: `docs/demo-and-pitch.md`)
- [ ] Submission form filled with the copy above and the two video links
- [ ] Optional 30-second ad
