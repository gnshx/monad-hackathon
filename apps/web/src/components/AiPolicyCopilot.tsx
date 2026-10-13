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
import { DO_SOMETHING_SELECTOR, DO_SOMETHING_SIGNATURE } from '../lib/contracts';

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
  const [prompt, setPrompt] = useState('');
  const [isCompiling, setIsCompiling] = useState(false);
  const [draft, setDraft] = useState<DraftPolicy | null>(null);
  const [approvalError, setApprovalError] = useState<string | null>(null);

  const promptPresets = [
    {
      title: 'Token Transfers (Exact Selector)',
      text: 'Allow trading agent 0x70997970C51812dc3A010C7d01b50e0d17dc79C8 to call treasury 0x3333333333333333333333333333333333333333 with selector 0xa9059cbb up to 0.2 MON per transaction with a 1.0 MON total budget expiring in 48 hours.',
    },
    {
      title: 'Micro-relayer (Wildcard Warning)',
      text: 'Grant gas relayer agent 0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC permission to call treasury 0x4444444444444444444444444444444444444444 with wildcard selector 0x00000000 up to 0.05 MON per action and 0.3 MON total expiring in 168 hours.',
    },
    {
      title: 'NFT Minting (Specific Selector)',
      text: 'Authorize minting agent 0x90F79bf6EB2c4f870365E785982E1f101E93b906 on NFT contract 0x7777777777777777777777777777777777777777 with selector 0xa0712d68 up to 0.25 MON per mint, max 1.0 MON total for 24 hours.',
    },
  ];

  const handleCompile = () => {
    setIsCompiling(true);
    setTimeout(() => {
      const lower = prompt.toLowerCase();
      const unresolvedFields: string[] = [];
      const guarantees: string[] = [];

      const addrMatches = prompt.match(/0x[a-fA-F0-9]{40}/g) ?? [];
      const agent = addrMatches[0] ?? '';
      const target = addrMatches[1] ?? '';
      if (!agent) unresolvedFields.push('Agent address missing from prompt');
      if (!target) unresolvedFields.push('Target contract missing from prompt');

      const selectorMatch = prompt.match(/0x[0-9a-fA-F]{8}(?![0-9a-fA-F])/);
      let selector = selectorMatch ? selectorMatch[0].toLowerCase() : '';
      let selectorName = selector ? 'User-specified selector' : '';
      let isWildcard = selector === '0x00000000';
      if (!selector) {
        if (/relayer|native call|wildcard/.test(lower)) {
          selector = '0x00000000';
          selectorName = '0x00000000 (Wildcard / Native Call)';
          isWildcard = true;
        } else if (/dosomething|router|payable/.test(lower)) {
          selector = DO_SOMETHING_SELECTOR;
          selectorName = DO_SOMETHING_SIGNATURE;
        } else if (/mint/.test(lower)) {
          selector = '0xa0712d68';
          selectorName = 'mint(uint256)';
        } else if (/transfer/.test(lower)) {
          selector = '0xa9059cbb';
          selectorName = 'transfer(address,uint256)';
        } else {
          unresolvedFields.push('Method selector not stated (write a 4-byte selector like 0xa9059cbb, or say "wildcard")');
        }
      }

      const perTxMatch = prompt.match(/(\d+(?:\.\d+)?)\s*MON\s*(?:per|each|max(?:imum)?)?\s*(?:tx|transaction|action|transfer|call|mint)/i);
      const totalMatch = prompt.match(/(\d+(?:\.\d+)?)\s*MON\s*(?:total|budget|cap|max|vault|cumulative)/i);
      const depositMatch = prompt.match(/deposit(?:ing)?\s*(\d+(?:\.\d+)?)\s*MON/i);
      const hoursMatch = prompt.match(/(\d+)\s*(?:h|hr|hours?|day|days)/i);

      let maxPerTx = perTxMatch ? perTxMatch[1] : '';
      let maxTotal = totalMatch ? totalMatch[1] : '';
      let depositAmount = depositMatch ? depositMatch[1] : '0';
      let durationHours = '';

      if (hoursMatch) {
        const raw = hoursMatch[0].toLowerCase();
        const num = parseInt(hoursMatch[1], 10);
        durationHours = raw.includes('day') ? (num * 24).toString() : num.toString();
      }

      if (!maxPerTx) unresolvedFields.push('Per-transaction limit missing');
      if (!maxTotal) unresolvedFields.push('Total budget cap missing');
      if (!durationHours) unresolvedFields.push('Expiration duration missing');

      if (agent) guarantees.push(`Strict Caller Binding: Only agent ${agent.slice(0, 8)}... can execute actions`);
      if (target) guarantees.push(`Target Isolation: Any transaction to any address other than ${target.slice(0, 8)}... will revert`);
      if (selector) {
        if (isWildcard) {
          guarantees.push('Wildcard Selector: Calls any method on the target (governed by spending caps only)');
        } else {
          guarantees.push(`Selector Lock: Only calldata matching ${selector} will be executed`);
        }
      }
      if (maxPerTx && maxTotal) {
        guarantees.push(`Ceiling Clamp: Capped at ${maxPerTx} MON / action and ${maxTotal} MON lifetime vault total`);
      }
      if (durationHours) {
        guarantees.push(`Enforced Expiry: Mandate expires ${durationHours} hours after you click Review & Authorize (the create form keeps that exact time)`);
      }

      // ERC-8004 agent ID: only what the prompt states ("agent #7", "agent id 7"). Never invented.
      const agentIdMatch = prompt.match(/agent\s*(?:#|id[:\s#]*)\s*(\d+)/i);
      const parsedAgentId = agentIdMatch ? agentIdMatch[1] : '';

      const isUnresolved = unresolvedFields.length > 0;
      const riskScore = isUnresolved ? 'Elevated' : isWildcard ? 'Caution' : 'Strict';

      setDraft({
        summary: `Authorized ${isWildcard ? 'wildcard' : selectorName || 'call'} on ${target ? `${target.slice(0, 6)}...` : 'target'} up to ${maxPerTx || '?'} MON/tx`,
        agentAddress: agent,
        agentId: parsedAgentId,
        targetAddress: target,
        selector,
        selectorName,
        maxPerTx,
        maxTotal,
        depositAmount,
        durationHours,
        isWildcard,
        isUnresolved,
        unresolvedFields,
        riskScore,
        securityGuarantees: guarantees,
      });

      setIsCompiling(false);
    }, 400);
  };

  const handleApproveDraft = () => {
    setApprovalError(null);
    if (!draft) return;

    if (draft.isUnresolved) {
      setApprovalError(`Cannot authorize: prompt was missing ${draft.unresolvedFields.join(', ')}. Complete these fields before proceeding.`);
      return;
    }

    if (!draft.agentAddress || !draft.agentAddress.startsWith('0x') || draft.agentAddress.length !== 42) {
      setApprovalError('Valid agent address (0x..., 42 chars) is required.');
      return;
    }

    if (!draft.targetAddress || !draft.targetAddress.startsWith('0x') || draft.targetAddress.length !== 42) {
      setApprovalError('Valid target address (0x..., 42 chars) is required.');
      return;
    }

    if (!/^\d+$/.test(draft.agentId.trim())) {
      setApprovalError('The ERC-8004 agent ID was not stated in the prompt. Enter it under Bound Agent (say "agent #7" in the prompt to fill it in).');
      return;
    }

    if (!draft.selector || !draft.selector.startsWith('0x') || draft.selector.length !== 10) {
      setApprovalError('Valid 4-byte selector (e.g. 0xa9059cbb or 0x00000000) is required.');
      return;
    }

    const perTxNum = parseFloat(draft.maxPerTx);
    const totalNum = parseFloat(draft.maxTotal);
    if (isNaN(perTxNum) || perTxNum <= 0) {
      setApprovalError('Per-transaction limit must be greater than zero.');
      return;
    }
    if (isNaN(totalNum) || totalNum < perTxNum) {
      setApprovalError('Total budget must be at least the per-transaction limit.');
      return;
    }

    const hours = parseInt(draft.durationHours, 10);
    const expiresAt = isNaN(hours) || hours <= 0
      ? 0n
      : BigInt(Math.floor(Date.now() / 1000) + hours * 3600);

    const params: CreateMandateParams = {
      agentAddress: draft.agentAddress as Address,
      agentId: BigInt(draft.agentId.trim()),
      targets: [
        {
          target: draft.targetAddress as Address,
          selector: draft.selector as Hex,
        },
      ],
      maxValuePerTx: parseEther(draft.maxPerTx),
      maxTotalValue: parseEther(draft.maxTotal),
      depositValue: parseEther(draft.depositAmount || '0'),
      expiresAt,
    };

    onDraftApproved(params);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      {/* Product Positioning & Composer Card */}
      <div className="security-card" style={{ padding: '1.75rem' }}>
        <div style={{ marginBottom: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.35rem' }}>
            <span className="badge badge-neutral">Step 1 of 5</span>
            <span className="badge badge-simulation">Deterministic Parser</span>
          </div>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>
            Give your AI agent a mandate, not unlimited power.
          </h2>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
            Passkey-authorized delegation. Contract-enforced limits. Independently checkable receipts.
          </p>
        </div>

        {/* Accurate Disclosure Banner */}
        <div
          style={{
            background: 'var(--accent-primary-light)',
            border: '1px solid var(--accent-monad-border)',
            borderRadius: 'var(--radius-md)',
            padding: '0.75rem 1rem',
            marginBottom: '1.25rem',
            display: 'flex',
            alignItems: 'flex-start',
            gap: '0.65rem',
            fontSize: '0.8rem',
            color: 'var(--text-secondary)',
          }}
        >
          <Info size={16} color="#A08FFF" style={{ flexShrink: 0, marginTop: '2px' }} />
          <div>
            <strong style={{ color: 'var(--text-primary)' }}>Authority Boundary Disclosure: </strong>
            This composer parses your plain-English prompt with deterministic in-browser rules — there is no LLM call and no network request. It drafts EVM constraints from what you wrote and never enforces anything: the smart contract and your hardware passkey remain the sole enforcement boundary. Review every parsed value before authorizing.
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
              placeholder="e.g. Allow agent 0x7099... to call treasury 0x3333... with selector 0xa9059cbb up to 0.2 MON per transaction with 1.0 MON total cap for 48 hours..."
              style={{ resize: 'vertical', paddingBottom: '3rem' }}
            />
            <button
              className="btn-primary"
              style={{
                position: 'absolute',
                bottom: '10px',
                right: '10px',
                padding: '0.45rem 1rem',
                fontSize: '0.8rem',
              }}
              onClick={handleCompile}
              disabled={isCompiling}
            >
              <Sparkles size={14} />
              {isCompiling ? 'Compiling Rules...' : 'Compile Mandate'}
            </button>
          </div>
        </div>

        {/* Presets */}
        <div style={{ marginTop: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '0.25rem', fontWeight: 600 }}>
            <Lightbulb size={13} /> Standard Presets:
          </span>
          {promptPresets.map((p, i) => (
            <button
              key={i}
              className="btn-secondary"
              style={{ padding: '0.3rem 0.65rem', fontSize: '0.75rem' }}
              onClick={() => setPrompt(p.text)}
            >
              {p.title}
            </button>
          ))}
        </div>
      </div>

      {/* Structured Proposal Review */}
      {draft && (
        <div className="security-card" style={{ padding: '1.75rem' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              borderBottom: '1px solid var(--border-subtle)',
              paddingBottom: '1rem',
              marginBottom: '1.25rem',
              flexWrap: 'wrap',
              gap: '0.75rem',
            }}
          >
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span style={{ fontSize: '0.725rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)' }}>
                  Structured Policy Boundary
                </span>
                <span
                  className={`badge ${
                    draft.riskScore === 'Strict' ? 'badge-emerald' : draft.riskScore === 'Elevated' ? 'badge-rose' : 'badge-amber'
                  }`}
                >
                  {draft.riskScore === 'Strict'
                    ? 'Strict Scope'
                    : draft.riskScore === 'Elevated'
                    ? 'Incomplete: unresolved fields'
                    : 'Caution: Wildcard'}
                </span>
              </div>
              <h3 style={{ fontSize: '1.15rem', fontWeight: 800, color: 'var(--text-primary)', marginTop: '0.2rem' }}>
                {draft.summary}
              </h3>
            </div>

            <button
              className="btn-primary"
              onClick={handleApproveDraft}
              disabled={draft.isUnresolved}
              title={draft.isUnresolved ? 'Resolve required fields before authorization' : 'Proceed to Passkey Authorization'}
            >
              <ShieldCheck size={16} />
              Review & Authorize with Passkey
              <ArrowRight size={14} />
            </button>
          </div>

          {/* Unresolved Fields Alert */}
          {draft.isUnresolved && (
            <div
              style={{
                background: 'var(--accent-rose-subtle)',
                border: '1px solid var(--accent-rose-border)',
                borderRadius: 'var(--radius-md)',
                padding: '0.75rem 1rem',
                marginBottom: '1rem',
                display: 'flex',
                alignItems: 'flex-start',
                gap: '0.5rem',
                fontSize: '0.8rem',
                color: 'var(--accent-rose)',
              }}
            >
              <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: '2px' }} />
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
                background: 'var(--accent-amber-subtle)',
                border: '1px solid var(--accent-amber-border)',
                borderRadius: 'var(--radius-md)',
                padding: '0.75rem 1rem',
                marginBottom: '1rem',
                display: 'flex',
                alignItems: 'flex-start',
                gap: '0.5rem',
                fontSize: '0.8rem',
                color: 'var(--accent-amber)',
              }}
            >
              <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: '2px' }} />
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
              gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
              gap: '1rem',
              marginBottom: '1.25rem',
            }}
          >
            {/* Bound Agent Address */}
            <div className="mono-box">
              <span className="kpi-label">BOUND AGENT</span>
              <div style={{ color: 'var(--text-primary)', fontWeight: 600, marginTop: '0.25rem', wordBreak: 'break-all' }}>
                {draft.agentAddress || (
                  <span style={{ color: 'var(--accent-rose)' }}>Not provided in prompt</span>
                )}
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.35rem' }}>
                ERC-8004 Registry ID:{' '}
                <input
                  type="number"
                  min="0"
                  className="input-field mono"
                  style={{ fontSize: '0.75rem', padding: '0.2rem 0.45rem', width: '90px', display: 'inline-block' }}
                  value={draft.agentId}
                  onChange={(e) => setDraft({ ...draft, agentId: e.target.value })}
                  placeholder="required"
                  aria-label="ERC-8004 Registry Agent ID"
                />
                {!draft.agentId && (
                  <span style={{ color: 'var(--accent-amber)', marginLeft: '0.4rem' }}>Not stated in prompt, enter it here</span>
                )}
              </div>
            </div>

            {/* Target Address */}
            <div className="mono-box">
              <span className="kpi-label">TARGET CONTRACT</span>
              <div style={{ color: 'var(--text-primary)', fontWeight: 600, marginTop: '0.25rem', wordBreak: 'break-all' }}>
                {draft.targetAddress || (
                  <span style={{ color: 'var(--accent-rose)' }}>Not provided in prompt</span>
                )}
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                Allowlisted Execution Destination
              </div>
            </div>

            {/* Selector */}
            <div className="mono-box">
              <span className="kpi-label">METHOD & SELECTOR</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginTop: '0.25rem', flexWrap: 'wrap' }}>
                {draft.selector ? (
                  <>
                    <span className={`badge ${draft.isWildcard ? 'badge-amber' : 'badge-monad'}`}>
                      {draft.selector}
                    </span>
                    <span style={{ color: 'var(--text-primary)', fontWeight: 600, fontSize: '0.785rem' }}>
                      {draft.selectorName}
                    </span>
                  </>
                ) : (
                  <span style={{ color: 'var(--accent-rose)', fontSize: '0.785rem' }}>
                    Not resolved — state a selector or "wildcard"
                  </span>
                )}
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                {draft.isWildcard ? 'Permits all target methods' : 'Strict 4-byte signature'}
              </div>
            </div>

            {/* Caps & Deposit */}
            <div className="mono-box">
              <span className="kpi-label">SPENDING BOUNDS & DURATION</span>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.4rem', marginTop: '0.25rem', flexWrap: 'wrap' }}>
                <span style={{ color: 'var(--accent-emerald)', fontWeight: 700, fontSize: '1rem' }}>
                  {draft.maxPerTx || '—'} MON
                </span>
                <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                  / tx (max {draft.maxTotal || '—'} MON)
                </span>
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                Deposit: {draft.depositAmount} MON · Expiry: {draft.durationHours ? `${draft.durationHours}h` : '—'}
              </div>
            </div>
          </div>

          {/* Approval validation error */}
          {approvalError && (
            <div
              style={{
                background: 'var(--accent-rose-subtle)',
                border: '1px solid var(--accent-rose-border)',
                borderRadius: 'var(--radius-md)',
                padding: '0.75rem 1rem',
                marginBottom: '1rem',
                display: 'flex',
                alignItems: 'flex-start',
                gap: '0.5rem',
                fontSize: '0.8rem',
                color: 'var(--accent-rose)',
              }}
            >
              <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: '2px' }} />
              <div>
                <strong>Cannot authorize: </strong>
                {approvalError}
              </div>
            </div>
          )}

          {/* Invariant Guarantees */}
          <div
            style={{
              background: 'var(--bg-inset)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-md)',
              padding: '1rem',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.5rem' }}>
              <ShieldCheck size={16} color="#34D399" />
              <strong style={{ fontSize: '0.85rem', color: 'var(--text-primary)' }}>
                Contract-Enforced Invariant Guarantees
              </strong>
            </div>
            <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
              {draft.securityGuarantees.map((g, idx) => (
                <li
                  key={idx}
                  style={{
                    fontSize: '0.8rem',
                    color: 'var(--text-secondary)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.45rem',
                  }}
                >
                  <CheckCircle2 size={14} color="#34D399" style={{ flexShrink: 0 }} />
                  {g}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {/* Empty State when no draft is compiled yet */}
      {!draft && (
        <div className="empty-state">
          <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: 'var(--bg-inset)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: '0.85rem', color: 'var(--text-muted)' }}>
            <Sparkles size={24} />
          </div>
          <h4 className="empty-state-title">
            No Mandate Policy Compiled Yet
          </h4>
          <p className="empty-state-desc">
            Enter a natural-language permission request above or click a preset to compile on-chain spending bounds, targets, and selectors into a verifiable mandate.
          </p>
        </div>
      )}
    </div>
  );
}
