'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Fingerprint,
  KeyRound,
  ShieldCheck,
  ShieldOff,
  Siren,
  Wallet,
  Search,
  Code2,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  RefreshCw,
  ExternalLink,
} from 'lucide-react';
import {
  formatEther,
  isAddress,
  isHex,
  parseEther,
  toFunctionSelector,
  type Address,
  type Hex,
} from 'viem';
import {
  ANY_SELECTOR,
  createBrowserPasskey,
  encode,
  ownerKeyOf,
  signWithBrowserPasskey,
  type MandateTerms,
  type OnchainMandate,
  type PasskeyPublicKey,
  type Permission,
} from '@agenttrust/sdk';
import { AGENT_MANDATES_ADDRESS, EXPLORER, mandatesClient } from '../lib/agentMandates';
import { DEFAULT_MOCK_TARGET_ADDRESS } from '../lib/contracts';
import s from './PasskeyConsole.module.css';

const STORAGE_KEY = 'agenttrust.passkey.v1';

interface StoredPasskey {
  publicKey: PasskeyPublicKey;
  credentialId: Hex;
}

interface RelayInfo {
  enabled: boolean;
  relayer?: Address;
  balanceWei?: string;
  sponsorMaxWei?: string;
}

type Notice = { kind: 'ok' | 'err' | 'warn'; text: string; hash?: Hex } | null;

interface Row {
  id: bigint;
  m: OnchainMandate;
  permissions: readonly Permission[];
  active: boolean;
}

const PRESETS = [
  { label: 'Pay-per-call API agent', fn: 'doSomething(uint256)', perCall: '0.005', budget: '0.02', days: '7' },
  { label: 'Trading bot, tight cap', fn: 'doSomething(uint256)', perCall: '0.002', budget: '0.01', days: '1' },
  { label: 'Any call to target', fn: 'any', perCall: '0.001', budget: '0.005', days: '1' },
];

function short(a: string, n = 6) {
  return a.length > 2 * n + 2 ? `${a.slice(0, n + 2)}…${a.slice(-n)}` : a;
}

function parseSelector(input: string): Hex {
  const v = input.trim();
  if (!v || v.toLowerCase() === 'any') return ANY_SELECTOR;
  if (isHex(v) && v.length === 10) return v;
  return toFunctionSelector(`function ${v}`);
}

export function PasskeyConsole() {
  const client = useMemo(() => mandatesClient(), []);
  const [passkey, setPasskey] = useState<StoredPasskey | null>(null);
  const [relay, setRelay] = useState<RelayInfo | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice>(null);
  const [rows, setRows] = useState<Row[] | null>(null);

  const [form, setForm] = useState({
    agent: process.env.NEXT_PUBLIC_DEMO_AGENT || '',
    agentId: process.env.NEXT_PUBLIC_DEMO_AGENT_ID || '',
    target: process.env.NEXT_PUBLIC_DEMO_TARGET || DEFAULT_MOCK_TARGET_ADDRESS,
    fn: PRESETS[0].fn,
    perCall: PRESETS[0].perCall,
    budget: PRESETS[0].budget,
    days: PRESETS[0].days,
    sponsor: true,
  });
  const [preset, setPreset] = useState(0);
  const [withdrawTo, setWithdrawTo] = useState('');

  const ownerKey = passkey ? ownerKeyOf(passkey.publicKey) : null;

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setPasskey(JSON.parse(raw));
    } catch {}
    fetch('/api/relay')
      .then((r) => r.json())
      .then(setRelay)
      .catch(() => setRelay({ enabled: false }));
  }, []);

  const refresh = useCallback(async () => {
    if (!client || !ownerKey) return;
    try {
      const ids = await client.mandatesOf(ownerKey);
      const loaded = await Promise.all(
        [...ids].reverse().map(async (id) => ({
          id,
          m: await client.getMandate(id),
          permissions: await client.getPermissions(id),
          active: await client.isActive(id),
        }))
      );
      setRows(loaded);
    } catch (e: any) {
      setNotice({ kind: 'err', text: `Could not read mandates: ${e.shortMessage || e.message}` });
    }
  }, [client, ownerKey]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function submit(data: Hex, sponsorWei = 0n): Promise<Hex> {
    if (relay?.enabled) {
      const res = await fetch('/api/relay', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ data, sponsorWei: sponsorWei.toString() }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Relayer rejected the request');
      await client!.publicClient.waitForTransactionReceipt({ hash: json.hash });
      return json.hash;
    }
    // No relayer configured: any wallet can submit, because the passkey signature is the authority.
    const eth = (window as any).ethereum;
    if (!eth) throw new Error('No relayer is configured and no browser wallet was found to submit the signed action');
    const [from] = await eth.request({ method: 'eth_requestAccounts' });
    try {
      await eth.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: '0x279f' }] });
    } catch {}
    const hash = await eth.request({
      method: 'eth_sendTransaction',
      params: [{ from, to: AGENT_MANDATES_ADDRESS, data, value: `0x${sponsorWei.toString(16)}` }],
    });
    await client!.publicClient.waitForTransactionReceipt({ hash });
    return hash;
  }

  async function run(label: string, fn: () => Promise<Notice>) {
    setBusy(label);
    setNotice(null);
    try {
      setNotice(await fn());
      await refresh();
    } catch (e: any) {
      const msg = e?.name === 'NotAllowedError' ? 'Passkey prompt was cancelled.' : e.shortMessage || e.message || String(e);
      setNotice({ kind: 'err', text: msg });
    } finally {
      setBusy(null);
    }
  }

  const createPasskey = () =>
    run('passkey', async () => {
      const pk = await createBrowserPasskey(`AgentTrust owner ${new Date().toISOString().slice(0, 10)}`);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(pk));
      setPasskey(pk);
      return { kind: 'ok', text: 'Passkey created on this device. Its public key is your owner identity; the private key never leaves your authenticator.' };
    });

  const grant = () =>
    run('grant', async () => {
      if (!client || !passkey) throw new Error('Create a passkey first');
      if (!isAddress(form.agent)) throw new Error('Agent wallet must be a 0x address');
      if (!isAddress(form.target)) throw new Error('Target must be a 0x address');
      const terms: MandateTerms = {
        agent: form.agent,
        agentId: BigInt(form.agentId || '0'),
        permissions: [{ target: form.target, selector: parseSelector(form.fn) }],
        maxPerCall: parseEther(form.perCall),
        budget: parseEther(form.budget),
        expiresAt: BigInt(Math.floor(Date.now() / 1000) + Math.round(Number(form.days) * 86400)),
      };
      const challenge = await client.createChallenge(passkey.publicKey, terms);
      const auth = await signWithBrowserPasskey(challenge, passkey.credentialId);
      const sponsorMax = BigInt(relay?.sponsorMaxWei || '0');
      const sponsor = form.sponsor && relay?.enabled ? (terms.budget < sponsorMax ? terms.budget : sponsorMax) : 0n;
      const hash = await submit(encode.createMandate(passkey.publicKey, terms, auth), sponsor);
      return {
        kind: 'ok',
        hash,
        text: `Mandate created and enforced on Monad${sponsor > 0n ? `, vault funded with ${formatEther(sponsor)} MON by the relayer` : ''}.`,
      };
    });

  const revoke = (id: bigint) =>
    run(`revoke-${id}`, async () => {
      const auth = await signWithBrowserPasskey(await client!.revokeChallenge(passkey!.publicKey, id), passkey!.credentialId);
      const hash = await submit(encode.revoke(id, auth));
      return { kind: 'ok', hash, text: `Mandate #${id} revoked. The agent's next call will be rejected on-chain.` };
    });

  const revokeAll = () =>
    run('revoke-all', async () => {
      const auth = await signWithBrowserPasskey(await client!.revokeAllChallenge(passkey!.publicKey), passkey!.credentialId);
      const hash = await submit(encode.revokeAll(ownerKey!, auth));
      return { kind: 'ok', hash, text: 'Every mandate this passkey ever issued is now dead, in one transaction.' };
    });

  const withdraw = (row: Row) =>
    run(`withdraw-${row.id}`, async () => {
      if (!isAddress(withdrawTo)) throw new Error('Enter the address to send the vault balance to');
      const amount = row.m.balance;
      const auth = await signWithBrowserPasskey(
        await client!.withdrawChallenge(passkey!.publicKey, row.id, withdrawTo, amount),
        passkey!.credentialId
      );
      const hash = await submit(encode.withdraw(row.id, withdrawTo, amount, auth));
      return { kind: 'ok', hash, text: `Withdrew ${formatEther(amount)} MON to ${short(withdrawTo)}.` };
    });

  const applyPreset = (i: number) => {
    setPreset(i);
    const p = PRESETS[i];
    setForm((f) => ({ ...f, fn: p.fn, perCall: p.perCall, budget: p.budget, days: p.days }));
  };

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));

  return (
    <div className={s.wrap}>
      <section className={s.hero}>
        <span className={s.eyebrow}>
          <Fingerprint size={13} /> Passkey mandates · Monad
        </span>
        <h1 className={s.title}>Give your AI agent a budget, not your keys.</h1>
        <p className={s.lede}>
          Approve what an agent may do with Face ID or Touch ID. Monad&apos;s P-256 precompile verifies the passkey and the
          contract enforces every limit. You need no wallet, seed phrase or gas, and you can revoke in one tap.
        </p>
        <div className={s.steps}>
          <div className={s.step}>
            <span className={s.stepNum}>1</span>
            <div>
              <div className={s.stepTitle}>Sign once with a passkey</div>
              <div className={s.stepText}>Contracts, functions, per-call cap, budget, expiry. A relayer submits it.</div>
            </div>
          </div>
          <div className={s.step}>
            <span className={s.stepNum}>2</span>
            <div>
              <div className={s.stepTitle}>The agent acts inside the box</div>
              <div className={s.stepText}>Its ERC-8004 identity is checked on every call. Anything else reverts.</div>
            </div>
          </div>
          <div className={s.step}>
            <span className={s.stepNum}>3</span>
            <div>
              <div className={s.stepTitle}>Anyone can verify</div>
              <div className={s.stepText}>Apps and protocols call checkAction() to see if the agent is authorized.</div>
            </div>
          </div>
        </div>
      </section>

      <div className={s.statusRow}>
        <span className={s.chip}>
          <span className={AGENT_MANDATES_ADDRESS ? s.dotOk : s.dotWarn} />
          AgentMandates{' '}
          {AGENT_MANDATES_ADDRESS ? (
            <a className={s.mono} href={`${EXPLORER}/address/${AGENT_MANDATES_ADDRESS}`} target="_blank" rel="noreferrer">
              {short(AGENT_MANDATES_ADDRESS)}
            </a>
          ) : (
            'not configured'
          )}
        </span>
        <span className={s.chip}>
          <span className={relay?.enabled ? s.dotOk : s.dotOff} />
          {relay?.enabled
            ? `Gas relayer on · ${Number(formatEther(BigInt(relay.balanceWei || '0'))).toFixed(3)} MON`
            : 'No relayer · submit with any wallet'}
        </span>
        <span className={s.chip}>
          <span className={s.dotOk} /> Monad Testnet · P-256 precompile 0x0100
        </span>
      </div>

      {!AGENT_MANDATES_ADDRESS && (
        <div className={s.notice}>
          <AlertTriangle size={16} />
          <span>
            Set <code>NEXT_PUBLIC_AGENT_MANDATES_ADDRESS</code> to the deployed AgentMandates contract to enable live mandates.
          </span>
        </div>
      )}

      <div className={s.grid2}>
        <section className={s.card}>
          <div className={s.cardHead}>
            <span className={s.cardTitle}>
              <KeyRound size={18} /> Your passkey
            </span>
          </div>
          {passkey ? (
            <>
              <div className={s.keyBox}>
                <span className={s.keyLabel}>Owner identity (keccak of P-256 public key)</span>
                <span className={s.keyVal}>{ownerKey}</span>
              </div>
              <p className={s.cardSub} style={{ marginTop: '0.75rem', marginBottom: 0 }}>
                Stored on this device. Every owner action is a fresh WebAuthn assertion with user verification, bound to this
                chain, this contract and a nonce.
              </p>
              <div className={s.btnRow}>
                <button className={s.btnDanger} onClick={revokeAll} disabled={!!busy || !rows?.length}>
                  <Siren size={15} /> {busy === 'revoke-all' ? 'Waiting for passkey…' : 'Revoke every mandate'}
                </button>
                <button
                  className={s.btnGhost}
                  onClick={() => {
                    localStorage.removeItem(STORAGE_KEY);
                    setPasskey(null);
                    setRows(null);
                  }}
                  disabled={!!busy}
                >
                  Forget on this device
                </button>
              </div>
            </>
          ) : (
            <>
              <p className={s.cardSub}>
                A passkey lives in your device&apos;s secure hardware. Its public key becomes your on-chain owner identity, so
                no wallet vendor or platform holds it.
              </p>
              <button className={s.btn} onClick={createPasskey} disabled={!!busy}>
                <Fingerprint size={16} /> {busy === 'passkey' ? 'Waiting for your device…' : 'Create passkey'}
              </button>
            </>
          )}
        </section>

        <section className={s.card}>
          <div className={s.cardHead}>
            <span className={s.cardTitle}>
              <ShieldCheck size={18} /> Grant a mandate
            </span>
          </div>
          <div className={s.presets}>
            {PRESETS.map((p, i) => (
              <button key={p.label} className={`${s.preset} ${preset === i ? s.presetOn : ''}`} onClick={() => applyPreset(i)}>
                {p.label}
              </button>
            ))}
          </div>
          <div className={s.fields}>
            <div className={s.field}>
              <label>Agent wallet</label>
              <input className={`${s.input} ${s.monoInput}`} value={form.agent} onChange={set('agent')} placeholder="0x…" />
            </div>
            <div className={s.field}>
              <label>ERC-8004 agent ID</label>
              <input className={s.input} value={form.agentId} onChange={set('agentId')} placeholder="e.g. 12" />
            </div>
            <div className={`${s.field} ${s.full}`}>
              <label>Allowed contract</label>
              <input className={`${s.input} ${s.monoInput}`} value={form.target} onChange={set('target')} />
            </div>
            <div className={`${s.field} ${s.full}`}>
              <label>Allowed function</label>
              <input className={`${s.input} ${s.monoInput}`} value={form.fn} onChange={set('fn')} />
              <small>A signature like transfer(address,uint256), a 4-byte selector, or &quot;any&quot;.</small>
            </div>
            <div className={s.field}>
              <label>Max per call (MON)</label>
              <input className={s.input} value={form.perCall} onChange={set('perCall')} inputMode="decimal" />
            </div>
            <div className={s.field}>
              <label>Total budget (MON)</label>
              <input className={s.input} value={form.budget} onChange={set('budget')} inputMode="decimal" />
            </div>
            <div className={s.field}>
              <label>Expires in (days)</label>
              <input className={s.input} value={form.days} onChange={set('days')} inputMode="decimal" />
            </div>
            {relay?.enabled && BigInt(relay.sponsorMaxWei || '0') > 0n && (
              <div className={s.field} style={{ justifyContent: 'flex-end' }}>
                <label style={{ display: 'flex', gap: '0.45rem', alignItems: 'center', fontWeight: 500 }}>
                  <input type="checkbox" checked={form.sponsor} onChange={set('sponsor')} />
                  Demo: relayer funds the vault (up to {formatEther(BigInt(relay.sponsorMaxWei!))} MON)
                </label>
              </div>
            )}
          </div>
          <div className={s.btnRow}>
            <button className={s.btn} onClick={grant} disabled={!!busy || !passkey || !client}>
              <Fingerprint size={16} /> {busy === 'grant' ? 'Confirm on your device…' : 'Sign with passkey & create'}
            </button>
          </div>
          {notice && (
            <div className={notice.kind === 'ok' ? s.noticeOk : notice.kind === 'err' ? s.noticeErr : s.notice}>
              {notice.kind === 'ok' ? <CheckCircle2 size={16} /> : <XCircle size={16} />}
              <span>
                {notice.text}{' '}
                {notice.hash && (
                  <a href={`${EXPLORER}/tx/${notice.hash}`} target="_blank" rel="noreferrer">
                    View transaction <ExternalLink size={11} />
                  </a>
                )}
              </span>
            </div>
          )}
        </section>
      </div>

      <section className={s.card}>
        <div className={s.cardHead}>
          <span className={s.cardTitle}>
            <Wallet size={18} /> Your mandates
          </span>
          <button className={s.btnGhost} onClick={refresh} disabled={!passkey || !client}>
            <RefreshCw size={14} /> Refresh
          </button>
        </div>
        {!passkey ? (
          <div className={s.empty}>Create a passkey to see the mandates it owns.</div>
        ) : !rows ? (
          <div className={s.empty}>Loading from Monad…</div>
        ) : rows.length === 0 ? (
          <div className={s.empty}>No mandates yet. Grant one above.</div>
        ) : (
          <>
            <div className={s.field} style={{ marginBottom: '0.9rem', maxWidth: 460 }}>
              <label>Withdraw unspent funds to</label>
              <input className={`${s.input} ${s.monoInput}`} value={withdrawTo} onChange={(e) => setWithdrawTo(e.target.value)} placeholder="0x… any address you control" />
            </div>
            <div className={s.mandates}>
              {rows.map((row) => {
                const pct = row.m.budget > 0n ? Number((row.m.spent * 1000n) / row.m.budget) / 10 : 0;
                return (
                  <div key={row.id.toString()} className={s.mandate}>
                    <div className={s.mandateTop}>
                      <span className={s.mandateId}>
                        Mandate #{row.id.toString()} <span className={s.mono}>→ {short(row.m.agent)}</span>
                      </span>
                      <span className={row.active ? s.pillOk : s.pillOff}>
                        {row.active ? 'ACTIVE' : row.m.revoked ? 'REVOKED' : 'INACTIVE'}
                      </span>
                    </div>
                    <div className={s.meter}>
                      <div className={s.meterFill} style={{ width: `${Math.min(pct, 100)}%` }} />
                    </div>
                    <div className={s.meta}>
                      <span>
                        Spent <b>{formatEther(row.m.spent)}</b> / {formatEther(row.m.budget)} MON
                      </span>
                      <span>
                        Per call <b>{formatEther(row.m.maxPerCall)}</b>
                      </span>
                      <span>
                        Vault <b>{formatEther(row.m.balance)}</b> MON
                      </span>
                      <span>
                        Agent ID <b>#{row.m.agentId.toString()}</b>
                      </span>
                      <span>
                        Expires <b>{row.m.expiresAt === 0n ? 'never' : new Date(Number(row.m.expiresAt) * 1000).toLocaleString()}</b>
                      </span>
                      {row.permissions.map((p, i) => (
                        <span key={i} className={s.mono}>
                          {short(p.target)} · {p.selector === ANY_SELECTOR ? 'any fn' : p.selector}
                        </span>
                      ))}
                    </div>
                    <div className={s.btnRow} style={{ marginTop: '0.8rem' }}>
                      <button className={s.btnDanger} onClick={() => revoke(row.id)} disabled={!!busy || !row.active}>
                        <ShieldOff size={14} /> {busy === `revoke-${row.id}` ? 'Confirm on device…' : 'Revoke'}
                      </button>
                      <button className={s.btnGhost} onClick={() => withdraw(row)} disabled={!!busy || row.m.balance === 0n}>
                        {busy === `withdraw-${row.id}` ? 'Confirm on device…' : 'Withdraw vault'}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </section>

      <div className={s.grid2}>
        <VerifyAgent />
        <BuildOnIt />
      </div>
    </div>
  );
}

function VerifyAgent() {
  const client = useMemo(() => mandatesClient(), []);
  const [v, setV] = useState({ id: '1', agent: process.env.NEXT_PUBLIC_DEMO_AGENT || '', target: process.env.NEXT_PUBLIC_DEMO_TARGET || DEFAULT_MOCK_TARGET_ADDRESS, data: '0xa6b206bf0000000000000000000000000000000000000000000000000000000000000001', value: '0.001' });
  const [result, setResult] = useState<{ allowed: boolean; reason?: string } | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const check = async () => {
    setErr(null);
    setResult(null);
    try {
      if (!client) throw new Error('AgentMandates is not configured');
      if (!isAddress(v.agent) || !isAddress(v.target) || !isHex(v.data)) throw new Error('Agent, target and calldata must be hex');
      setResult(await client.checkAction(BigInt(v.id), v.agent, v.target, v.data, parseEther(v.value || '0')));
    } catch (e: any) {
      setErr(e.shortMessage || e.message);
    }
  };
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement>) => setV((x) => ({ ...x, [k]: e.target.value }));

  return (
    <section className={s.card}>
      <div className={s.cardHead}>
        <span className={s.cardTitle}>
          <Search size={18} /> Verify an agent&apos;s authority
        </span>
      </div>
      <p className={s.cardSub}>
        For counterparties: before you serve or accept an agent&apos;s request, ask the chain whether a human actually
        authorized it. It runs the same checks as execution, and nothing is sent.
      </p>
      <div className={s.fields}>
        <div className={s.field}>
          <label>Mandate ID</label>
          <input className={s.input} value={v.id} onChange={set('id')} />
        </div>
        <div className={s.field}>
          <label>Value (MON)</label>
          <input className={s.input} value={v.value} onChange={set('value')} />
        </div>
        <div className={`${s.field} ${s.full}`}>
          <label>Agent wallet</label>
          <input className={`${s.input} ${s.monoInput}`} value={v.agent} onChange={set('agent')} placeholder="0x…" />
        </div>
        <div className={`${s.field} ${s.full}`}>
          <label>Target</label>
          <input className={`${s.input} ${s.monoInput}`} value={v.target} onChange={set('target')} />
        </div>
        <div className={`${s.field} ${s.full}`}>
          <label>Calldata</label>
          <input className={`${s.input} ${s.monoInput}`} value={v.data} onChange={set('data')} />
        </div>
      </div>
      <div className={s.btnRow}>
        <button className={s.btnGhost} onClick={check}>
          <Search size={14} /> checkAction()
        </button>
      </div>
      {result && (
        <div className={result.allowed ? s.verdictOk : s.verdictNo}>
          {result.allowed ? <CheckCircle2 size={18} /> : <XCircle size={18} />}
          {result.allowed ? 'Authorized by a live, passkey-signed mandate' : `Not authorized: ${result.reason}`}
        </div>
      )}
      {err && <div className={s.noticeErr}>{err}</div>}
    </section>
  );
}

const SNIPPETS = {
  mcp: {
    label: 'MCP (Claude, Cursor)',
    code: `{
  "mcpServers": {
    "agenttrust": {
      "command": "npx",
      "args": ["-y", "@agenttrust/mcp"],
      "env": {
        "AGENTTRUST_CONTRACT": "${AGENT_MANDATES_ADDRESS || '0x…'}",
        "AGENTTRUST_MANDATE_ID": "1",
        "AGENT_PRIVATE_KEY": "0x… (the agent's hot key)"
      }
    }
  }
}`,
    note: 'The agent gets mandate_status, check_action and execute_action tools. Even a prompt-injected model can only spend what the passkey approved.',
  },
  sdk: {
    label: 'TypeScript',
    code: `import { AgentMandates } from '@agenttrust/sdk';

const mandates = new AgentMandates(address, publicClient, agentWallet);

// Same rules as the contract; returns e.g. { allowed: false, reason: 'ExceedsBudget' }
await mandates.checkAction(mandateId, agent, target, data, value);

// Executes through the contract; throws MandateDeniedError before spending gas
await mandates.execute(mandateId, target, data, value);`,
    note: 'Owner side: createChallenge() → signWithBrowserPasskey() → encode.createMandate() → any relayer.',
  },
  sol: {
    label: 'Solidity',
    code: `interface IAgentMandates {
  function checkAction(uint256 mandateId, address agent, address target,
                       bytes calldata data, uint256 value)
    external view returns (bool allowed, bytes4 reason);
}

// In your protocol: only serve agents a human has authorized
(bool ok, ) = mandates.checkAction(id, msg.sender, address(this), msg.data, msg.value);
require(ok, "agent not authorized by its owner");`,
    note: 'Composable: any contract on Monad can gate agent traffic on a live human mandate.',
  },
};

function BuildOnIt() {
  const [tab, setTab] = useState<keyof typeof SNIPPETS>('mcp');
  return (
    <section className={s.card}>
      <div className={s.cardHead}>
        <span className={s.cardTitle}>
          <Code2 size={18} /> Build on it
        </span>
      </div>
      <div className={s.tabs}>
        {(Object.keys(SNIPPETS) as (keyof typeof SNIPPETS)[]).map((k) => (
          <button key={k} className={`${s.tab} ${tab === k ? s.tabOn : ''}`} onClick={() => setTab(k)}>
            {SNIPPETS[k].label}
          </button>
        ))}
      </div>
      <pre className={s.code}>{SNIPPETS[tab].code}</pre>
      <p className={s.codeNote}>{SNIPPETS[tab].note}</p>
    </section>
  );
}
