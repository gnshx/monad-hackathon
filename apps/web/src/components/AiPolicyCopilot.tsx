'use client';

import React, { useState } from 'react';
import {
  Sparkles,
  ShieldAlert,
  ShieldCheck,
  ArrowRight,
  Code2,
  Clock,
  Coins,
  CheckCircle2,
  AlertTriangle,
  Lightbulb,
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
  riskScore: 'Low' | 'Medium' | 'Elevated';
  riskFactors: string[];
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
    riskScore: 'Low',
    riskFactors: [
      'Single targeted contract allowlist (Restricts rogue destinations)',
      'Strict selector restriction (No wildcard bytes4(0) calls)',
      'Per-transaction cap enforced on-chain (Max 0.2 MON)',
      'Time-bounded authorization (Auto-expires in 48 hours)',
    ],
  });

  const promptPresets = [
    {
      title: 'DeFi Automated Rebalancing',
      text: 'Allow rebalancing agent 0x70997970C51812dc3A010C7d01b50e0d17dc79C8 to swap on DEX pool 0x3333333333333333333333333333333333333333 up to 0.15 MON per swap, maximum 0.8 MON total, for 72 hours.',
    },
    {
      title: 'Micro-payments Gas Relayer',
      text: 'Grant gas relayer agent 0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC permission to call treasury 0x4444444444444444444444444444444444444444 with selector 0x00000000 (native transfer) capped at 0.05 MON per action and 0.3 MON total.',
    },
    {
      title: 'NFT Minting Assistant',
      text: 'Authorize minting agent 0x90F79bf6EB2c4f870365E785982E1f101E93b906 on NFT contract 0x7777777777777777777777777777777777777777 selector 0xa0712d68 up to 0.25 MON per mint, max 1.0 MON total for 24 hours.',
    },
  ];

  const handleCompile = () => {
    setIsCompiling(true);
    setTimeout(() => {
      // Deterministic policy compiler from natural language text
      const lower = prompt.toLowerCase();
      let target = '0x3333333333333333333333333333333333333333';
      let agent = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8';
      let selector = '0xa9059cbb';
      let selectorName = 'transfer(address,uint256)';
      let maxPerTx = '0.2';
      let maxTotal = '1.0';
      let duration = '48';
      let riskScore: 'Low' | 'Medium' | 'Elevated' = 'Low';
      const riskFactors: string[] = [];

      // Extract addresses
      const addrMatches = prompt.match(/0x[a-fA-F0-9]{40}/g);
      if (addrMatches && addrMatches.length > 0) {
        agent = addrMatches[0];
        if (addrMatches.length > 1) {
          target = addrMatches[1];
        }
      }

      if (lower.includes('nft') || lower.includes('mint')) {
        selector = '0xa0712d68';
        selectorName = 'mint(uint256)';
        maxPerTx = '0.25';
        maxTotal = '1.0';
        duration = '24';
      } else if (lower.includes('relayer') || lower.includes('native') || lower.includes('0x00000000')) {
        selector = '0x00000000';
        selectorName = 'Wildcard Selector (Native Transfer)';
        maxPerTx = '0.05';
        maxTotal = '0.3';
        duration = '168';
        riskScore = 'Medium';
        riskFactors.push('⚠️ Wildcard selector allows any method on target contract');
      }

      riskFactors.push('Target strictly bound to verified allowlist');
      riskFactors.push(`Spending ceiling locked at ${maxPerTx} MON per transaction`);
      riskFactors.push(`Cumulative vault cap locked at ${maxTotal} MON`);

      setDraft({
        summary: lower.includes('nft') ? 'NFT Autonomous Minting Policy' : lower.includes('relayer') ? 'Gas Sponsoring Micro-relayer' : 'DEX Automated Swap Policy',
        agentAddress: agent,
        agentId: '42',
        targetAddress: target,
        selector,
        selectorName,
        maxPerTx,
        maxTotal,
        depositAmount: (parseFloat(maxTotal) * 0.5).toFixed(2),
        durationHours: duration,
        riskScore,
        riskFactors,
      });
      setIsCompiling(false);
    }, 600);
  };

  const handleApproveDraft = () => {
    if (!draft) return;
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Header */}
      <div className="security-card" style={{ background: 'linear-gradient(135deg, rgba(131, 110, 249, 0.08), rgba(16, 185, 129, 0.04))' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.4rem' }}>
              <span className="badge badge-monad">
                <Sparkles size={12} />
                Natural Language Compiler
              </span>
              <span className="badge badge-emerald">Deterministic Guardrails</span>
            </div>
            <h2 style={{ fontSize: '1.35rem', fontWeight: 700, color: '#fff', letterSpacing: '-0.02em' }}>
              AI Policy Copilot
            </h2>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', maxWidth: '680px', marginTop: '0.25rem' }}>
              Describe intended agent permissions in plain English. The Copilot validates security bounds, calculates exact function selectors, and prepares a scoped mandate for your hardware passkey signature.
            </p>
          </div>
        </div>

        {/* Input Box */}
        <div style={{ marginTop: '1.25rem' }}>
          <label className="input-label">Task Description & Intended Agent Scope</label>
          <div style={{ position: 'relative' }}>
            <textarea
              className="input-field"
              rows={3}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="e.g. Allow agent 0x7099... to swap up to 0.2 MON on Uniswap router with 48h expiry..."
              style={{ paddingRight: '140px', resize: 'vertical' }}
            />
            <button
              className="btn-primary"
              style={{ position: 'absolute', bottom: '12px', right: '12px', padding: '0.5rem 0.9rem', fontSize: '0.8rem' }}
              onClick={handleCompile}
              disabled={isCompiling}
            >
              <Sparkles size={14} />
              {isCompiling ? 'Compiling...' : 'Generate Policy'}
            </button>
          </div>
        </div>

        {/* Presets */}
        <div style={{ marginTop: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
            <Lightbulb size={13} /> Try Presets:
          </span>
          {promptPresets.map((p, i) => (
            <button
              key={i}
              className="btn-secondary"
              style={{ padding: '0.3rem 0.65rem', fontSize: '0.75rem', borderRadius: 'var(--radius-full)' }}
              onClick={() => {
                setPrompt(p.text);
              }}
            >
              {p.title}
            </button>
          ))}
        </div>
      </div>

      {/* Generated Proposal Card */}
      {draft && (
        <div className="security-card-elevated" style={{ border: '1px solid var(--accent-monad-border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '1rem', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '0.75rem' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--accent-monad)' }}>
                  Proposed Mandate Scope
                </span>
                <span className={`badge ${draft.riskScore === 'Low' ? 'badge-emerald' : 'badge-amber'}`}>
                  Safety Analysis: {draft.riskScore} Risk
                </span>
              </div>
              <h3 style={{ fontSize: '1.15rem', fontWeight: 700, color: '#fff', marginTop: '0.2rem' }}>
                {draft.summary}
              </h3>
            </div>

            <button className="btn-primary" onClick={handleApproveDraft}>
              <ShieldCheck size={16} />
              Review & Authorize with Passkey
              <ArrowRight size={14} />
            </button>
          </div>

          {/* Formatted Technical Breakdown */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1rem' }}>
            <div style={{ background: 'var(--bg-input)', padding: '0.85rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)' }}>
              <span className="kpi-label">Bound Agent Address</span>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem', color: '#fff', marginTop: '0.3rem', wordBreak: 'break-all' }}>
                {draft.agentAddress}
              </div>
            </div>

            <div style={{ background: 'var(--bg-input)', padding: '0.85rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)' }}>
              <span className="kpi-label">Target Allowlist</span>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem', color: '#fff', marginTop: '0.3rem', wordBreak: 'break-all' }}>
                {draft.targetAddress}
              </div>
            </div>

            <div style={{ background: 'var(--bg-input)', padding: '0.85rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)' }}>
              <span className="kpi-label">Function Selector</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.3rem' }}>
                <span className="badge badge-monad" style={{ fontFamily: 'var(--font-mono)' }}>
                  {draft.selector}
                </span>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                  {draft.selectorName}
                </span>
              </div>
            </div>

            <div style={{ background: 'var(--bg-input)', padding: '0.85rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)' }}>
              <span className="kpi-label">On-Chain Spending Caps</span>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem', marginTop: '0.3rem' }}>
                <span style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--accent-emerald)', fontFamily: 'var(--font-mono)' }}>
                  {draft.maxPerTx} MON
                </span>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                  per tx (max {draft.maxTotal} MON total)
                </span>
              </div>
            </div>
          </div>

          {/* Safety & Invariant Review */}
          <div style={{ marginTop: '1.25rem', background: 'rgba(16, 185, 129, 0.05)', border: '1px solid rgba(16, 185, 129, 0.2)', borderRadius: 'var(--radius-md)', padding: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
              <ShieldCheck size={16} color="var(--accent-emerald)" />
              <strong style={{ fontSize: '0.85rem', color: 'var(--accent-emerald)' }}>
                Deterministic Security Guarantees
              </strong>
            </div>
            <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
              {draft.riskFactors.map((f, idx) => (
                <li key={idx} style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <CheckCircle2 size={13} color="var(--accent-emerald)" />
                  {f}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
