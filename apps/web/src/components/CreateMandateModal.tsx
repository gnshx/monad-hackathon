'use client';

import React, { useState } from 'react';
import { X, KeyRound, ShieldPlus, AlertCircle, Plus, Trash2 } from 'lucide-react';
import { parseEther, formatEther, type Address, type Hex } from 'viem';
import type { AllowedTarget, CreateMandateParams } from '@agenttrust/sdk';

interface CreateMandateModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (params: CreateMandateParams) => Promise<void>;
  isLoading: boolean;
  initialParams?: Partial<CreateMandateParams> | null;
  networkMode?: 'LOCAL_SIMULATION' | 'MONAD_TESTNET';
}

export function CreateMandateModal({
  isOpen,
  onClose,
  onSubmit,
  isLoading,
  initialParams,
  networkMode = 'MONAD_TESTNET',
}: CreateMandateModalProps) {
  const [agentAddress, setAgentAddress] = useState('0x70997970C51812dc3A010C7d01b50e0d17dc79C8');
  const [agentId, setAgentId] = useState('42');
  const [maxPerTx, setMaxPerTx] = useState('0.1');
  const [maxTotal, setMaxTotal] = useState('1.0');
  const [depositAmount, setDepositAmount] = useState('0.5');
  const [durationHours, setDurationHours] = useState('168'); // 7 days default
  const [targets, setTargets] = useState<Array<{ target: string; selector: string }>>([
    {
      target: '0x3333333333333333333333333333333333333333',
      selector: '0xa9059cbb',
    },
  ]);
  const [error, setError] = useState<string | null>(null);

  React.useEffect(() => {
    if (initialParams) {
      if (initialParams.agentAddress) setAgentAddress(initialParams.agentAddress);
      if (initialParams.agentId !== undefined) setAgentId(initialParams.agentId.toString());
      if (initialParams.maxValuePerTx) setMaxPerTx(formatEther(initialParams.maxValuePerTx));
      if (initialParams.maxTotalValue) setMaxTotal(formatEther(initialParams.maxTotalValue));
      if (initialParams.depositValue) setDepositAmount(formatEther(initialParams.depositValue));
      if (initialParams.targets && initialParams.targets.length > 0) {
        setTargets(initialParams.targets.map((t) => ({ target: t.target, selector: t.selector })));
      }
    }
  }, [initialParams, isOpen]);

  if (!isOpen) return null;

  const handleAddTarget = () => {
    setTargets([...targets, { target: '0x', selector: '0x00000000' }]);
  };

  const handleRemoveTarget = (index: number) => {
    setTargets(targets.filter((_, i) => i !== index));
  };

  const handleTargetChange = (index: number, field: 'target' | 'selector', value: string) => {
    const updated = [...targets];
    updated[index][field] = value;
    setTargets(updated);
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    try {
      if (!agentAddress.startsWith('0x') || agentAddress.length !== 42) {
        throw new Error(`Invalid agent wallet address format: ${agentAddress}`);
      }

      if (targets.length === 0) {
        throw new Error('At least one allowed target must be specified');
      }

      for (const t of targets) {
        if (!t.target.startsWith('0x') || t.target.length !== 42) {
          throw new Error(`Invalid target address format: ${t.target}`);
        }
        if (!t.selector.startsWith('0x')) {
          throw new Error(`Selector must start with 0x: ${t.selector}`);
        }
      }

      const expiresAt =
        durationHours === '0'
          ? 0n
          : BigInt(Math.floor(Date.now() / 1000) + Number(durationHours) * 3600);

      const params: CreateMandateParams = {
        agentAddress: agentAddress as Address,
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
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to submit mandate authorization');
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <div style={{ background: 'rgba(131, 56, 236, 0.2)', padding: '0.4rem', borderRadius: '8px' }}>
              <ShieldPlus size={20} color="#c4b5fd" />
            </div>
            <div>
              <h2 style={{ fontSize: '1.2rem', fontWeight: 700 }}>Authorize New Mandate</h2>
              <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                Hardware passkey-enforced limits and permissions on Monad
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
          >
            <X size={20} />
          </button>
        </div>

        {error && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              padding: '0.75rem',
              background: 'rgba(244, 63, 94, 0.1)',
              border: '1px solid rgba(244, 63, 94, 0.3)',
              borderRadius: '8px',
              color: '#fda4af',
              fontSize: '0.8rem',
              marginBottom: '1rem',
            }}
          >
            <AlertCircle size={16} />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleFormSubmit}>
          <div className="input-group">
            <label className="input-label">Designated Agent Wallet Address</label>
            <input
              type="text"
              className="input-field mono"
              value={agentAddress}
              onChange={(e) => setAgentAddress(e.target.value)}
              placeholder="0x..."
              required
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div className="input-group">
              <label className="input-label">AI Agent ID (ERC-8004 Registry)</label>
              <input
                type="number"
                className="input-field"
                value={agentId}
                onChange={(e) => setAgentId(e.target.value)}
                required
              />
            </div>
            <div className="input-group">
              <label className="input-label">Initial Vault Deposit (MON)</label>
              <input
                type="text"
                className="input-field"
                value={depositAmount}
                onChange={(e) => setDepositAmount(e.target.value)}
                placeholder="0.5"
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div className="input-group">
              <label className="input-label">Max Value Per Action (MON)</label>
              <input
                type="text"
                className="input-field"
                value={maxPerTx}
                onChange={(e) => setMaxPerTx(e.target.value)}
                placeholder="0.1"
                required
              />
            </div>
            <div className="input-group">
              <label className="input-label">Max Cumulative Cap (MON)</label>
              <input
                type="text"
                className="input-field"
                value={maxTotal}
                onChange={(e) => setMaxTotal(e.target.value)}
                placeholder="1.0"
                required
              />
            </div>
          </div>

          <div className="input-group">
            <label className="input-label">Duration Expiry</label>
            <select
              className="input-field"
              value={durationHours}
              onChange={(e) => setDurationHours(e.target.value)}
            >
              <option value="1">1 Hour</option>
              <option value="24">24 Hours (1 Day)</option>
              <option value="168">7 Days (Standard)</option>
              <option value="720">30 Days</option>
              <option value="0">No Expiration (Permanent)</option>
            </select>
          </div>

          {/* Target List */}
          <div style={{ marginBottom: '1.25rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
              <label className="input-label">Allowlisted Target Contracts & Selectors</label>
              <button
                type="button"
                onClick={handleAddTarget}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--accent-cyan)',
                  cursor: 'pointer',
                  fontSize: '0.75rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.2rem',
                }}
              >
                <Plus size={12} /> Add Rule
              </button>
            </div>

            {targets.map((t, idx) => (
              <div
                key={idx}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '3fr 2fr auto',
                  gap: '0.5rem',
                  alignItems: 'center',
                  marginBottom: '0.5rem',
                }}
              >
                <input
                  type="text"
                  className="input-field mono"
                  style={{ fontSize: '0.75rem' }}
                  placeholder="Target address 0x..."
                  value={t.target}
                  onChange={(e) => handleTargetChange(idx, 'target', e.target.value)}
                  required
                />
                <input
                  type="text"
                  className="input-field mono"
                  style={{ fontSize: '0.75rem' }}
                  placeholder="Selector (e.g. 0xa9059cbb or 0x00000000)"
                  value={t.selector}
                  onChange={(e) => handleTargetChange(idx, 'selector', e.target.value)}
                  required
                />
                {targets.length > 1 && (
                  <button
                    type="button"
                    onClick={() => handleRemoveTarget(idx)}
                    style={{ background: 'none', border: 'none', color: '#f43f5e', cursor: 'pointer' }}
                  >
                    <Trash2 size={16} />
                  </button>
                )}
              </div>
            ))}
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="btn btn-primary"
            style={{ width: '100%', padding: '0.85rem' }}
          >
            <KeyRound size={18} />
            {isLoading
              ? 'Authorizing with Hardware Passkey...'
              : networkMode === 'MONAD_TESTNET'
              ? 'Authorize with Hardware Passkey (P-256)'
              : 'Authorize in Local Simulation Sandbox'}
          </button>
        </form>
      </div>
    </div>
  );
}
