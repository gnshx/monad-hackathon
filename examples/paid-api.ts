/**
 * Pay-per-call API that serves an AI agent only while it holds a live mandate to pay this API.
 *
 * The merchant (an API) and an agent run in one process here for a self-contained demo:
 *   1. The agent asks for /quote, proving it controls its wallet with a signed, timestamped request.
 *   2. The API reads the mandate: the requester must be its agent and, if TRUSTED_OWNER_KEYS is set,
 *      its owner key must be one the API onboarded. Then AgentMandates.checkPayment(): may this agent
 *      pay us this price right now? If not, it refuses with the exact rule (402 + reason).
 *   3. If yes, it answers 402 Payment Required with the price. The agent pays with payToken(), which
 *      the contract caps, and retries with the transaction hash.
 *   4. On the retry the API does not run checkPayment() again: the payment itself may have used up the
 *      budget or the vault. It verifies the TokenPaid event instead (successful tx, right mandate,
 *      token, payee and amount, not used before) and serves. Only the mandate's agent can call
 *      payToken(), and step 2 checked that the requester is that agent.
 *
 * What a mandate proves: the agent holds a live mandate, signed by some P-256 key, within its caps.
 * The contract cannot tell a device passkey from a software key an agent created for itself, so an
 * API that needs a person behind the agent should set TRUSTED_OWNER_KEYS (comma-separated ownerKeys).
 *
 * Run against a local chain:  npm run e2e:serve   (terminal 1)
 *                             npx tsx examples/paid-api.ts   (terminal 2)
 */
import http from 'node:http';
import fs from 'node:fs';
import {
  createPublicClient,
  createWalletClient,
  decodeEventLog,
  http as httpTransport,
  verifyMessage,
  type Address,
  type Hex,
  type PublicClient,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { AgentMandates, AgentMandatesABI } from '@agenttrust/sdk';

const env = Object.fromEntries(
  fs.readFileSync('.mcp-local.env', 'utf8').trim().split('\n').map((l) => l.split('=') as [string, string])
);
const RPC = env.AGENTTRUST_RPC_URL;
const CONTRACT = env.AGENTTRUST_CONTRACT as Address;
const USDC = env.USDC as Address;
const MERCHANT = env.MERCHANT as Address; // the API's payout address (allowlisted in the mandate)
const PRICE = 2_000_000n; // 2 USDC per call
const PORT = 8787;

const publicClient = createPublicClient({ transport: httpTransport(RPC) }) as PublicClient;

// ───────────────────────────── Merchant (API) ─────────────────────────────

const usedPayments = new Set<string>();
const mandatesReader = new AgentMandates(CONTRACT, publicClient);
/** Owner keys (getMandate(id).ownerKey) this API accepts. Empty = any owner key. */
const TRUSTED_OWNER_KEYS = new Set(
  (process.env.TRUSTED_OWNER_KEYS ?? '').split(',').map((k) => k.trim().toLowerCase()).filter(Boolean)
);

const server = http.createServer(async (req, res) => {
  const reply = (code: number, body: object) => {
    res.writeHead(code, { 'content-type': 'application/json' });
    res.end(JSON.stringify(body));
  };
  try {
    const mandateId = BigInt(String(req.headers['x-mandate-id'] ?? '0'));
    const agent = req.headers['x-agent'] as Address;
    const ts = Number(req.headers['x-ts']);
    const sig = req.headers['x-sig'] as Hex;

    // 1. The caller controls the agent wallet (fresh signature, so it can't be replayed later).
    if (!agent || Math.abs(Date.now() / 1000 - ts) > 60) return reply(401, { error: 'stale or missing auth' });
    const ok = await verifyMessage({ address: agent, message: `agenttrust:${mandateId}:${req.url}:${ts}`, signature: sig });
    if (!ok) return reply(401, { error: 'bad signature' });

    // 2. The requester is this mandate's agent, and (if configured) we trust the mandate's owner key.
    const m = await mandatesReader.getMandate(mandateId);
    if (BigInt(m.ownerKey) === 0n) return reply(402, { error: 'agent not authorized to pay', reason: 'MandateNotFound' });
    if (m.agent.toLowerCase() !== agent.toLowerCase()) return reply(402, { error: 'agent not authorized to pay', reason: 'NotAgent' });
    if (TRUSTED_OWNER_KEYS.size > 0 && !TRUSTED_OWNER_KEYS.has(m.ownerKey.toLowerCase())) {
      return reply(403, { error: 'mandate owner key is not one this API accepts', ownerKey: m.ownerKey });
    }

    // 3. No payment yet: may this agent pay us this price right now? If so, ask for it.
    const paymentTx = req.headers['x-payment-tx'] as Hex | undefined;
    if (!paymentTx) {
      const check = await mandatesReader.checkPayment(mandateId, agent, USDC, MERCHANT, PRICE);
      if (!check.allowed) return reply(402, { error: 'agent not authorized to pay', reason: check.reason });
      return reply(402, { price: PRICE.toString(), token: USDC, payTo: MERCHANT, mandateId: mandateId.toString() });
    }

    // 4. Payment sent: verify the TokenPaid event itself. checkPayment() would now ask whether the agent
    //    could pay a second time, which fails when this payment used up the budget or the vault.
    if (usedPayments.has(paymentTx)) return reply(402, { error: 'payment already used' });
    usedPayments.add(paymentTx); // reserve before awaiting, so two concurrent requests cannot both use it
    let paid = false;
    try {
      const receipt = await publicClient.getTransactionReceipt({ hash: paymentTx });
      paid =
        receipt.status === 'success' &&
        receipt.logs.some((log) => {
          if (log.address.toLowerCase() !== CONTRACT.toLowerCase()) return false;
          try {
            const ev: any = decodeEventLog({ abi: AgentMandatesABI, data: log.data, topics: (log as any).topics });
            return (
              ev.eventName === 'TokenPaid' &&
              ev.args.mandateId === mandateId &&
              ev.args.token.toLowerCase() === USDC.toLowerCase() &&
              ev.args.to.toLowerCase() === MERCHANT.toLowerCase() &&
              ev.args.amount >= PRICE
            );
          } catch {
            return false;
          }
        });
    } finally {
      if (!paid) usedPayments.delete(paymentTx);
    }
    if (!paid) return reply(402, { error: 'payment not found' });

    // 5. Serve.
    return reply(200, { quote: { pair: 'MON/USDC', price: (3.2 + Math.random() / 10).toFixed(4) }, paidWith: paymentTx });
  } catch (e: any) {
    return reply(500, { error: e.shortMessage || e.message });
  }
});

// ───────────────────────────── Agent ─────────────────────────────

async function agentCall(path: string, mandateId: bigint, paymentTx?: Hex) {
  const account = privateKeyToAccount(env.AGENT_PRIVATE_KEY as Hex);
  const ts = Math.floor(Date.now() / 1000);
  const sig = await account.signMessage({ message: `agenttrust:${mandateId}:${path}:${ts}` });
  const res = await fetch(`http://localhost:${PORT}${path}`, {
    headers: {
      'x-mandate-id': mandateId.toString(),
      'x-agent': account.address,
      'x-ts': String(ts),
      'x-sig': sig,
      ...(paymentTx ? { 'x-payment-tx': paymentTx } : {}),
    },
  });
  return { status: res.status, body: await res.json() };
}

server.listen(PORT, async () => {
  const mandateId = BigInt(env.AGENTTRUST_MANDATE_ID);
  const account = privateKeyToAccount(env.AGENT_PRIVATE_KEY as Hex);
  const chainId = await publicClient.getChainId();
  const wallet = createWalletClient({
    account,
    chain: { id: chainId, name: 'local', nativeCurrency: { name: 'MON', symbol: 'MON', decimals: 18 }, rpcUrls: { default: { http: [RPC] } } },
    transport: httpTransport(RPC),
  });
  const agentSdk = new AgentMandates(CONTRACT, publicClient, wallet);
  console.log(
    TRUSTED_OWNER_KEYS.size > 0
      ? `api accepts mandates from ${TRUSTED_OWNER_KEYS.size} trusted owner key(s)`
      : 'api accepts any mandate owner key (set TRUSTED_OWNER_KEYS to require keys you onboarded)'
  );

  console.log('agent → GET /quote');
  const first = await agentCall('/quote', mandateId);
  console.log(`api   ← ${first.status}`, first.body);

  console.log('agent → payToken(2 USDC) through its mandate');
  const { hash } = await agentSdk.payToken(mandateId, USDC, MERCHANT, BigInt(first.body.price));
  const second = await agentCall('/quote', mandateId, hash);
  console.log(`api   ← ${second.status}`, second.body);

  console.log('agent → replays the same payment');
  const replay = await agentCall('/quote', mandateId, hash);
  console.log(`api   ← ${replay.status}`, replay.body);

  console.log('agent → claims a mandate that is not its own');
  const wrong = await agentCall('/quote', mandateId + 100n);
  console.log(`api   ← ${wrong.status}`, wrong.body);

  server.close();
});
