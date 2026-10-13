'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  KeyRound,
  ShieldCheck,
  AlertCircle,
  Plus,
  Trash2,
  Lock,
  Info,
  Clock,
  Layers,
  AlertTriangle,
} from 'lucide-react';
import { parseEther, formatEther, type Address, type Hex } from 'viem';
import type { CreateMandateParams } from '@agenttrust/sdk';

interface CreateMandateModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (params: CreateMandateParams) => Promise<void>;
  isLoading: boolean;
  initialParams?: Partial<CreateMandateParams> | null;
  networkMode?: 'LOCAL_SIMULATION' | 'MONAD_TESTNET';
  /** Inline progress text while a live submission is running (the page toast sits behind this overlay). */
  progressMessage?: string | null;
  /** Opens the v2 Passkey Mandates page, the working live passkey flow. */
  onOpenPasskey?: () => void;
}

const DEFAULT_TARGETS = [{ target: '', selector: '0x00000000' }];

export function CreateMandateModal({
  isOpen,
  onClose,
  onSubmit,
  isLoading,
  initialParams,
  networkMode = 'MONAD_TESTNET',
  progressMessage,
  onOpenPasskey,
}: CreateMandateModalProps) {
  const [agentAddress, setAgentAddress] = useState('');
  const [agentId, setAgentId] = useState('');
  const [maxPerTx, setMaxPerTx] = useState('');
  const [maxTotal, setMaxTotal] = useState('');
  const [depositAmount, setDepositAmount] = useState('');
  const [durationHours, setDurationHours] = useState('24');
  const [targets, setTargets] = useState<Array<{ target: string; selector: string }>>([
    { target: '', selector: '0x00000000' },
  ]);
  const [error, setError] = useState<string | null>(null);
  // Exact expiry a reviewed draft (Policy-to-Proof, Policy Builder) asked for. Used when durationHours === 'policy'.
  const [fixedExpiresAt, setFixedExpiresAt] = useState<bigint | null>(null);
  const errorRef = useRef<HTMLDivElement>(null);

  // The error box sits above the form; bring it into view when a submit fails.
  useEffect(() => {
    if (error) errorRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [error]);

  // Every time the dialog opens, start from a clean form and then apply the draft, if any.
  // Fields are checked with !== undefined so a 0 value (for example no deposit) still overrides.
  useEffect(() => {
    if (!isOpen) return;
    const p = initialParams ?? {};
    setError(null);
    setAgentAddress(p.agentAddress ?? '');
    setAgentId(p.agentId !== undefined ? p.agentId.toString() : '');
    setMaxPerTx(p.maxValuePerTx !== undefined ? formatEther(p.maxValuePerTx) : '');
    setMaxTotal(p.maxTotalValue !== undefined ? formatEther(p.maxTotalValue) : '');
    setDepositAmount(p.depositValue !== undefined ? formatEther(p.depositValue) : '');
    setTargets(
      p.targets && p.targets.length > 0
        ? p.targets.map((t) => ({ target: t.target, selector: t.selector }))
        : DEFAULT_TARGETS.map((t) => ({ ...t }))
    );
    if (p.expiresAt === undefined) {
      setFixedExpiresAt(null);
      setDurationHours('24');
    } else if (p.expiresAt === 0n) {
      setFixedExpiresAt(null);
      setDurationHours('0');
    } else {
      setFixedExpiresAt(p.expiresAt);
      setDurationHours('policy');
    }
  }, [isOpen, initialParams]);

  // Handle escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen && !isLoading) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isLoading, onClose]);

  if (!isOpen) return null;

  const handleAddTarget = () => {
    setTargets([...targets, { target: '', selector: '0x00000000' }]);
  };

  const handleRemoveTarget = (index: number) => {
    if (targets.length <= 1) return;
    setTargets(targets.filter((_, i) => i !== index));
  };

  const handleTargetChange = (index: number, field: 'target' | 'selector', value: string) => {
    const updated = [...targets];
    updated[index][field] = value.trim();
    setTargets(updated);
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    try {
      const cleanAgent = agentAddress.trim();
      if (!cleanAgent.startsWith('0x') || cleanAgent.length !== 42) {
        throw new Error(`Invalid agent wallet address format: ${cleanAgent}`);
      }

      if (!agentId.trim() || isNaN(Number(agentId)) || Number(agentId) < 0) {
        throw new Error('ERC-8004 Registry Agent ID must be a non-negative number');
      }

      if (targets.length === 0) {
        throw new Error('At least one allowed target must be specified');
      }

      for (let i = 0; i < targets.length; i++) {
        const t = targets[i];
        if (!t.target.startsWith('0x') || t.target.length !== 42) {
          throw new Error(`Rule #${i + 1}: Invalid target address (must be 42 characters hex starting with 0x)`);
        }
        if (!t.selector.startsWith('0x') || t.selector.length !== 10) {
          throw new Error(`Rule #${i + 1}: Selector must be a 4-byte hex string (e.g. 0xa9059cbb or 0x00000000)`);
        }
      }

      const numPerTx = parseFloat(maxPerTx);
      const numTotal = parseFloat(maxTotal);
      if (isNaN(numPerTx) || numPerTx <= 0) {
        throw new Error('Max value per transaction must be greater than 0');
      }
      if (isNaN(numTotal) || numTotal < numPerTx) {
        throw new Error('Max cumulative cap must be greater than or equal to per-tx limit');
      }

      const nowSec = Math.floor(Date.now() / 1000);
      let expiresAt: bigint;
      if (durationHours === 'policy' && fixedExpiresAt !== null) {
        if (fixedExpiresAt <= BigInt(nowSec)) {
          throw new Error('The reviewed expiry time has already passed. Pick a new expiry window below.');
        }
        expiresAt = fixedExpiresAt;
      } else if (durationHours === 'policy') {
        throw new Error('Pick an expiry window below.');
      } else {
        expiresAt = durationHours === '0' ? 0n : BigInt(nowSec + Number(durationHours) * 3600);
      }

      const params: CreateMandateParams = {
        agentAddress: cleanAgent as Address,
        agentId: BigInt(agentId),
        targets: targets.map((t) => ({
          target: t.target as Address,
          selector: t.selector as Hex,
        })),
        maxValuePerTx: parseEther(maxPerTx),
        maxTotalValue: parseEther(maxTotal),
        depositValue: depositAmount ? parseEther(depositAmount) : 0n,
        expiresAt,
      };

      await onSubmit(params);
    } catch (err: any) {
      setError(err.message || 'Failed to submit mandate authorization');
    }
  };

  return (
    <div
      className="modal-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isLoading) {
          onClose();
        }
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
    >
      <div className="modal-content">
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.25rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
            <div
              style={{
                width: '36px',
                height: '36px',
                borderRadius: 'var(--radius-md)',
                background: 'var(--accent-primary-light)',
                border: '1px solid var(--accent-monad-border)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--accent-monad)',
                flexShrink: 0,
              }}
            >
              <ShieldCheck size={22} />
            </div>
            <div>
              <h2 id="modal-title" style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                Authorize Scoped Mandate
              </h2>
              <p style={{ fontSize: '0.785rem', color: 'var(--text-muted)' }}>
                {networkMode === 'MONAD_TESTNET'
                  ? 'Hardware Passkey Delegation on Monad Testnet (Chain 10143)'
                  : 'Passkey Delegation Sandbox (Local Simulation)'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isLoading}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--text-muted)',
              cursor: isLoading ? 'not-allowed' : 'pointer',
              padding: '0.25rem',
            }}
            aria-label="Close dialog"
          >
            <X size={20} />
          </button>
        </div>

        {/* Security Scope Explanation Box */}
        <div
          style={{
            background: 'var(--bg-lavender-subtle)',
            border: '1px solid var(--border-default)',
            borderRadius: 'var(--radius-md)',
            padding: '0.75rem 1rem',
            marginBottom: '1.25rem',
            fontSize: '0.8rem',
            color: 'var(--text-secondary)',
            display: 'flex',
            alignItems: 'flex-start',
            gap: '0.65rem',
          }}
        >
          <Info size={16} color="var(--accent-primary)" style={{ flexShrink: 0, marginTop: '2px' }} />
          <div>
            <strong style={{ color: 'var(--text-primary)' }}>Scoped Delegation, Not Key Handover: </strong>
            You are authorizing an immutable smart contract mandate with exact method allowlists and spending caps. The AI agent never receives your private key, and cannot execute any transaction outside these bounds.
          </div>
        </div>

        {/* Live v1 limitation, stated before the user fills the form */}
        {networkMode === 'MONAD_TESTNET' && (
          <div
            style={{
              background: 'var(--accent-amber-subtle)',
              border: '1px solid var(--accent-amber-border)',
              borderRadius: 'var(--radius-md)',
              padding: '0.75rem 1rem',
              marginBottom: '1.25rem',
              fontSize: '0.8rem',
              color: 'var(--accent-amber)',
              display: 'flex',
              alignItems: 'flex-start',
              gap: '0.65rem',
            }}
          >
            <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: '2px' }} />
            <div>
              <strong>Legacy v1 prototype. </strong>
              Live creation here needs a passkey already registered for your wallet on the v1 MandateManager, and this Lab
              does not register one. For most wallets it stops with a clear error before anything is sent. The working
              live passkey flow is Passkey Mandates (no wallet or MON needed). You can also switch the Lab to Local
              Simulation to try this form offline.
              {onOpenPasskey && (
                <div style={{ marginTop: '0.5rem' }}>
                  <button
                    type="button"
                    className="btn-secondary"
                    style={{ padding: '0.3rem 0.7rem', fontSize: '0.75rem' }}
                    onClick={onOpenPasskey}
                    disabled={isLoading}
                  >
                    <KeyRound size={13} /> Open Passkey Mandates
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Inline Error */}
        {error && (
          <div
            ref={errorRef}
            role="alert"
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: '0.5rem',
              padding: '0.65rem 0.85rem',
              background: 'var(--accent-rose-subtle)',
              border: '1px solid var(--accent-rose-border)',
              borderRadius: 'var(--radius-sm)',
              color: 'var(--accent-rose)',
              fontSize: '0.775rem',
              marginBottom: '1rem',
            }}
          >
            <AlertCircle size={15} style={{ flexShrink: 0, marginTop: '2px' }} />
            <span style={{ overflowWrap: 'anywhere' }}>{error}</span>
          </div>
        )}

        <form onSubmit={handleFormSubmit}>
          {/* Agent Identity */}
          <div style={{ marginBottom: '1rem' }}>
            <label className="input-label" htmlFor="input-agent-address">
              Designated AI Agent Address (Bound Caller)
            </label>
            <input
              id="input-agent-address"
              type="text"
              className="input-field mono"
              value={agentAddress}
              onChange={(e) => setAgentAddress(e.target.value)}
              placeholder="0x..."
              disabled={isLoading}
              required
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.85rem', marginBottom: '1rem' }}>
            <div>
              <label className="input-label" htmlFor="input-agent-id">
                ERC-8004 Registry Agent ID
              </label>
              <input
                id="input-agent-id"
                type="number"
                className="input-field mono"
                value={agentId}
                onChange={(e) => setAgentId(e.target.value)}
                placeholder="42"
                disabled={isLoading}
                required
              />
            </div>
            <div>
              <label className="input-label" htmlFor="input-deposit-amount">
                Vault Deposit (Native MON)
              </label>
              <input
                id="input-deposit-amount"
                type="text"
                className="input-field mono"
                value={depositAmount}
                onChange={(e) => setDepositAmount(e.target.value)}
                placeholder="0.5"
                disabled={isLoading}
              />
            </div>
          </div>

          {/* Spending Caps */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.85rem', marginBottom: '1rem' }}>
            <div>
              <label className="input-label" htmlFor="input-max-per-tx">
                Max Native MON Per Call (msg.value)
              </label>
              <input
                id="input-max-per-tx"
                type="text"
                className="input-field mono"
                value={maxPerTx}
                onChange={(e) => setMaxPerTx(e.target.value)}
                placeholder="0.1"
                disabled={isLoading}
                required
              />
            </div>
            <div>
              <label className="input-label" htmlFor="input-max-total">
                Max Cumulative Cap (Native MON)
              </label>
              <input
                id="input-max-total"
                type="text"
                className="input-field mono"
                value={maxTotal}
                onChange={(e) => setMaxTotal(e.target.value)}
                placeholder="1.0"
                disabled={isLoading}
                required
              />
            </div>
          </div>

          {/* Expiry Duration */}
          <div style={{ marginBottom: '1.25rem' }}>
            <label className="input-label" htmlFor="input-duration-hours">
              Mandate Expiry Window
            </label>
            <select
              id="input-duration-hours"
              className="input-field"
              value={durationHours}
              onChange={(e) => {
                setDurationHours(e.target.value);
                if (e.target.value !== 'policy') setFixedExpiresAt(null);
              }}
              disabled={isLoading}
            >
              {fixedExpiresAt !== null && (
                <option value="policy">
                  {`As reviewed: about ${Math.max(0, Math.round((Number(fixedExpiresAt) - Date.now() / 1000) / 3600))} hour(s), until ${new Date(Number(fixedExpiresAt) * 1000).toLocaleString()}`}
                </option>
              )}
              <option value="1">1 Hour (Testing Window)</option>
              <option value="24">24 Hours (1 Day)</option>
              <option value="48">48 Hours (2 Days)</option>
              <option value="168">7 Days (Standard)</option>
              <option value="720">30 Days</option>
              <option value="0">Permanent (Requires Manual Revocation)</option>
            </select>
          </div>

          {/* Target Rules Allowlist */}
          <div style={{ marginBottom: '1.5rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.45rem' }}>
              <label className="input-label" style={{ marginBottom: 0 }}>
                Allowlisted Target Contracts & 4-Byte Selectors
              </label>
              <button
                type="button"
                onClick={handleAddTarget}
                disabled={isLoading}
                className="btn-secondary"
                style={{ padding: '0.2rem 0.5rem', fontSize: '0.72rem' }}
              >
                <Plus size={12} /> Add Rule
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {targets.map((t, idx) => (
                <div
                  key={idx}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '3fr 2fr auto',
                    gap: '0.45rem',
                    alignItems: 'center',
                  }}
                >
                  <input
                    type="text"
                    className="input-field mono"
                    style={{ fontSize: '0.75rem' }}
                    placeholder="Target 0x..."
                    value={t.target}
                    onChange={(e) => handleTargetChange(idx, 'target', e.target.value)}
                    disabled={isLoading}
                    required
                  />
                  <div style={{ position: 'relative' }}>
                    <input
                      type="text"
                      className="input-field mono"
                      style={{ fontSize: '0.75rem' }}
                      placeholder="0xa9059cbb"
                      value={t.selector}
                      onChange={(e) => handleTargetChange(idx, 'selector', e.target.value)}
                      disabled={isLoading}
                      required
                    />
                    {t.selector === '0x00000000' && (
                      <span
                        style={{
                          position: 'absolute',
                          right: '6px',
                          top: '50%',
                          transform: 'translateY(-50%)',
                          fontSize: '0.65rem',
                          color: 'var(--accent-amber)',
                          background: 'rgba(245, 158, 11, 0.15)',
                          padding: '1px 4px',
                          borderRadius: '2px',
                        }}
                        title="Wildcard permits all methods"
                      >
                        Wildcard
                      </span>
                    )}
                  </div>
                  {targets.length > 1 && (
                    <button
                      type="button"
                      onClick={() => handleRemoveTarget(idx)}
                      disabled={isLoading}
                      className="btn-danger"
                      style={{ padding: '0.45rem', borderRadius: 'var(--radius-sm)' }}
                      title="Remove rule"
                    >
                      <Trash2 size={13} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {isLoading && progressMessage && (
            <div
              role="status"
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: '0.5rem',
                padding: '0.65rem 0.85rem',
                background: 'var(--accent-primary-light)',
                border: '1px solid var(--accent-monad-border)',
                borderRadius: 'var(--radius-sm)',
                color: 'var(--text-secondary)',
                fontSize: '0.775rem',
                marginBottom: '1rem',
                overflowWrap: 'anywhere',
              }}
            >
              <Clock size={15} style={{ flexShrink: 0, marginTop: '2px' }} />
              <span>{progressMessage}</span>
            </div>
          )}

          {/* Action Buttons: Cancel is safe and obvious */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '0.75rem' }}>
            <button
              type="button"
              className="btn-secondary"
              onClick={onClose}
              disabled={isLoading}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isLoading}
              className="btn-primary"
            >
              <KeyRound size={15} />
              {isLoading
                ? 'Authorizing with Hardware Passkey...'
                : networkMode === 'MONAD_TESTNET'
                ? 'Authorize with Hardware Passkey (P-256)'
                : 'Authorize in Local Simulation Sandbox'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
