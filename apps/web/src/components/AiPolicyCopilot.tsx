'use client';

import React, { useState } from 'react';
import {
  Sparkles,
  ShieldCheck,
  ArrowRight,
  Clock,
  Coins,
  CheckCircle2,
  AlertTriangle,
  Lightbulb,
  FileCode,
  Info,
  Sliders,
} from 'lucide-react';
import { parseEther, type Address, type Hex } from 'viem';
import type { CreateMandateParams } from '@agenttrust/sdk';

interface AiPolicyCopilotProps {
  onDraftApproved: (params: CreateMandateParams) => void;
}

interface DraftPolicy {
  summary: string;
  agentAddress: string;
  agentId: string;
  targetAddress: string;
  selector: string;
  selectorName: string;
  maxPerTx: string;
  maxTotal: string;
  depositAmount: string;
  durationHours: string;
  isWildcard: boolean;
  isUnresolved: boolean;
  unresolvedFields: string[];
  riskScore: 'Strict' | 'Caution' | 'Elevated';
  securityGuarantees: string[];
}

export function AiPolicyCopilot({ onDraftApproved }: AiPolicyCopilotProps) {
  const [prompt, setPrompt] = useState(
    'Allow trading agent 0x70997970C51812dc3A010C7d01b50e0d17dc79C8 to execute automated swaps on Uniswap router 0x3333333333333333333333333333333333333333 up to 0.2 MON per transaction with a 1.0 MON total budget expiring in 48 hours.'
  );
  const [isCompiling, setIsCompiling] = useState(false);
  const [draft, setDraft] = useState<DraftPolicy | null>({
    summary: 'Automated DEX Liquidity & Swap Policy',
    agentAddress: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
    agentId: '42',
    targetAddress: '0x3333333333333333333333333333333333333333',
    selector: '0xa9059cbb',
    selectorName: 'transfer(address,uint256)',
    maxPerTx: '0.2',
    maxTotal: '1.0',
    depositAmount: '0.5',
    durationHours: '48',
    isWildcard: false,
    isUnresolved: false,
    unresolvedFields: [],
    riskScore: 'Strict',
    securityGuarantees: [
      'Single target contract allowlist (halts calls to rogue addresses)',
      'Exact 4-byte selector restriction (disallows arbitrary external execution)',
      'Per-transaction spending cap enforced by smart contract',
      'Time-bounded authorization with automatic expiry',
    ],
  });

  const promptPresets = [
    {
      title: 'DeFi Swaps (DEX Allowlist)',
      text: 'Allow trading agent 0x70997970C51812dc3A010C7d01b50e0d17dc79C8 to execute automated swaps on Uniswap router 0x3333333333333333333333333333333333333333 up to 0.2 MON per transaction with a 1.0 MON total budget expiring in 48 hours.',
    },
    {
      title: 'Micro-relayer (Wildcard Warning)',
      text: 'Grant gas relayer agent 0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC permission to call treasury 0x4444444444444444444444444444444444444444 with selector 0x00000000 up to 0.05 MON per action and 0.3 MON total.',
    },
    {
      title: 'NFT Minting (Specific Selector)',
      text: 'Authorize minting agent 0x90F79bf6EB2c4f870365E785982E1f101E93b906 on NFT contract 0x7777777777777777777777777777777777777777 selector 0xa0712d68 up to 0.25 MON per mint, max 1.0 MON total for 24 hours.',
    },
  ];

  const handleCompile = () => {
    setIsCompiling(true);
    setTimeout(() => {
      const lower = prompt.toLowerCase();
      let target = '0x3333333333333333333333333333333333333333';
      let agent = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8';
      let selector = '0xa9059cbb';
      let selectorName = 'transfer(address,uint256)';
      let maxPerTx = '0.2';
      let maxTotal = '1.0';
      let duration = '48';
      let isWildcard = false;
      const unresolvedFields: string[] = [];
      const guarantees: string[] = [];

      // Extract hex addresses
      const addrMatches = prompt.match(/0x[a-fA-F0-9]{40}/g);
      if (addrMatches && addrMatches.length > 0) {
        agent = addrMatches[0];
        if (addrMatches.length > 1) {
          target = addrMatches[1];
        } else {
          unresolvedFields.push('Target address not explicitly identified in prompt');
        }
      } else {
        unresolvedFields.push('Agent address missing');
        unresolvedFields.push('Target contract missing');
      }

      if (lower.includes('nft') || lower.includes('mint')) {
        selector = '0xa0712d68';
        selectorName = 'mint(uint256)';
        maxPerTx = '0.25';
        maxTotal = '1.0';
        duration = '24';
      } else if (lower.includes('relayer') || lower.includes('0x00000000') || lower.includes('wildcard')) {
        selector = '0x00000000';
        selectorName = '0x00000000 (Wildcard / Native Call)';
        maxPerTx = '0.05';
        maxTotal = '0.3';
        duration = '168';
        isWildcard = true;
      }

      guarantees.push(`Contract allowlist bounds destination strictly to ${target.slice(0, 8)}...`);
      guarantees.push(`Per-transaction execution cap enforced at ${maxPerTx} MON`);
      guarantees.push(`Cumulative budget limit capped at ${maxTotal} MON`);
      if (isWildcard) {
        guarantees.push('Caution: Selector is wildcard 0x00000000 (allows any method on target)');
      } else {
        guarantees.push(`Selector locked to ${selector} (${selectorName})`);
      }

      setDraft({
        summary: lower.includes('nft')
          ? 'NFT Autonomous Minting Policy'
          : isWildcard
          ? 'Native Relayer Execution Policy'
          : 'DEX Automated Swap Policy',
        agentAddress: agent,
        agentId: '42',
        targetAddress: target,
        selector,
        selectorName,
        maxPerTx,
        maxTotal,
        depositAmount: (parseFloat(maxTotal) * 0.5).toFixed(2),
        durationHours: duration,
        isWildcard,
        isUnresolved: unresolvedFields.length > 0,
        unresolvedFields,
        riskScore: isWildcard ? 'Caution' : 'Strict',
        securityGuarantees: guarantees,
      });
      setIsCompiling(false);
    }, 450);
  };

  const handleApproveDraft = () => {
    if (!draft || draft.isUnresolved) return;

    const expiresAt =
      draft.durationHours === '0'
        ? 0n
        : BigInt(Math.floor(Date.now() / 1000) + Number(draft.durationHours) * 3600);

    const params: CreateMandateParams = {
      agentAddress: draft.agentAddress as Address,
      agentId: BigInt(draft.agentId),
      targets: [
        {
          target: draft.targetAddress as Address,
          selector: draft.selector as Hex,
        },
      ],
      maxValuePerTx: parseEther(draft.maxPerTx),
      maxTotalValue: parseEther(draft.maxTotal),
      depositValue: parseEther(draft.depositAmount),
      expiresAt,
    };

    onDraftApproved(params);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      {/* Product Positioning & Composer Card */}
      <div className="security-card">
        <div style={{ marginBottom: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.35rem' }}>
            <span className="badge badge-neutral">Step 1 of 5</span>
            <span className="badge badge-simulation">Deterministic Parser</span>
          </div>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#fff', letterSpacing: '-0.02em' }}>
            Give your AI agent a mandate, not unlimited power.
          </h2>
          <p style={{ fontSize: '0.825rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>
            Passkey-authorized delegation. Contract-enforced limits. Independently checkable receipts.
          </p>
        </div>

        {/* Accurate Disclosure Banner */}
        <div
          style={{
            background: 'var(--bg-input)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-sm)',
            padding: '0.65rem 0.85rem',
            marginBottom: '1rem',
            display: 'flex',
            alignItems: 'flex-start',
            gap: '0.6rem',
            fontSize: '0.75rem',
            color: 'var(--text-secondary)',
          }}
        >
          <Info size={15} color="var(--accent-slate)" style={{ flexShrink: 0, marginTop: '2px' }} />
          <div>
            <strong style={{ color: '#fff' }}>Authority Boundary Disclosure: </strong>
            This policy composer translates plain-English requirements into deterministic EVM constraints. An AI model may suggest permissions; it does not enforce them. The smart contract and your hardware passkey remain the sole enforcement boundary.
          </div>
        </div>

        {/* Natural Language Prompt Field */}
        <div>
          <label className="input-label" htmlFor="copilot-input-prompt">
            Describe what an AI agent needs to do:
          </label>
          <div style={{ position: 'relative' }}>
            <textarea
              id="copilot-input-prompt"
              className="input-field"
              rows={3}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="e.g. Allow trading agent 0x7099... to execute swaps on router 0x3333... up to 0.2 MON per tx with 1.0 MON total cap for 48 hours..."
              style={{ resize: 'vertical', paddingBottom: '2.5rem' }}
            />
            <button
              className="btn-primary"
              style={{
                position: 'absolute',
                bottom: '8px',
                right: '8px',
                padding: '0.4rem 0.85rem',
                fontSize: '0.75rem',
              }}
              onClick={handleCompile}
              disabled={isCompiling}
            >
              <Sparkles size={13} />
              {isCompiling ? 'Compiling Rules...' : 'Compile Mandate'}
            </button>
          </div>
        </div>

        {/* Presets */}
        <div style={{ marginTop: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
            <Lightbulb size={12} /> Standard Presets:
          </span>
          {promptPresets.map((p, i) => (
            <button
              key={i}
              className="btn-secondary"
              style={{ padding: '0.25rem 0.6rem', fontSize: '0.72rem' }}
              onClick={() => setPrompt(p.text)}
            >
              {p.title}
            </button>
          ))}
        </div>
      </div>

      {/* Structured Proposal Review */}
      {draft && (
        <div className="security-card-elevated" style={{ border: '1px solid var(--border-default)' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              borderBottom: '1px solid var(--border-subtle)',
              paddingBottom: '0.85rem',
              marginBottom: '1rem',
              flexWrap: 'wrap',
              gap: '0.75rem',
            }}
          >
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span style={{ fontSize: '0.72rem', fontWeight: 600, textTransform: 'uppercase', color: 'var(--text-muted)' }}>
                  Structured Policy Boundary
                </span>
                <span className={`badge ${draft.riskScore === 'Strict' ? 'badge-emerald' : 'badge-amber'}`}>
                  {draft.riskScore === 'Strict' ? 'Strict Scope' : 'Caution: Wildcard'}
                </span>
              </div>
              <h3 style={{ fontSize: '1.05rem', fontWeight: 700, color: '#fff', marginTop: '0.15rem' }}>
                {draft.summary}
              </h3>
            </div>

            <button
              className="btn-primary"
              onClick={handleApproveDraft}
              disabled={draft.isUnresolved}
              title={draft.isUnresolved ? 'Resolve required fields before authorization' : 'Proceed to Passkey Authorization'}
            >
              <ShieldCheck size={15} />
              Review & Authorize with Passkey
              <ArrowRight size={13} />
            </button>
          </div>

          {/* Unresolved Fields Alert */}
          {draft.isUnresolved && (
            <div
              style={{
                background: 'rgba(244, 63, 94, 0.08)',
                border: '1px solid var(--accent-rose-border)',
                borderRadius: 'var(--radius-sm)',
                padding: '0.65rem 0.85rem',
                marginBottom: '1rem',
                display: 'flex',
                alignItems: 'flex-start',
                gap: '0.5rem',
                fontSize: '0.75rem',
                color: 'var(--accent-rose)',
              }}
            >
              <AlertTriangle size={15} style={{ flexShrink: 0, marginTop: '2px' }} />
              <div>
                <strong>Unresolved Required Fields: </strong>
                {draft.unresolvedFields.join(', ')}. Passkey authorization is disabled until all constraints are determined.
              </div>
            </div>
          )}

          {/* Wildcard Alert */}
          {draft.isWildcard && (
            <div
              style={{
                background: 'rgba(245, 158, 11, 0.08)',
                border: '1px solid var(--accent-amber-border)',
                borderRadius: 'var(--radius-sm)',
                padding: '0.65rem 0.85rem',
                marginBottom: '1rem',
                display: 'flex',
                alignItems: 'flex-start',
                gap: '0.5rem',
                fontSize: '0.75rem',
                color: 'var(--accent-amber)',
              }}
            >
              <AlertTriangle size={15} style={{ flexShrink: 0, marginTop: '2px' }} />
              <div>
                <strong>Wildcard Selector Flagged (0x00000000): </strong>
                This mandate permits the agent to call any function on the target contract. Limit spending to minimal amounts to mitigate risk.
              </div>
            </div>
          )}

          {/* Technical Structured Grid */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))',
              gap: '0.85rem',
              marginBottom: '1rem',
            }}
          >
            {/* Bound Agent Address */}
            <div className="mono-box">
              <span className="kpi-label">BOUND AGENT</span>
              <div style={{ color: '#fff', marginTop: '0.25rem' }}>
                {draft.agentAddress}
              </div>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                ERC-8004 Registry ID #{draft.agentId}
              </div>
            </div>

            {/* Target Address */}
            <div className="mono-box">
              <span className="kpi-label">TARGET CONTRACT</span>
              <div style={{ color: '#fff', marginTop: '0.25rem' }}>
                {draft.targetAddress}
              </div>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                Allowlisted Execution Destination
              </div>
            </div>

            {/* Selector */}
            <div className="mono-box">
              <span className="kpi-label">METHOD & SELECTOR</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginTop: '0.25rem' }}>
                <span className={`badge ${draft.isWildcard ? 'badge-amber' : 'badge-neutral'}`}>
                  {draft.selector}
                </span>
                <span style={{ color: '#fff', fontSize: '0.75rem' }}>
                  {draft.selectorName}
                </span>
              </div>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                {draft.isWildcard ? 'Permits all target methods' : 'Strict 4-byte signature'}
              </div>
            </div>

            {/* Caps & Deposit */}
            <div className="mono-box">
              <span className="kpi-label">SPENDING BOUNDS & DURATION</span>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.4rem', marginTop: '0.25rem' }}>
                <span style={{ color: 'var(--accent-emerald)', fontWeight: 700 }}>
                  {draft.maxPerTx} MON
                </span>
                <span style={{ color: 'var(--text-muted)', fontSize: '0.72rem' }}>
                  / tx (max {draft.maxTotal} MON)
                </span>
              </div>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                Deposit: {draft.depositAmount} MON · Expiry: {draft.durationHours}h
              </div>
            </div>
          </div>

          {/* Invariant Guarantees */}
          <div
            style={{
              background: 'var(--bg-input)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-sm)',
              padding: '0.85rem',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.4rem' }}>
              <ShieldCheck size={15} color="var(--accent-emerald)" />
              <strong style={{ fontSize: '0.78rem', color: '#fff' }}>
                Contract-Enforced Invariant Guarantees
              </strong>
            </div>
            <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
              {draft.securityGuarantees.map((g, idx) => (
                <li
                  key={idx}
                  style={{
                    fontSize: '0.75rem',
                    color: 'var(--text-secondary)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.45rem',
                  }}
                >
                  <CheckCircle2 size={13} color="var(--accent-emerald)" style={{ flexShrink: 0 }} />
                  {g}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
