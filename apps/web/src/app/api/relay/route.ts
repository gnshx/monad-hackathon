import { NextResponse } from 'next/server';
import { createWalletClient, formatEther, http, type Hex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { AGENT_MANDATES_ADDRESS, RPC_URL, monadTestnet, publicClient } from '../../../lib/agentMandates';
import { MANDATE_ERRORS } from '@agenttrust/sdk';
import {
  RelayPolicyTracker,
  relayConfigFromEnv,
  relayGasLimit,
  sponsorWithinBalance,
  validateRelayCalldata,
} from '../../../lib/relayPolicy';

export const dynamic = 'force-dynamic';

// RELAYER_SPONSOR_MAX_WEI caps the MON the relayer puts into a new vault (0 turns it off; unset = 0.01 MON).
const RELAY_CONFIG = relayConfigFromEnv();
const SPONSOR_MAX = RELAY_CONFIG.maxSponsorPerTxWei ?? 0n;
const policyTracker = new RelayPolicyTracker(RELAY_CONFIG);

// Monad charges the gas limit, so we size it from an estimate instead of a flat ceiling.
const MAX_RELAY_GAS = 1_200_000n;
// Typical passkey grant measured locally (~120k used); used to warn when the relayer runs low and
// to keep gas for a grant plus a revoke before any MON goes into a vault.
const TYPICAL_RELAY_GAS = 400_000n;

const FRIENDLY: Record<string, string> = {
  AgentIdentityMismatch: 'the agent address does not own that ERC-8004 agent ID. Check the agent wallet and agent ID.',
  InvalidSignature: 'the passkey signature did not verify. Try signing again.',
  PasskeyMismatch: 'this passkey does not own that mandate.',
  InvalidPasskey: 'the passkey public key is not a valid P-256 point.',
  InvalidTerms: 'the terms are invalid (check the caps, expiry and at least one permission).',
  MandateNotFound: 'that mandate does not exist.',
  MandateInactive: 'that mandate is already revoked or expired.',
  InsufficientBalance: 'the vault does not hold that much.',
  TokenNotAllowed: 'that token is not on this mandate.',
  TargetIsVaultToken: 'a token in the budget cannot also be a call target.',
};

/** Names the contract's custom error instead of showing its raw 4-byte selector. */
function explainRejection(e: any): string {
  const raw = `${e?.shortMessage || ''} ${e?.message || ''} ${e?.data || e?.cause?.data || ''}`;
  for (const sel of raw.match(/0x[0-9a-fA-F]{8}/g) || []) {
    const name = MANDATE_ERRORS[sel.toLowerCase()];
    if (name) return `${name}: ${FRIENDLY[name] || 'the contract rejected it.'}`;
  }
  return String(e?.shortMessage || e?.message || e).split('\n')[0];
}

const mon = (wei: bigint) => `${Number(formatEther(wei)).toLocaleString('en-US', { maximumFractionDigits: 4 })} MON`;

const gasPrice = () => publicClient().getGasPrice().catch(() => 0n);

/** Gas the relayer keeps for a typical grant plus a revoke; vault sponsorship never dips into it. */
const gasReserve = (price: bigint) => ((price * TYPICAL_RELAY_GAS * 3n) / 2n) * 2n;

function parseWei(v: unknown): bigint | null {
  if (v === undefined || v === null || v === '') return 0n;
  try {
    const wei = BigInt(v as string);
    return wei >= 0n ? wei : null;
  } catch {
    return null;
  }
}

function relayer() {
  const key = (process.env.RELAYER_PRIVATE_KEY || process.env.DEPLOYER_PRIVATE_KEY) as Hex | undefined;
  if (!key || !AGENT_MANDATES_ADDRESS) return null;
  return createWalletClient({ account: privateKeyToAccount(key), chain: monadTestnet, transport: http(RPC_URL) });
}

export async function GET() {
  const wallet = relayer();
  if (!wallet) return NextResponse.json({ enabled: false, contract: AGENT_MANDATES_ADDRESS || null });
  const [balance, price] = await Promise.all([
    publicClient().getBalance({ address: wallet.account.address }).catch(() => 0n),
    gasPrice(),
  ]);
  // Enough gas for a grant plus a revoke (vault sponsorship is optional and checked per request).
  const neededWei = gasReserve(price);
  return NextResponse.json({
    enabled: true,
    contract: AGENT_MANDATES_ADDRESS,
    relayer: wallet.account.address,
    balanceWei: balance.toString(),
    neededWei: neededWei.toString(),
    lowFunds: balance < neededWei,
    sponsorMaxWei: SPONSOR_MAX.toString(),
  });
}

export async function POST(req: Request) {
  const wallet = relayer();
  if (!wallet) return NextResponse.json({ error: 'Relayer is not configured' }, { status: 503 });

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  const rateLimit = policyTracker.checkRateLimit(ip);
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: `Too many requests, try again in ${rateLimit.retryAfterSeconds}s` },
      { status: 429 }
    );
  }

  const body = await req.json().catch(() => null);
  const data = body?.data;
  const validation = validateRelayCalldata(data);
  if (!validation.valid) {
    return NextResponse.json({ error: validation.error }, { status: 400 });
  }

  const requestedWei = parseWei(body?.sponsorWei);
  if (requestedWei === null) {
    return NextResponse.json({ error: 'sponsorWei must be a whole, non-negative number of wei' }, { status: 400 });
  }

  // Vault sponsorship is best effort: when a cap or the relayer's balance cannot cover it, the grant
  // still goes through with an empty vault, and the response says how much was actually sponsored.
  let sponsorWei = validation.isCreate && requestedWei > 0n ? (requestedWei < SPONSOR_MAX ? requestedWei : SPONSOR_MAX) : 0n;
  let sponsorNote: string | undefined;
  if (validation.isCreate && requestedWei > 0n && sponsorWei === 0n) sponsorNote = 'vault sponsorship is turned off';
  if (sponsorWei > 0n) {
    const sponsorCheck = policyTracker.checkSponsorCap(ip, sponsorWei);
    if (!sponsorCheck.allowed) {
      sponsorWei = 0n;
      sponsorNote = sponsorCheck.reason;
    }
  }

  const [balance, price] = await Promise.all([
    publicClient().getBalance({ address: wallet.account.address }).catch(() => 0n),
    gasPrice(),
  ]);
  // Keep enough for a grant plus a revoke before any MON goes into the vault.
  if (sponsorWei > 0n && sponsorWithinBalance(balance, gasReserve(price), sponsorWei).sponsorWei === 0n) {
    sponsorWei = 0n;
    sponsorNote = 'the relayer is low on MON';
  }

  let gas: bigint;
  try {
    await publicClient().call({ account: wallet.account, to: AGENT_MANDATES_ADDRESS as Hex, data, value: sponsorWei });
    const estimate = await publicClient().estimateGas({
      account: wallet.account,
      to: AGENT_MANDATES_ADDRESS as Hex,
      data,
      value: sponsorWei,
    });
    const limit = relayGasLimit(estimate, MAX_RELAY_GAS);
    // Never send with a limit below the estimate: it would be a certain out-of-gas revert, billed in full.
    if (limit === null) {
      return NextResponse.json(
        { error: `This action is too large to relay (needs about ${estimate} gas, the relayer allows ${MAX_RELAY_GAS}).` },
        { status: 422 }
      );
    }
    gas = limit;
  } catch (e: any) {
    return NextResponse.json({ error: `Contract would reject this: ${explainRejection(e)}` }, { status: 422 });
  }

  const gasWei = (price * gas * 3n) / 2n;
  if (price > 0n) {
    const funds = sponsorWithinBalance(balance, gasWei, sponsorWei);
    if (!funds.payable) {
      return NextResponse.json(
        {
          error: `The gas relayer is out of testnet MON (has ${mon(balance)}, needs about ${mon(gasWei)}). Fund ${wallet.account.address} and try again.`,
          lowFunds: true,
        },
        { status: 503 }
      );
    }
    // The estimate above included the sponsored value, so it also covers the same grant without it.
    if (funds.sponsorWei < sponsorWei) {
      sponsorWei = 0n;
      sponsorNote = 'the relayer is low on MON';
    }
  }

  try {
    const hash = await wallet.sendTransaction({
      to: AGENT_MANDATES_ADDRESS as Hex,
      data,
      value: sponsorWei,
      gas,
    });
    policyTracker.recordSpend(ip, sponsorWei);
    return NextResponse.json({ hash, sponsoredWei: sponsorWei.toString(), ...(sponsorNote ? { sponsorNote } : {}) });
  } catch (e: any) {
    return NextResponse.json({ error: `Relayer transaction failed: ${e.shortMessage || e.message}` }, { status: 500 });
  }
}
