'use client';

import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  Fingerprint,
  KeyRound,
  ShieldCheck,
  ShieldOff,
  Siren,
  Wallet,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  RefreshCw,
  ExternalLink,
  Check,
  Coins,
  Bot,
  Zap,
  Target,
  ScanSearch,
  Code2,
  ArrowRight,
  X,
  Lock,
  Inbox,
} from 'lucide-react';
import { PageHead } from './PageHead';
import { LAST_MANDATE_KEY } from './VerifyLab';
import {
  formatEther,
  formatUnits,
  isAddress,
  isHex,
  parseEther,
  parseUnits,
  toFunctionSelector,
  type Address,
  type Hex,
} from 'viem';
import {
  ANY_SELECTOR,
  AgentMandatesABI,
  createBrowserPasskey,
  recoverBrowserPasskey,
  encode,
  ownerKeyOf,
  signWithBrowserPasskey,
  type MandateTerms,
  type OnchainMandate,
  type PasskeyPublicKey,
  type Permission,
  type TokenAllowance,
} from '@agenttrust/sdk';
import { AGENT_MANDATES_ADDRESS, EXPLORER, mandatesClient } from '../lib/agentMandates';
import { DEFAULT_MOCK_TARGET_ADDRESS, MONAD_TESTNET_CONFIG } from '../lib/contracts';
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
  /** Gas the relayer needs for a grant plus a revoke at the current gas price. */
  neededWei?: string;
  lowFunds?: boolean;
}

/** A non-negative amount in `decimals` units, or null when the field is not a plain number. */
function parseAmount(v: string, decimals = 18) {
  try {
    const n = parseUnits(v.trim(), decimals);
    return n >= 0n ? n : null;
  } catch {
    return null;
  }
}

const minWei = (a: bigint, b: bigint) => (a < b ? a : b);

/** Whether the relayer can pay gas and still fund the vault with `amount`. */
function relayCanSponsor(relay: RelayInfo | null, amount: bigint) {
  if (!relay?.enabled) return false;
  return BigInt(relay.balanceWei || '0') >= BigInt(relay.neededWei || '0') + amount;
}

const fetchTimeout = (ms: number) =>
  typeof AbortSignal !== 'undefined' && 'timeout' in AbortSignal ? AbortSignal.timeout(ms) : undefined;

const MONAD_CHAIN_HEX = `0x${MONAD_TESTNET_CONFIG.id.toString(16)}`;

/** Puts the browser wallet on Monad testnet (adding the network if it is missing) and refuses to send anywhere else. */
async function switchToMonad(eth: any) {
  const onMonad = async () => Number(await eth.request({ method: 'eth_chainId' })) === MONAD_TESTNET_CONFIG.id;
  if (await onMonad()) return;
  try {
    await eth.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: MONAD_CHAIN_HEX }] });
  } catch (e: any) {
    // 4902: the wallet does not know Monad testnet yet.
    if (e?.code === 4902 || e?.data?.originalError?.code === 4902) {
      await eth
        .request({
          method: 'wallet_addEthereumChain',
          params: [
            {
              chainId: MONAD_CHAIN_HEX,
              chainName: MONAD_TESTNET_CONFIG.name,
              nativeCurrency: MONAD_TESTNET_CONFIG.nativeCurrency,
              rpcUrls: MONAD_TESTNET_CONFIG.rpcUrls.default.http,
              blockExplorerUrls: [MONAD_TESTNET_CONFIG.blockExplorers.default.url],
            },
          ],
        })
        .catch(() => {});
    }
  }
  if (!(await onMonad())) throw new Error('Switch your wallet to Monad Testnet, then try again.');
}

type Notice = { kind: 'ok' | 'err' | 'warn'; text: string; hash?: Hex } | null;

interface TokenRow extends TokenAllowance {
  token: Address;
  symbol: string;
  /** null when decimals() could not be read; amounts are then shown in raw base units. */
  decimals: number | null;
}

interface Row {
  id: bigint;
  m: OnchainMandate;
  permissions: readonly Permission[];
  tokens: TokenRow[];
  active: boolean;
  /** Killed by "revoke all": the owner's epoch moved past the mandate's. */
  revokedAll: boolean;
}

const ERC20_META = [
  { type: 'function', name: 'decimals', inputs: [], outputs: [{ type: 'uint8' }], stateMutability: 'view' },
  { type: 'function', name: 'symbol', inputs: [], outputs: [{ type: 'string' }], stateMutability: 'view' },
] as const;

type Client = NonNullable<ReturnType<typeof mandatesClient>>;

/** Display metadata. Decimals are never guessed: a wrong guess would show caps off by powers of ten. */
async function tokenMeta(client: Client, token: Address) {
  const [decimals, symbol] = await Promise.all([
    client.publicClient.readContract({ address: token, abi: ERC20_META, functionName: 'decimals' }).then(Number).catch(() => null),
    client.publicClient.readContract({ address: token, abi: ERC20_META, functionName: 'symbol' }).catch(() => 'TOKEN'),
  ]);
  return { decimals, symbol };
}

/** Decimals for the caps the passkey signs. Throws instead of assuming 18. */
async function tokenDecimals(client: Client, token: Address) {
  try {
    return Number(await client.publicClient.readContract({ address: token, abi: ERC20_META, functionName: 'decimals' }));
  } catch {
    throw new Error('Could not read decimals() from the token address. Check that it is an ERC-20 on Monad testnet.');
  }
}

const tokenAmount = (v: bigint, decimals: number | null) => (decimals === null ? v.toString() : formatUnits(v, decimals));

/** Relay response for a submitted action. */
interface Submitted {
  hash: Hex;
  /** MON the relayer actually put into the new vault. */
  sponsoredWei: bigint;
  /** Why the relayer funded less than asked, if it did. */
  sponsorNote?: string;
}

const PRESETS = [
  { label: 'Pay-per-call API agent', icon: Zap, fn: 'doSomething(uint256)', perCall: '0.005', budget: '0.02', days: '7' },
  { label: 'Trading bot, tight cap', icon: Coins, fn: 'doSomething(uint256)', perCall: '0.002', budget: '0.01', days: '1' },
  { label: 'Any call to target', icon: Target, fn: 'any', perCall: '0.001', budget: '0.005', days: '1' },
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
    token: process.env.NEXT_PUBLIC_DEMO_TOKEN || '',
    payee: process.env.NEXT_PUBLIC_DEMO_PAYEE || '',
    tokenPerCall: '10',
    tokenBudget: '25',
  });
  const [preset, setPreset] = useState(0);
  const [withdrawTo, setWithdrawTo] = useState('');
  const [useToken, setUseToken] = useState(!!process.env.NEXT_PUBLIC_DEMO_TOKEN);

  const ownerKey = passkey ? ownerKeyOf(passkey.publicKey) : null;
  const uid = useId();
  const fid = (name: string) => `${uid}-${name}`;

  // The latest /api/relay answer as a promise, so an action started before it loads waits for it
  // instead of falling through to the browser-wallet path.
  const relayP = useRef<Promise<RelayInfo> | null>(null);
  const loadRelay = useCallback(() => {
    const prev = relayP.current;
    const p = fetch('/api/relay', { cache: 'no-store', signal: fetchTimeout(10_000) })
      .then((r) => r.json() as Promise<RelayInfo>)
      // A failed re-check keeps the last known status; only a first failure means "no relayer".
      .catch((): RelayInfo | Promise<RelayInfo> => prev ?? { enabled: false });
    relayP.current = p;
    p.then(setRelay);
    return p;
  }, []);
  const currentRelay = async (): Promise<RelayInfo> => (await relayP.current) ?? { enabled: false };

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setPasskey(JSON.parse(raw));
    } catch {}
    loadRelay();
  }, [loadRelay]);

  const refresh = useCallback(async () => {
    if (!client || !ownerKey) return;
    try {
      const [ids, epoch] = await Promise.all([
        client.mandatesOf(ownerKey),
        client.publicClient.readContract({ address: client.address, abi: AgentMandatesABI, functionName: 'epochs', args: [ownerKey] }),
      ]);
      const loaded = await Promise.all(
        [...ids].reverse().map(async (id) => {
          const m = await client.getMandate(id);
          return {
            id,
            m,
            revokedAll: m.epoch < BigInt(epoch),
            permissions: await client.getPermissions(id),
            tokens: await Promise.all(
              (await client.getTokens(id)).map(async (token) => ({
                token,
                ...(await client.getTokenAllowance(id, token)),
                ...(await tokenMeta(client, token)),
              }))
            ),
            active: await client.isActive(id),
          };
        })
      );
      setRows(loaded);
      // Verify follows the visitor's newest live mandate, or their latest one so a revoke shows up there too.
      const newest = loaded.find((r) => r.active) || loaded[0];
      if (newest) localStorage.setItem(LAST_MANDATE_KEY, JSON.stringify({ id: newest.id.toString() }));
      else localStorage.removeItem(LAST_MANDATE_KEY);
    } catch (e: any) {
      setNotice({ kind: 'err', text: `Could not read mandates: ${e.shortMessage || e.message}` });
    }
  }, [client, ownerKey]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  /** Waits for the receipt and fails on a revert, keeping the hash so the notice still links to the transaction. */
  async function waitForReceipt(hash: Hex) {
    let status: string;
    try {
      ({ status } = await client!.publicClient.waitForTransactionReceipt({ hash }));
    } catch {
      throw Object.assign(new Error('Submitted, but Monad has not confirmed it yet. Check the transaction before trying again.'), {
        hash,
        warn: true,
      });
    }
    if (status !== 'success') {
      throw Object.assign(new Error('The transaction reverted on-chain, so nothing changed. The explorer shows why.'), { hash });
    }
  }

  async function submit(data: Hex, sponsorWei = 0n): Promise<Submitted> {
    if ((await currentRelay()).enabled) {
      const res = await fetch('/api/relay', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ data, sponsorWei: sponsorWei.toString() }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Relayer rejected the request');
      await waitForReceipt(json.hash);
      return { hash: json.hash, sponsoredWei: BigInt(json.sponsoredWei ?? '0'), sponsorNote: json.sponsorNote };
    }
    // No relayer available: any wallet can submit, because the passkey signature is the authority.
    const eth = (window as any).ethereum;
    if (!eth) throw new Error('No relayer is available and no browser wallet was found to submit the signed action');
    const [from] = await eth.request({ method: 'eth_requestAccounts' });
    await switchToMonad(eth);
    const hash = await eth.request({
      method: 'eth_sendTransaction',
      params: [{ from, to: AGENT_MANDATES_ADDRESS, data, value: `0x${sponsorWei.toString(16)}` }],
    });
    await waitForReceipt(hash);
    return { hash, sponsoredWei: sponsorWei };
  }

  async function run(label: string, fn: () => Promise<Notice>) {
    setBusy(label);
    setNotice(null);
    try {
      const result = await fn();
      setNotice(result);
      await refresh();
      if (label === 'grant') document.getElementById('pk-mandates')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (e: any) {
      const cancelled = e?.name === 'NotAllowedError';
      const msg = cancelled ? 'Passkey prompt was cancelled.' : e.shortMessage || e.message || String(e);
      // Reload what is on-chain, so a stale balance or a half-finished action is not retried blindly.
      if (!cancelled) await refresh();
      setNotice({ kind: e?.warn ? 'warn' : 'err', text: msg, hash: e?.hash });
    } finally {
      setBusy(null);
      // Keep the relayer balance (and whether it can fund a vault) current after each owner action.
      if (label !== 'passkey' && label !== 'recover') loadRelay();
    }
  }

  const createPasskey = () =>
    run('passkey', async () => {
      const pk = await createBrowserPasskey(`AgentTrust owner ${new Date().toISOString().slice(0, 10)}`);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(pk));
      setPasskey(pk);
      return { kind: 'ok', text: 'Passkey created on this device. Its public key is your owner identity; the private key never leaves your authenticator.' };
    });

  const useExisting = () =>
    run('recover', async () => {
      const isRegistered = async (c: PasskeyPublicKey) => {
        if (!client) return false;
        const [x] = await client.publicClient.readContract({
          address: client.address, abi: AgentMandatesABI, functionName: 'passkeys', args: [ownerKeyOf(c)],
        });
        return BigInt(x) !== 0n;
      };
      const first = await recoverBrowserPasskey();
      let found: PasskeyPublicKey | undefined;
      for (const c of first.candidates) if (await isRegistered(c)) found = c;
      if (!found) {
        // Never used on-chain yet: a second signature pins down which candidate is the real key.
        const second = await recoverBrowserPasskey();
        found = first.candidates.find((c) => second.candidates.some((d) => d.x === c.x && d.y === c.y));
      }
      if (!found) throw new Error('Could not identify the passkey, please try again');
      const pk = { publicKey: found, credentialId: first.credentialId };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(pk));
      setPasskey(pk);
      return { kind: 'ok', text: 'Passkey recognized. Its mandates are loaded below.' };
    });

  const grant = () =>
    run('grant', async () => {
      if (!client || !passkey) throw new Error('Create a passkey first');
      if (!isAddress(form.agent)) throw new Error('Agent wallet must be a 0x address');
      if (!isAddress(form.target)) throw new Error('Target must be a 0x address');
      const terms: MandateTerms = {
        agent: form.agent,
        agentId: BigInt(form.agentId.trim() || '0'),
        permissions: [{ target: form.target, selector: parseSelector(form.fn) }],
        maxPerCall: parseEther(form.perCall.trim()),
        budget: parseEther(form.budget.trim()),
        expiresAt: BigInt(Math.floor(Date.now() / 1000) + Math.round(Number(form.days) * 86400)),
        tokenLimits: [],
      };
      if (useToken && form.token) {
        if (!isAddress(form.token) || !isAddress(form.payee)) throw new Error('Stablecoin budget needs a token address and a payee address');
        const decimals = await tokenDecimals(client, form.token);
        terms.permissions.push({ target: form.payee, selector: ANY_SELECTOR });
        terms.tokenLimits!.push({
          token: form.token,
          maxPerCall: parseUnits(form.tokenPerCall.trim(), decimals),
          budget: parseUnits(form.tokenBudget.trim(), decimals),
        });
      }
      const challenge = await client.createChallenge(passkey.publicKey, terms);
      const auth = await signWithBrowserPasskey(challenge, passkey.credentialId);
      const r = await currentRelay();
      // Enough for the agent's largest single call. The relayer decides what it can spare and reports it back.
      const wanted = form.sponsor && r.enabled ? minWei(terms.maxPerCall, BigInt(r.sponsorMaxWei || '0')) : 0n;
      const { hash, sponsoredWei, sponsorNote } = await submit(encode.createMandate(passkey.publicKey, terms, auth), wanted);
      const why = sponsorNote ? ` (${sponsorNote.charAt(0).toLowerCase()}${sponsorNote.slice(1)})` : '';
      return {
        kind: 'ok',
        hash,
        text: `Mandate created and enforced on Monad${
          sponsoredWei > 0n
            ? `, vault funded with ${formatEther(sponsoredWei)} MON by the relayer.`
            : wanted > 0n
            ? `. The relayer did not fund the vault${why}, so it starts empty. Anyone can fund it with deposit() on the contract.`
            : '.'
        }`,
      };
    });

  const revoke = (id: bigint) =>
    run(`revoke-${id}`, async () => {
      const auth = await signWithBrowserPasskey(await client!.revokeChallenge(passkey!.publicKey, id), passkey!.credentialId);
      const { hash } = await submit(encode.revoke(id, auth));
      return { kind: 'ok', hash, text: `Mandate #${id} revoked. The agent's next call will be rejected on-chain.` };
    });

  const revokeAll = () =>
    run('revoke-all', async () => {
      const auth = await signWithBrowserPasskey(await client!.revokeAllChallenge(passkey!.publicKey), passkey!.credentialId);
      const { hash } = await submit(encode.revokeAll(ownerKey!, auth));
      return { kind: 'ok', hash, text: 'Every mandate this passkey ever issued is now dead, in one transaction.' };
    });

  const withdraw = (row: Row) =>
    run(`withdraw-${row.id}`, async () => {
      if (!isAddress(withdrawTo)) throw new Error('Enter the address to send the vault balance to');
      // Sign for what the vault holds now, not what the card showed when it loaded.
      const amount = (await client!.getMandate(row.id)).balance;
      if (amount === 0n) throw new Error(`The vault of mandate #${row.id} is already empty.`);
      const auth = await signWithBrowserPasskey(
        await client!.withdrawChallenge(passkey!.publicKey, row.id, withdrawTo, amount),
        passkey!.credentialId
      );
      const { hash } = await submit(encode.withdraw(row.id, withdrawTo, amount, auth));
      return { kind: 'ok', hash, text: `Withdrew ${formatEther(amount)} MON to ${short(withdrawTo)}.` };
    });

  const applyPreset = (i: number) => {
    setPreset(i);
    const p = PRESETS[i];
    setForm((f) => ({ ...f, fn: p.fn, perCall: p.perCall, budget: p.budget, days: p.days }));
  };

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));

  const go = (hash: string) => {
    window.location.hash = hash;
  };

  // Step the visitor is on: 1 passkey, 2 grant, 3 manage, 4 verify
  const activeCount = rows?.filter((r) => r.active).length ?? 0;
  const stepNow = !passkey ? 1 : !rows?.length ? 2 : 3;
  const steps = [
    { n: 1, title: passkey ? 'Passkey ready' : 'Create a passkey', anchor: 'pk-passkey' },
    { n: 2, title: rows?.length ? `${rows.length} mandate${rows.length > 1 ? 's' : ''} granted` : 'Grant a mandate', anchor: 'pk-grant' },
    { n: 3, title: activeCount ? `${activeCount} active · revoke anytime` : 'Manage & revoke', anchor: 'pk-mandates' },
    { n: 4, title: 'Verify the agent', anchor: '' },
  ];

  const badAgent = !!form.agent && !isAddress(form.agent);
  const badTarget = !!form.target && !isAddress(form.target);
  // Checked before the passkey prompt, so a bad field never costs a signature.
  const perCallWei = parseAmount(form.perCall);
  const budgetWei = parseAmount(form.budget);
  const expirySecs = Number.isFinite(Number(form.days)) ? Math.round(Number(form.days) * 86400) : 0;
  const tokenOn = useToken && !!form.token;
  const tokenPerCall = parseAmount(form.tokenPerCall);
  const tokenBudget = parseAmount(form.tokenBudget);
  const grantBlocker = !client
    ? 'AgentMandates is not configured on this deployment.'
    : !passkey
    ? 'Create a passkey first (step 1).'
    : !form.agent
    ? 'Enter the agent wallet address.'
    : badAgent || badTarget
    ? 'Agent and contract must be 0x addresses.'
    : !/^\d*$/.test(form.agentId.trim())
    ? 'The ERC-8004 agent ID must be a whole number.'
    : perCallWei === null || budgetWei === null
    ? 'Max per call and total budget must be MON amounts, like 0.005.'
    : perCallWei > budgetWei
    ? 'Max per call cannot be more than the total budget.'
    : expirySecs < 60
    ? 'Expires in must be more than 0 days.'
    : tokenOn && (!isAddress(form.token) || !isAddress(form.payee))
    ? 'Stablecoin budget needs a token address and a payee address.'
    : tokenOn && (tokenPerCall === null || tokenBudget === null)
    ? 'Token per call and token budget must be numbers, like 10.'
    : tokenOn && tokenPerCall! > tokenBudget!
    ? 'Token per call cannot be more than the token budget.'
    : null;
  const sponsorMax = BigInt(relay?.sponsorMaxWei || '0');
  const sponsorAmount = perCallWei !== null ? minWei(perCallWei, sponsorMax) : sponsorMax;

  const fnLabel = form.fn.trim().toLowerCase() === 'any' || !form.fn.trim() ? 'any function' : form.fn.trim();
  const days = Number(form.days) || 0;
  const busyText: Record<string, string> = {
    passkey: 'Create your passkey',
    recover: 'Choose your existing passkey',
    grant: 'Sign the mandate with your passkey',
    'revoke-all': 'Sign to revoke every mandate',
  };
  const busyLabel = busy ? busyText[busy] || (busy.startsWith('revoke') ? 'Sign to revoke this mandate' : 'Sign to withdraw the vault') : '';

  return (
    <div className={s.wrap}>
      <PageHead
        eyebrow="Passkey mandates"
        icon={<Fingerprint size={13} />}
        title="Your agent's allowance, signed with a fingerprint."
        sub="Approve exactly what an AI agent may do with Face ID, Touch ID or Windows Hello. Monad's P-256 precompile verifies the passkey and the contract enforces every limit. No wallet, no seed phrase, no gas."
      />

      <div className={s.statusRow}>
        <span className={s.chip}>
          <span className={AGENT_MANDATES_ADDRESS ? s.dotOk : s.dotWarn} />
          AgentMandates{' '}
          {AGENT_MANDATES_ADDRESS ? (
            <a className={s.mono} href={`${EXPLORER}/address/${AGENT_MANDATES_ADDRESS}`} target="_blank" rel="noreferrer">
              {short(AGENT_MANDATES_ADDRESS, 4)} <ExternalLink size={10} />
            </a>
          ) : (
            'not configured'
          )}
        </span>
        <span className={s.chip}>
          <span className={relay?.enabled ? (relay.lowFunds ? s.dotWarn : s.dotOk) : s.dotOff} />
          {relay === null
            ? 'Checking relayer…'
            : relay.enabled
            ? `${relay.lowFunds ? 'Gas relayer low on MON' : 'Gas relayer online'} · ${Number(formatEther(BigInt(relay.balanceWei || '0'))).toLocaleString(undefined, { maximumFractionDigits: 3 })} MON`
            : 'No relayer · submit with any wallet'}
        </span>
        <span className={s.chip}>
          <Lock size={12} /> P-256 precompile 0x0100
        </span>
      </div>

      {!AGENT_MANDATES_ADDRESS && (
        <div className={s.notice} style={{ marginTop: 0 }}>
          <AlertTriangle size={16} />
          <span>
            Set <code>NEXT_PUBLIC_AGENT_MANDATES_ADDRESS</code> to the deployed AgentMandates contract to enable live mandates.
          </span>
        </div>
      )}

      {/* Progress */}
      <nav className={s.stepper} aria-label="Progress">
        {steps.map((st) => {
          const done = st.n < stepNow || (st.n === 1 && !!passkey);
          const now = st.n === stepNow;
          const cls = `${s.stepItem} ${done ? s.stepDone : ''} ${now ? s.stepNow : ''}`;
          const inner = (
            <>
              <span className={s.stepDot}>{done ? <Check size={14} /> : st.n}</span>
              <span style={{ minWidth: 0 }}>
                <span className={s.stepLabel}>Step {st.n}</span>
                <span className={s.stepTitle} style={{ display: 'block' }}>{st.title}</span>
              </span>
            </>
          );
          return (
            <button
              key={st.n}
              className={cls}
              onClick={() =>
                st.anchor ? document.getElementById(st.anchor)?.scrollIntoView({ behavior: 'smooth', block: 'start' }) : go('verify')
              }
            >
              {inner}
            </button>
          );
        })}
      </nav>

      <div className={s.grid2}>
        {/* Step 1: passkey */}
        <section className={s.card} id="pk-passkey">
          <div className={s.cardHead}>
            <span className={s.cardTitle}>
              <KeyRound size={18} /> Your passkey
            </span>
            <span className={s.cardNum}>01</span>
          </div>
          {passkey ? (
            <>
              <div className={s.keyHero} style={{ paddingTop: '0.25rem' }}>
                <div className={`${s.fp} ${s.fpOn}`}>
                  <Fingerprint size={40} strokeWidth={1.5} />
                </div>
                <div className={s.keyHeroTitle}>Passkey active on this device</div>
                <div className={s.keyHeroText}>Every owner action is a fresh WebAuthn signature, bound to this chain, this contract and a nonce.</div>
              </div>
              <div className={s.keyBox}>
                <span className={s.keyLabel}>Owner identity · keccak(P-256 public key)</span>
                <span className={s.keyVal}>{ownerKey}</span>
              </div>
              <div className={s.btnRow}>
                <button className={s.btnDanger} onClick={revokeAll} disabled={!!busy || !rows?.some((r) => r.active)} style={{ flex: 1 }}>
                  <Siren size={15} /> Emergency: revoke all
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
                  Forget
                </button>
              </div>
            </>
          ) : (
            <>
              <div className={s.keyHero}>
                <div className={`${s.fp} ${busy === 'passkey' || busy === 'recover' ? s.fpPulse : ''}`}>
                  <Fingerprint size={40} strokeWidth={1.5} />
                </div>
                <div className={s.keyHeroTitle}>Start with a passkey</div>
                <div className={s.keyHeroText}>
                  It lives in your device&apos;s secure hardware. Its public key becomes your on-chain owner identity, so no wallet vendor holds it.
                </div>
              </div>
              <div className={s.btnRow} style={{ flexDirection: 'column' }}>
                <button className={`${s.btn} ${s.btnLg}`} onClick={createPasskey} disabled={!!busy}>
                  <Fingerprint size={17} /> {busy === 'passkey' ? 'Waiting for your device…' : 'Create passkey'}
                </button>
                <button className={s.btnGhost} onClick={useExisting} disabled={!!busy}>
                  {busy === 'recover' ? 'Waiting for your device…' : 'I already have one'}
                </button>
              </div>
              <div className={s.facts}>
                <div className={s.fact}><Check size={14} /> The private key never leaves your authenticator</div>
                <div className={s.fact}><Check size={14} /> Synced passkeys work on your other devices too</div>
                <div className={s.fact}><Check size={14} /> No seed phrase, no browser extension</div>
              </div>
            </>
          )}
        </section>

        {/* Step 2: grant */}
        <section className={s.card} id="pk-grant">
          <div className={s.cardHead}>
            <span className={s.cardTitle}>
              <ShieldCheck size={18} /> Grant a mandate
            </span>
            <span className={s.cardNum}>02</span>
          </div>
          <div className={s.presets}>
            {PRESETS.map((p, i) => {
              const Icon = p.icon;
              return (
                <button key={p.label} className={`${s.preset} ${preset === i ? s.presetOn : ''}`} onClick={() => applyPreset(i)}>
                  <span className={s.presetTitle}>
                    <Icon size={14} /> {p.label}
                  </span>
                  <span className={s.presetMeta} style={{ display: 'block' }}>
                    {p.perCall} · {p.budget} MON · {p.days}d
                  </span>
                </button>
              );
            })}
          </div>

          <div className={s.group}>Who</div>
          <div className={s.fields}>
            <div className={s.field}>
              <label htmlFor={fid('agent')}>Agent wallet</label>
              <input id={fid('agent')} className={`${s.input} ${s.monoInput} ${badAgent ? s.inputBad : ''}`} value={form.agent} onChange={set('agent')} placeholder="0x…" />
            </div>
            <div className={s.field}>
              <label htmlFor={fid('agent-id')}>ERC-8004 agent ID</label>
              <input id={fid('agent-id')} className={s.input} value={form.agentId} onChange={set('agentId')} placeholder="e.g. 12" />
            </div>
          </div>

          <div className={s.group}>What it may call</div>
          <div className={s.fields}>
            <div className={`${s.field} ${s.full}`}>
              <label htmlFor={fid('target')}>Allowed contract</label>
              <input id={fid('target')} className={`${s.input} ${s.monoInput} ${badTarget ? s.inputBad : ''}`} value={form.target} onChange={set('target')} />
            </div>
            <div className={`${s.field} ${s.full}`}>
              <label htmlFor={fid('fn')}>Allowed function</label>
              <input id={fid('fn')} className={`${s.input} ${s.monoInput}`} value={form.fn} onChange={set('fn')} />
              <small>A signature like transfer(address,uint256), a 4-byte selector, or &quot;any&quot;.</small>
            </div>
          </div>

          <div className={s.group}>Limits</div>
          <div className={s.fields3}>
            <div className={s.field}>
              <label htmlFor={fid('per-call')}>Max per call</label>
              <div className={s.inputWrap}>
                <input id={fid('per-call')} className={s.input} value={form.perCall} onChange={set('perCall')} inputMode="decimal" />
                <span className={s.unit}>MON</span>
              </div>
            </div>
            <div className={s.field}>
              <label htmlFor={fid('budget')}>Total budget</label>
              <div className={s.inputWrap}>
                <input id={fid('budget')} className={s.input} value={form.budget} onChange={set('budget')} inputMode="decimal" />
                <span className={s.unit}>MON</span>
              </div>
            </div>
            <div className={s.field}>
              <label htmlFor={fid('days')}>Expires in</label>
              <div className={s.inputWrap}>
                <input id={fid('days')} className={s.input} value={form.days} onChange={set('days')} inputMode="decimal" />
                <span className={s.unit}>days</span>
              </div>
            </div>
          </div>

          <button type="button" className={s.toggle} onClick={() => setUseToken((v) => !v)} aria-pressed={useToken}>
            <span>
              <span className={s.toggleTitle}>
                <Coins size={15} /> Stablecoin budget
              </span>
              <span className={s.toggleText} style={{ display: 'block' }}>
                Let the agent pay one payee in an ERC-20, with its own caps and vault.
              </span>
            </span>
            <span className={`${s.switch} ${useToken ? s.switchOn : ''}`} />
          </button>
          {useToken && (
            <div className={`${s.fields} ${s.reveal}`}>
              <div className={s.field}>
                <label htmlFor={fid('token')}>Token</label>
                <input id={fid('token')} className={`${s.input} ${s.monoInput}`} value={form.token} onChange={set('token')} placeholder="0x… e.g. USDC" />
              </div>
              <div className={s.field}>
                <label htmlFor={fid('payee')}>Payee</label>
                <input id={fid('payee')} className={`${s.input} ${s.monoInput}`} value={form.payee} onChange={set('payee')} placeholder="0x… API / merchant" />
              </div>
              <div className={s.field}>
                <label htmlFor={fid('token-per-call')}>Token per call</label>
                <input id={fid('token-per-call')} className={s.input} value={form.tokenPerCall} onChange={set('tokenPerCall')} inputMode="decimal" />
              </div>
              <div className={s.field}>
                <label htmlFor={fid('token-budget')}>Token budget</label>
                <input id={fid('token-budget')} className={s.input} value={form.tokenBudget} onChange={set('tokenBudget')} inputMode="decimal" />
              </div>
            </div>
          )}

          {relay?.enabled && sponsorMax > 0n && (
            <button type="button" className={s.toggle} onClick={() => setForm((f) => ({ ...f, sponsor: !f.sponsor }))} aria-pressed={form.sponsor}>
              <span>
                <span className={s.toggleTitle}>
                  <Zap size={15} /> Demo: relayer funds the vault
                </span>
                <span className={s.toggleText} style={{ display: 'block' }}>
                  {relayCanSponsor(relay, sponsorAmount)
                    ? `Up to ${formatEther(sponsorAmount)} MON, so the agent can act right away.`
                    : 'The relayer is low on MON right now, so the vault starts empty. Anyone can fund it later with deposit() on the contract.'}
                </span>
              </span>
              <span className={`${s.switch} ${form.sponsor ? s.switchOn : ''}`} />
            </button>
          )}

          <div className={s.summary}>
            <div className={s.summaryHead}>
              <Fingerprint size={13} /> You are signing
            </div>
            <p className={s.summaryText}>
              Agent <b className={s.mono}>{form.agent ? short(form.agent, 4) : '0x…'}</b>
              {form.agentId ? <> (ERC-8004 <b>#{form.agentId}</b>)</> : null} may call <code>{fnLabel}</code> on{' '}
              <b className={s.mono}>{form.target ? short(form.target, 4) : '0x…'}</b>, up to <b>{form.perCall || '0'} MON</b> per call and{' '}
              <b>{form.budget || '0'} MON</b> in total, for <b>{days} day{days === 1 ? '' : 's'}</b>
              {useToken && form.token ? (
                <>
                  , and pay up to <b>{form.tokenBudget}</b> tokens to <b className={s.mono}>{form.payee ? short(form.payee, 4) : '0x…'}</b>
                </>
              ) : null}
              . Everything else reverts.
            </p>
            <div className={s.summaryFoot}>You can revoke it at any time with one more tap.</div>
          </div>

          <div className={s.btnRow}>
            <button className={`${s.btn} ${s.btnLg}`} onClick={grant} disabled={!!busy || !!grantBlocker}>
              <Fingerprint size={17} /> {busy === 'grant' ? 'Confirm on your device…' : 'Sign with passkey & create'}
            </button>
          </div>
          {grantBlocker && !busy && (
            <div className={s.hint}>
              <Lock size={12} /> {grantBlocker}
            </div>
          )}
        </section>
      </div>

      {/* Step 3: mandates */}
      <section className={s.card} id="pk-mandates">
        <div className={s.cardHead}>
          <span className={s.cardTitle}>
            <Wallet size={18} /> Your mandates
            {rows && rows.length > 0 && <span className={s.pillIdle}>{activeCount} active · {rows.length} total</span>}
          </span>
          <button className={`${s.btnGhost} ${s.btnSm}`} onClick={refresh} disabled={!passkey || !client}>
            <RefreshCw size={13} /> Refresh
          </button>
        </div>
        {!passkey ? (
          <div className={s.empty}>
            <span className={s.emptyIcon}><KeyRound size={20} /></span>
            <span className={s.emptyTitle}>No passkey on this device yet</span>
            <span>Create one in step 1 to see the mandates it owns.</span>
          </div>
        ) : !rows ? (
          <div className={s.mandates}>
            <div className={s.skeleton} />
            <div className={s.skeleton} />
          </div>
        ) : rows.length === 0 ? (
          <div className={s.empty}>
            <span className={s.emptyIcon}><Inbox size={20} /></span>
            <span className={s.emptyTitle}>No mandates yet</span>
            <span>Grant one above. It shows up here the moment Monad confirms it.</span>
          </div>
        ) : (
          <>
            {rows.some((r) => r.m.balance > 0n) && (
              <div className={s.withdrawBar}>
                <div className={s.field}>
                  <label htmlFor={fid('withdraw-to')}>Withdraw unspent funds to</label>
                  <input id={fid('withdraw-to')} className={`${s.input} ${s.monoInput}`} value={withdrawTo} onChange={(e) => setWithdrawTo(e.target.value)} placeholder="0x… any address you control" />
                </div>
              </div>
            )}
            <div className={s.mandates}>
              {rows.map((row) => {
                const pct = row.m.budget > 0n ? Number((row.m.spent * 1000n) / row.m.budget) / 10 : 0;
                const expired = row.m.expiresAt !== 0n && Number(row.m.expiresAt) * 1000 < Date.now();
                const revoked = row.m.revoked || row.revokedAll;
                return (
                  <div key={row.id.toString()} className={`${s.mandate} ${row.active ? '' : s.mandateDead}`}>
                    <div className={s.mandateTop}>
                      <span className={s.mandateId}>
                        <Bot size={16} style={{ color: 'var(--accent-monad)' }} /> Mandate #{row.id.toString()}
                      </span>
                      <span className={row.active ? s.pillOk : revoked ? s.pillOff : s.pillIdle}>
                        {row.active ? 'ACTIVE' : revoked ? 'REVOKED' : expired ? 'EXPIRED' : 'INACTIVE'}
                      </span>
                    </div>
                    <div className={s.mandateAgent}>
                      agent {short(row.m.agent, 4)} · ERC-8004 #{row.m.agentId.toString()}
                    </div>

                    <div className={s.spendRow}>
                      <span>
                        <span className={s.spendBig}>{formatEther(row.m.spent)}</span> / {formatEther(row.m.budget)} MON spent
                      </span>
                      <span className={s.mono}>{pct.toFixed(0)}%</span>
                    </div>
                    <div className={s.meter}>
                      <div className={s.meterFill} style={{ width: `${Math.min(pct, 100)}%` }} />
                    </div>

                    {row.tokens.map((t) => {
                      const tp = t.budget > 0n ? Number((t.spent * 1000n) / t.budget) / 10 : 0;
                      return (
                        <div key={t.token}>
                          <div className={s.spendRow} style={{ marginTop: '0.6rem' }}>
                            <span>
                              {tokenAmount(t.spent, t.decimals)} / {tokenAmount(t.budget, t.decimals)} {t.symbol}
                              {t.decimals === null ? ' (raw units, decimals unknown)' : ''} spent
                            </span>
                            <span className={s.mono}>vault {tokenAmount(t.balance, t.decimals)}</span>
                          </div>
                          <div className={s.meter}>
                            <div className={`${s.meterFill} ${s.meterToken}`} style={{ width: `${Math.min(tp, 100)}%` }} />
                          </div>
                        </div>
                      );
                    })}

                    <div className={s.stats}>
                      <div className={s.stat}>
                        <span>Per call</span>
                        <b>{formatEther(row.m.maxPerCall)}</b>
                      </div>
                      <div className={s.stat}>
                        <span>Vault</span>
                        <b>{formatEther(row.m.balance)}</b>
                      </div>
                      <div className={s.stat}>
                        <span>Expires</span>
                        <b>{row.m.expiresAt === 0n ? 'never' : new Date(Number(row.m.expiresAt) * 1000).toLocaleDateString()}</b>
                      </div>
                    </div>
                    <div className={s.perms}>
                      {row.permissions.map((p, i) => (
                        <span key={i} className={s.perm}>
                          {short(p.target, 4)} · {p.selector === ANY_SELECTOR ? 'any fn' : p.selector}
                        </span>
                      ))}
                    </div>
                    <div className={s.mandateActions}>
                      <button className={`${s.btnDanger} ${s.btnSm}`} onClick={() => revoke(row.id)} disabled={!!busy || !row.active}>
                        <ShieldOff size={14} /> {busy === `revoke-${row.id}` ? 'Confirm on device…' : 'Revoke'}
                      </button>
                      <button className={`${s.btnGhost} ${s.btnSm}`} onClick={() => withdraw(row)} disabled={!!busy || row.m.balance === 0n}>
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

      {/* Step 4: what next */}
      <div className={s.next}>
        <a className={s.nextCard} href="#verify">
          <span className={s.nextIcon}><ScanSearch size={19} /></span>
          <span>
            <span className={s.nextTitle} style={{ display: 'block' }}>Try to break it</span>
            <span className={s.nextText} style={{ display: 'block' }}>Overspend, rogue target, impostor agent: see what the chain says.</span>
          </span>
          <ArrowRight size={18} className={s.nextArrow} />
        </a>
        <a className={s.nextCard} href="#docs">
          <span className={s.nextIcon}><Code2 size={19} /></span>
          <span>
            <span className={s.nextTitle} style={{ display: 'block' }}>Plug in your agent</span>
            <span className={s.nextText} style={{ display: 'block' }}>MCP server for Claude and Cursor, TypeScript SDK, Solidity hook.</span>
          </span>
          <ArrowRight size={18} className={s.nextArrow} />
        </a>
      </div>

      {busy && (
        <div className={s.waiting} role="status">
          <span className={s.waitingIcon}><Fingerprint size={17} /></span>
          <span>
            <span style={{ display: 'block', fontWeight: 600 }}>{busyLabel}</span>
            <span className={s.waitingSub}>Confirm on your device, then Monad does the rest</span>
          </span>
        </div>
      )}

      {notice && !busy && (
        <div className={s.floater} role="status">
          <div className={notice.kind === 'ok' ? s.noticeOk : notice.kind === 'err' ? s.noticeErr : s.notice}>
            {notice.kind === 'ok' ? <CheckCircle2 size={16} /> : notice.kind === 'warn' ? <AlertTriangle size={16} /> : <XCircle size={16} />}
            <span>
              {notice.text}{' '}
              {notice.hash && (
                <a href={`${EXPLORER}/tx/${notice.hash}`} target="_blank" rel="noreferrer">
                  View transaction <ExternalLink size={11} />
                </a>
              )}
            </span>
            <button className={s.floaterClose} onClick={() => setNotice(null)} aria-label="Dismiss">
              <X size={15} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
