'use client';

import React, { useState, useEffect } from 'react';
import {
  Gavel,
  Play,
  CheckCircle2,
  AlertTriangle,
  ExternalLink,
  ShieldAlert,
  Loader2,
  Copy,
  Check,
  RefreshCw,
  Coins,
  ShieldCheck,
  AlertCircle,
} from 'lucide-react';
import type { JudgeStepResult } from '@/lib/judge-mode-runner';

interface JudgeStatus {
  deployed: boolean;
  chainId: number;
  contracts: {
    mandateManager: string;
    mockTarget: string;
  };
  relayerAddress?: string;
  relayerBalance?: string;
  lowFunds: boolean;
  isRateLimited?: boolean;
  retryAfterSeconds?: number;
  message?: string;
}

export function JudgeMode() {
  const [status, setStatus] = useState<JudgeStatus | null>(null);
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [steps, setSteps] = useState<JudgeStepResult[]>([]);
  const [copiedHash, setCopiedHash] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState<number>(0);

  const fetchStatus = async () => {
    try {
      setLoadingStatus(true);
      setError(null);
      const res = await fetch('/api/judge-mode');
      const data: JudgeStatus = await res.json();
      setStatus(data);
      if (data.isRateLimited && data.retryAfterSeconds) {
        setCooldown(data.retryAfterSeconds);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to check Judge Mode status');
    } finally {
      setLoadingStatus(false);
    }
  };

  useEffect(() => {
    fetchStatus();
  }, []);

  useEffect(() => {
    if (cooldown <= 0) return;
    const interval = setInterval(() => {
      setCooldown((prev) => (prev > 1 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(interval);
  }, [cooldown]);

  const handleRun = async () => {
    if (running || cooldown > 0) return;
    setRunning(true);
    setError(null);
    setSteps([]);

    try {
      const res = await fetch('/api/judge-mode', {
        method: 'POST',
      });
      const data = await res.json();

      if (!res.ok) {
        if (res.status === 429 && data.retryAfterSeconds) {
          setCooldown(data.retryAfterSeconds);
        }
        throw new Error(data.error || 'Failed to execute Judge Mode sequence');
      }

      setSteps(data.steps || []);
      setCooldown(120); // 2-minute cooldown
      fetchStatus();
    } catch (err: any) {
      setError(err.message || 'Judge Mode execution encountered an error');
    } finally {
      setRunning(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedHash(text);
    setTimeout(() => setCopiedHash(null), 2000);
  };

  const isButtonDisabled =
    loadingStatus ||
    running ||
    cooldown > 0 ||
    !status?.deployed ||
    status?.lowFunds;

  return (
    <div
      style={{
        background: 'linear-gradient(135deg, rgba(89, 68, 219, 0.08) 0%, rgba(131, 110, 249, 0.04) 100%)',
        border: '1px solid rgba(89, 68, 219, 0.3)',
        borderRadius: 'var(--radius-lg, 12px)',
        padding: '1.5rem',
        marginBottom: '2rem',
        boxShadow: '0 8px 24px rgba(0, 0, 0, 0.04)',
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: '1rem',
          flexWrap: 'wrap',
          marginBottom: '1.25rem',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div
            style={{
              width: '42px',
              height: '42px',
              borderRadius: '10px',
              background: 'linear-gradient(135deg, #5944db 0%, #836ef9 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#ffffff',
              boxShadow: '0 4px 12px rgba(89, 68, 219, 0.3)',
            }}
          >
            <Gavel size={22} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <h2
                style={{
                  fontSize: '1.25rem',
                  fontWeight: 700,
                  color: 'var(--text-primary, #0f172a)',
                  margin: 0,
                }}
              >
                Judge Mode — 1-Click Live Testnet Sequence
              </h2>
              <span
                style={{
                  background: 'rgba(89, 68, 219, 0.15)',
                  color: '#5944db',
                  fontSize: '0.7rem',
                  fontWeight: 700,
                  padding: '0.2rem 0.5rem',
                  borderRadius: '9999px',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                }}
              >
                Highest Evaluator Value
              </span>
            </div>
            <p
              style={{
                fontSize: '0.85rem',
                color: 'var(--text-muted, #64748b)',
                marginTop: '0.25rem',
                marginBottom: 0,
              }}
            >
              Executes a guided 6-step testnet scenario via sponsored server-side relayer. No wallet or testnet MON required.
            </p>
          </div>
        </div>

        {/* Live Status Indicators */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
          {/* Chain Badge */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
              padding: '0.4rem 0.75rem',
              borderRadius: '8px',
              background: status?.deployed ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
              border: `1px solid ${status?.deployed ? 'rgba(16, 185, 129, 0.25)' : 'rgba(239, 68, 68, 0.25)'}`,
              fontSize: '0.785rem',
              fontWeight: 600,
              color: status?.deployed ? '#059669' : '#dc2626',
            }}
          >
            <span
              style={{
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                background: status?.deployed ? '#10b981' : '#ef4444',
                display: 'inline-block',
              }}
            />
            <span>{status?.deployed ? 'Monad Testnet (10143) Live' : 'Not Deployed on Monad'}</span>
          </div>

          {/* Relayer Badge */}
          {status?.relayerBalance && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.4rem',
                padding: '0.4rem 0.75rem',
                borderRadius: '8px',
                background: status.lowFunds ? 'rgba(245, 158, 11, 0.1)' : 'rgba(89, 68, 219, 0.1)',
                border: `1px solid ${status.lowFunds ? 'rgba(245, 158, 11, 0.25)' : 'rgba(89, 68, 219, 0.25)'}`,
                fontSize: '0.785rem',
                fontWeight: 600,
                color: status.lowFunds ? '#d97706' : '#5944db',
              }}
            >
              <Coins size={14} />
              <span>Relayer: {status.relayerBalance}</span>
            </div>
          )}

          <button
            onClick={fetchStatus}
            disabled={loadingStatus || running}
            title="Refresh on-chain status"
            style={{
              padding: '0.4rem',
              borderRadius: '8px',
              border: '1px solid var(--border-color, #e2e8f0)',
              background: 'var(--bg-card, #ffffff)',
              color: 'var(--text-muted, #64748b)',
              cursor: loadingStatus || running ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
            }}
          >
            <RefreshCw size={14} className={loadingStatus ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* Warning / Error alerts */}
      {status && !status.deployed && (
        <div
          style={{
            background: 'rgba(239, 68, 68, 0.08)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            borderRadius: '8px',
            padding: '0.75rem 1rem',
            marginBottom: '1rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            color: '#b91c1c',
            fontSize: '0.825rem',
          }}
        >
          <AlertCircle size={16} />
          <span>
            <strong>Not deployed on Monad testnet:</strong> Contract bytecode not found at configured addresses on chain 10143. Judge Mode requires active testnet contracts.
          </span>
        </div>
      )}

      {status?.lowFunds && status?.deployed && (
        <div
          style={{
            background: 'rgba(245, 158, 11, 0.08)',
            border: '1px solid rgba(245, 158, 11, 0.3)',
            borderRadius: '8px',
            padding: '0.75rem 1rem',
            marginBottom: '1rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            color: '#b45309',
            fontSize: '0.825rem',
          }}
        >
          <AlertTriangle size={16} />
          <span>
            <strong>Relayer low on funds:</strong> The server relayer balance is below 0.005 MON. Live execution requires testnet MON.
          </span>
        </div>
      )}

      {error && (
        <div
          style={{
            background: 'rgba(239, 68, 68, 0.08)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            borderRadius: '8px',
            padding: '0.75rem 1rem',
            marginBottom: '1rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            color: '#b91c1c',
            fontSize: '0.825rem',
          }}
        >
          <AlertCircle size={16} />
          <span>{error}</span>
        </div>
      )}

      {/* Action Button & Cooldown */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
        <button
          onClick={handleRun}
          disabled={isButtonDisabled}
          style={{
            background: isButtonDisabled
              ? '#94a3b8'
              : 'linear-gradient(135deg, #5944db 0%, #4338ca 100%)',
            color: '#ffffff',
            border: 'none',
            borderRadius: '8px',
            padding: '0.75rem 1.5rem',
            fontWeight: 700,
            fontSize: '0.925rem',
            cursor: isButtonDisabled ? 'not-allowed' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '0.6rem',
            boxShadow: isButtonDisabled ? 'none' : '0 4px 14px rgba(89, 68, 219, 0.35)',
            transition: 'all 0.15s ease',
          }}
        >
          {running ? (
            <>
              <Loader2 size={18} className="animate-spin" />
              <span>Broadcasting Live Monad Testnet Sequence...</span>
            </>
          ) : (
            <>
              <Play size={18} fill="#ffffff" />
              <span>Run Live Testnet Sequence (Judge Mode)</span>
            </>
          )}
        </button>

        {cooldown > 0 && !running && (
          <span style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: 500 }}>
            ⏳ Rate limit cooldown: {cooldown}s remaining (1 run per 2 min per IP)
          </span>
        )}

        <span style={{ fontSize: '0.785rem', color: '#64748b' }}>
          Runs 6 live transactions against deployed MockTarget (0.0001 MON cap)
        </span>
      </div>

      {/* Live Transaction Results */}
      {steps.length > 0 && (
        <div style={{ marginTop: '1.5rem' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: '0.75rem',
              borderBottom: '1px solid rgba(89, 68, 219, 0.15)',
              paddingBottom: '0.5rem',
            }}
          >
            <h3
              style={{
                fontSize: '0.95rem',
                fontWeight: 700,
                color: 'var(--text-primary, #0f172a)',
                margin: 0,
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
              }}
            >
              <ShieldCheck size={18} color="#10b981" />
              <span>Live Monad Testnet Execution Results ({steps.length}/6 Steps Completed)</span>
            </h3>
            <span
              style={{
                fontSize: '0.75rem',
                color: '#059669',
                fontWeight: 700,
                background: 'rgba(16, 185, 129, 0.12)',
                padding: '0.2rem 0.6rem',
                borderRadius: '6px',
              }}
            >
              Chain ID: 10143 Verified
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {steps.map((step) => {
              const isSuccess = step.status === 'success';
              const isReverted = step.status === 'reverted';

              return (
                <div
                  key={step.step}
                  style={{
                    background: 'var(--bg-card, #ffffff)',
                    border: '1px solid var(--border-color, #e2e8f0)',
                    borderRadius: '8px',
                    padding: '1rem',
                    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.03)',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      justifyContent: 'space-between',
                      gap: '0.75rem',
                      flexWrap: 'wrap',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                      <span
                        style={{
                          width: '24px',
                          height: '24px',
                          borderRadius: '50%',
                          background: isSuccess
                            ? 'rgba(16, 185, 129, 0.15)'
                            : 'rgba(239, 68, 68, 0.15)',
                          color: isSuccess ? '#059669' : '#dc2626',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: '0.75rem',
                          fontWeight: 700,
                        }}
                      >
                        {step.step}
                      </span>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <span style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--text-primary, #0f172a)' }}>
                            {step.name}
                          </span>
                          <span
                            style={{
                              fontSize: '0.68rem',
                              fontWeight: 700,
                              background: '#f1f5f9',
                              color: '#475569',
                              padding: '0.15rem 0.45rem',
                              borderRadius: '4px',
                              border: '1px solid #cbd5e1',
                            }}
                          >
                            {step.label}
                          </span>
                        </div>
                        <p style={{ margin: '0.2rem 0 0 0', fontSize: '0.8rem', color: '#64748b' }}>
                          {step.description}
                        </p>
                      </div>
                    </div>

                    {/* Status Badge */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      {isSuccess ? (
                        <span
                          style={{
                            background: 'rgba(16, 185, 129, 0.12)',
                            color: '#059669',
                            border: '1px solid rgba(16, 185, 129, 0.25)',
                            padding: '0.25rem 0.6rem',
                            borderRadius: '6px',
                            fontSize: '0.75rem',
                            fontWeight: 700,
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.3rem',
                          }}
                        >
                          <CheckCircle2 size={13} />
                          <span>SUCCESS</span>
                        </span>
                      ) : (
                        <span
                          style={{
                            background: 'rgba(239, 68, 68, 0.1)',
                            color: '#dc2626',
                            border: '1px solid rgba(239, 68, 68, 0.25)',
                            padding: '0.25rem 0.6rem',
                            borderRadius: '6px',
                            fontSize: '0.75rem',
                            fontWeight: 700,
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.3rem',
                          }}
                        >
                          <ShieldAlert size={13} />
                          <span>REVERTED (Expected)</span>
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Decoded Revert Callout */}
                  {step.decodedRevert && (
                    <div
                      style={{
                        marginTop: '0.6rem',
                        background: 'rgba(239, 68, 68, 0.05)',
                        border: '1px solid rgba(239, 68, 68, 0.2)',
                        borderRadius: '6px',
                        padding: '0.5rem 0.75rem',
                        fontSize: '0.785rem',
                        color: '#991b1b',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5rem',
                      }}
                    >
                      <ShieldAlert size={14} color="#dc2626" />
                      <span>
                        <strong>Decoded On-Chain Revert Reason:</strong>{' '}
                        <code style={{ background: '#fee2e2', padding: '0.1rem 0.35rem', borderRadius: '4px', fontWeight: 700 }}>
                          {step.decodedRevert}
                        </code>
                      </span>
                    </div>
                  )}

                  {/* Tx Hash & Explorer Link */}
                  <div
                    style={{
                      marginTop: '0.6rem',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      fontSize: '0.75rem',
                      color: '#64748b',
                      flexWrap: 'wrap',
                      gap: '0.5rem',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                      <span>Tx:</span>
                      <code style={{ background: 'var(--bg-muted, #f1f5f9)', padding: '0.15rem 0.4rem', borderRadius: '4px' }}>
                        {step.txHash.slice(0, 14)}...{step.txHash.slice(-10)}
                      </code>
                      <button
                        onClick={() => copyToClipboard(step.txHash)}
                        title="Copy transaction hash"
                        style={{
                          background: 'none',
                          border: 'none',
                          cursor: 'pointer',
                          color: copiedHash === step.txHash ? '#10b981' : '#64748b',
                          padding: '0.2rem',
                          display: 'flex',
                          alignItems: 'center',
                        }}
                      >
                        {copiedHash === step.txHash ? <Check size={13} /> : <Copy size={13} />}
                      </button>
                    </div>

                    <a
                      href={step.explorerUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        color: '#5944db',
                        textDecoration: 'none',
                        fontWeight: 600,
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.3rem',
                      }}
                    >
                      <span>View on Monad Explorer</span>
                      <ExternalLink size={12} />
                    </a>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
