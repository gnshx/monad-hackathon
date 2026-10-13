import { NextResponse } from 'next/server';
import { createWalletClient, http, isHex, slice, toFunctionSelector, type Hex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { AgentMandatesABI } from '@agenttrust/sdk';
import { AGENT_MANDATES_ADDRESS, RPC_URL, monadTestnet, publicClient } from '../../../lib/agentMandates';

export const dynamic = 'force-dynamic';

/**
 * Gas relayer for passkey-signed owner actions. It only forwards calls to the AgentMandates
 * contract, only for the owner functions, and simulates first so it never pays for a revert.
 * It holds no authority: every call it forwards is authorized by the owner's passkey signature,
 * which the contract checks. A relayer can delay an action, never forge or alter one.
 */
const selectorOf = (name: string) =>
  toFunctionSelector(AgentMandatesABI.find((x) => x.type === 'function' && x.name === name) as any);
const CREATE = selectorOf('createMandate');
const RELAYABLE = new Set([CREATE, selectorOf('revoke'), selectorOf('revokeAll'), selectorOf('withdraw'), selectorOf('withdrawToken')]);
const SPONSOR_MAX = BigInt(process.env.RELAYER_SPONSOR_MAX_WEI || '0');
const recent = new Map<string, number[]>();

function relayer() {
  const key = process.env.RELAYER_PRIVATE_KEY as Hex | undefined;
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
    sponsorMaxWei: SPONSOR_MAX.toString(),
  });
}

export async function POST(req: Request) {
  const wallet = relayer();
  if (!wallet) return NextResponse.json({ error: 'Relayer is not configured' }, { status: 503 });

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  const now = Date.now();
  const hits = (recent.get(ip) || []).filter((t) => now - t < 60_000);
  if (hits.length >= 10) return NextResponse.json({ error: 'Too many requests, try again in a minute' }, { status: 429 });
  recent.set(ip, [...hits, now]);

  const body = await req.json().catch(() => null);
  const data = body?.data;
  if (!isHex(data) || data.length < 10) return NextResponse.json({ error: 'Missing calldata' }, { status: 400 });
  if (!RELAYABLE.has(slice(data, 0, 4))) return NextResponse.json({ error: 'Only owner actions can be relayed' }, { status: 400 });

  const isCreate = slice(data, 0, 4) === CREATE;
  const value = isCreate ? BigInt(body?.sponsorWei || 0) : 0n;
  if (value > SPONSOR_MAX) return NextResponse.json({ error: `Sponsored funding is capped at ${SPONSOR_MAX} wei` }, { status: 400 });

  try {
    await publicClient().call({ account: wallet.account, to: AGENT_MANDATES_ADDRESS as Hex, data, value });
  } catch (e: any) {
    return NextResponse.json({ error: `Contract would reject this: ${e.shortMessage || e.message}` }, { status: 422 });
  }
  const hash = await wallet.sendTransaction({ to: AGENT_MANDATES_ADDRESS as Hex, data, value });
  return NextResponse.json({ hash });
}
