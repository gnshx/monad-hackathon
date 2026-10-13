import { NextResponse } from 'next/server';
import { createWalletClient, formatEther, http, type Hex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { AGENT_MANDATES_ADDRESS, RPC_URL, monadTestnet, publicClient } from '../../../lib/agentMandates';
import { MANDATE_ERRORS } from '@agenttrust/sdk';
import { RelayPolicyTracker, validateRelayCalldata, DEFAULT_RELAY_CONFIG } from '../../../lib/relayPolicy';

export const dynamic = 'force-dynamic';

const policyTracker = new RelayPolicyTracker(DEFAULT_RELAY_CONFIG);

// Monad charges the gas limit, so we size it from an estimate instead of a flat ceiling.
const MAX_RELAY_GAS = 1_200_000n;
// Typical passkey grant measured locally (~120k used); used only to warn when the relayer runs low.
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
  const neededWei = ((price * TYPICAL_RELAY_GAS * 3n) / 2n) * 2n;
  return NextResponse.json({
    enabled: true,
    contract: AGENT_MANDATES_ADDRESS,
    relayer: wallet.account.address,
    balanceWei: balance.toString(),
    neededWei: neededWei.toString(),
    lowFunds: balance < neededWei,
    sponsorMaxWei: DEFAULT_RELAY_CONFIG.maxSponsorPerTxWei?.toString() || '0',
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

  const sponsorWei = validation.isCreate ? BigInt(body?.sponsorWei || 0) : 0n;
  const sponsorCheck = policyTracker.checkSponsorCap(ip, sponsorWei);
  if (!sponsorCheck.allowed) {
    return NextResponse.json({ error: sponsorCheck.reason }, { status: 400 });
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
    gas = (estimate * 5n) / 4n;
    if (gas > MAX_RELAY_GAS) gas = MAX_RELAY_GAS;
  } catch (e: any) {
    return NextResponse.json({ error: `Contract would reject this: ${explainRejection(e)}` }, { status: 422 });
  }

  const [balance, price] = await Promise.all([
    publicClient().getBalance({ address: wallet.account.address }).catch(() => 0n),
    gasPrice(),
  ]);
  const neededWei = (price * gas * 3n) / 2n + sponsorWei;
  if (price > 0n && balance < neededWei) {
    return NextResponse.json(
      {
        error: `The gas relayer is out of testnet MON (has ${mon(balance)}, needs about ${mon(neededWei)}). Fund ${wallet.account.address} and try again.`,
        lowFunds: true,
      },
      { status: 503 }
    );
  }

  try {
    const hash = await wallet.sendTransaction({
      to: AGENT_MANDATES_ADDRESS as Hex,
      data,
      value: sponsorWei,
      gas,
    });
    policyTracker.recordSpend(ip, sponsorWei);
    return NextResponse.json({ hash });
  } catch (e: any) {
    return NextResponse.json({ error: `Relayer transaction failed: ${e.shortMessage || e.message}` }, { status: 500 });
  }
}
