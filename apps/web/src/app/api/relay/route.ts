import { NextResponse } from 'next/server';
import { createWalletClient, http, type Hex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { AGENT_MANDATES_ADDRESS, RPC_URL, monadTestnet, publicClient } from '../../../lib/agentMandates';
import { RelayPolicyTracker, validateRelayCalldata, DEFAULT_RELAY_CONFIG } from '../../../lib/relayPolicy';

export const dynamic = 'force-dynamic';

const policyTracker = new RelayPolicyTracker(DEFAULT_RELAY_CONFIG);

function relayer() {
  const key = (process.env.RELAYER_PRIVATE_KEY || process.env.DEPLOYER_PRIVATE_KEY) as Hex | undefined;
  if (!key || !AGENT_MANDATES_ADDRESS) return null;
  return createWalletClient({ account: privateKeyToAccount(key), chain: monadTestnet, transport: http(RPC_URL) });
}

export async function GET() {
  const wallet = relayer();
  if (!wallet) return NextResponse.json({ enabled: false, contract: AGENT_MANDATES_ADDRESS || null });
  const balance = await publicClient().getBalance({ address: wallet.account.address }).catch(() => 0n);
  return NextResponse.json({
    enabled: true,
    contract: AGENT_MANDATES_ADDRESS,
    relayer: wallet.account.address,
    balanceWei: balance.toString(),
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

  try {
    await publicClient().call({ account: wallet.account, to: AGENT_MANDATES_ADDRESS as Hex, data, value: sponsorWei });
  } catch (e: any) {
    return NextResponse.json({ error: `Contract would reject this: ${e.shortMessage || e.message}` }, { status: 422 });
  }

  try {
    const hash = await wallet.sendTransaction({
      to: AGENT_MANDATES_ADDRESS as Hex,
      data,
      value: sponsorWei,
      gas: 1_200_000n,
    });
    policyTracker.recordSpend(ip, sponsorWei);
    return NextResponse.json({ hash });
  } catch (e: any) {
    return NextResponse.json({ error: `Relayer transaction failed: ${e.shortMessage || e.message}` }, { status: 500 });
  }
}
