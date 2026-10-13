# Security model

AgentMandates protects a human's funds from their own AI agent. The agent's key is assumed to be compromised: prompt injection, a malicious tool, a leaked environment variable. The contract is the only component that has to be correct. The SDK, MCP server, relayer and console are conveniences, and each of them can be malicious without breaking the guarantees below.

## Guarantees

| # | Guarantee | Enforced by |
|---|---|---|
| G1 | Only the owner's passkey can create, revoke or withdraw from a mandate | `WebAuthnP256.verify` against the passkey stored for `ownerKey` |
| G2 | A relayer cannot alter what the owner signed | Every term (agent, agent ID, permissions, caps, expiry, recipient, amount) is inside the signed digest |
| G3 | Signatures cannot be replayed | Per-owner nonce, plus `block.chainid` and `address(this)` in every digest, plus a distinct typehash per action |
| G4 | Only the named agent wallet can execute | `msg.sender == mandate.agent` |
| G5 | The agent must still hold its ERC-8004 identity | `getAgentWallet(agentId)` or `ownerOf(agentId)` must equal the agent, checked at creation **and on every execute**. Fails closed if the registry reverts |
| G6 | The agent can only call what was allowed | `(target, selector)` allowlist. The selector is read from the calldata itself, never trusted from an argument. Plain transfers need an explicit wildcard. A wildcard never covers the allowance calls listed in G12 |
| G7 | The agent cannot spend more than allowed | `value ≤ maxPerCall`, `spent + value ≤ budget`, `value ≤ vault balance`. Fuzzed: `spent ≤ budget` and `balance + spent == deposits` |
| G8 | One mandate's funds are isolated from another's | Per-mandate `balance` |
| G9 | The owner can stop everything at once | `revokeAll` bumps the owner's epoch; mandates from older epochs fail `_isLive` |
| G10 | No reentrancy into accounting | Checks-effects-interactions and `nonReentrant` on every function that moves funds |
| G11 | ERC-20 spending is capped and isolated | `payToken` checks a signed per-token cap and budget, an allowlisted payee and a per-mandate token balance. Deposits credit the amount actually received |
| G12 | No mandate can move another mandate's funds | AgentMandates is `msg.sender` of every `execute()` call and holds every token vault, so two guards apply. (1) Tokens are flagged `isVaultToken` when a grant budgets them (if they answer ERC-20 `allowance()`) and on every deposit; `execute()` refuses to call a flagged token (`TargetIsVaultToken`) or AgentMandates itself. (2) On **any** target, even under a wildcard, `execute()` refuses calls that grant or spend an allowance: `approve`, `increaseAllowance`, `increaseApproval`, both `approveAndCall`, `setApprovalForAll`, `authorizeOperator`, `transferFrom`, both `transferFromAndCall` and `burnFrom` (`PermissionDenied`). `checkAction` reports the same |

## WebAuthn verification

`contracts/src/lib/WebAuthnP256.sol` accepts an assertion only if all of these hold:

1. `authenticatorData` is at least 37 bytes, and the flags have both **UP** (user present) and **UV** (user verified, i.e. biometric or PIN) set.
2. `clientDataJSON` contains `"type":"webauthn.get"` at `typeIndex`. This rejects output from the registration ceremony (`webauthn.create`).
3. `clientDataJSON` contains `"challenge":"<base64url(digest)>"` at `challengeIndex`, followed by a closing quote.
4. `0 < r < n` and `0 < s ≤ n/2`, so malleated high-S signatures are rejected. The SDK normalizes s to the low half, since authenticators return either half.
5. The P-256 verifier (Monad's precompile at `0x0100`) returns exactly 32 bytes equal to 1 for `sha256(authenticatorData ‖ sha256(clientDataJSON))`. Empty or zero output fails.

Public keys are checked to be valid affine points on P-256 (`y² = x³ − 3x + b mod p`, coordinates below p) before they are stored.

**Origin.** The contract does not parse `origin` from `clientDataJSON`. Passkeys are scoped to the relying party by the browser, so a phishing site cannot obtain an assertion for our credential. The rpIdHash is part of the signed `authenticatorData`, so it cannot be altered after signing.

## Tests

`contracts/test/AgentMandates.t.sol` uses real P-256 keys (`vm.signP256`) and a real RIP-7212 implementation etched at `0x0100`. There is no mock verifier. The tests cover:

- Relayed creation, wrong passkey, tampered terms, replay, cross-chain replay, missing UV, `webauthn.create` type, high-S and off-curve keys
- ERC-8004: unbound agent, unknown agent ID (registry reverts), NFT owner accepted, wallet rotated after creation
- Execution: stranger, wrong target, wrong selector, plain transfer without wildcard, per-call cap, budget, vault isolation and expiry
- Owner controls: relayed revoke, revoke with the wrong key, revoke-all, withdraw, and a relayer trying to redirect a withdrawal
- ERC-20: payments within caps, per-call/budget/payee/agent checks, unlisted tokens, a generic call trying to drain custodied tokens, `approve` before a token's first deposit, `transferFrom` of a depositor's approval before the deposit, every refused allowance call under a wildcard, grant-time flagging (non-tokens are not flagged), no-return (USDT-style) tokens, withdrawal and revoke
- `checkAction`/`checkPayment` reasons, plus a fuzzed budget invariant

`contracts/test/DigestVector.t.sol` and `packages/sdk/test/mandates.test.ts` assert the same digest vectors, so the off-chain signer and the contract cannot drift apart.

## Known limits

- **Deployed testnet build predates the G12 allowance guard.** The AgentMandates contract at `0xc911e902bf3b3f532bffc1a988e2d00969a1237c` only refuses tokens after their first deposit. On it, a mandate allowed to call a not-yet-deposited token can `approve` an attacker, or `transferFrom` a depositor's approval made before `depositToken`, and later drain that token's pooled vaults. The test USDC there is already flagged. Redeploy with `npm run e2e -- --testnet` to pick up the guard.
- **The G12 guard is a blocklist, not isolation.** It covers the standard allowance functions. A token with a non-standard way to approve, or a second address for the same balances (double-entry tokens), can still get around it. The planned full fix runs each mandate's `execute()` through its own executor contract that holds no vault funds, so nothing it approves or pulls can touch another mandate's tokens.
- **ERC-20 through `execute`.** Token caps apply to `payToken`. `execute` cannot pull tokens through an approval (`transferFrom` is refused, see G12). On a token the contract does not custody, only the function allowlist applies.
- **Passkey loss.** If the owner loses every device with the passkey (and it is not synced), they can no longer revoke. Mandates still expire. Multi-passkey owners and a recovery passkey are on the roadmap.
- **Relayer censorship.** A relayer can refuse to forward an action. Anyone else can submit the same signed payload, including the owner from any wallet. The console falls back to an injected wallet when no relayer is configured.
- **Public key storage.** The console stores the passkey's public key in browser storage. On a new device, the user re-imports it (the on-chain `passkeys` mapping holds it, keyed by `ownerKey`).
- **Not audited.** This is hackathon code.
