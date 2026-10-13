'use client';

import React from 'react';
import { Bot, ShieldCheck, Coins, Ban } from 'lucide-react';

interface StatsBannerProps {
  totalMandates: number;
  activeMandates: number;
  totalSpentEth: string;
  blockedAttempts: number;
}

export function StatsBanner({
  totalMandates,
  activeMandates,
  totalSpentEth,
  blockedAttempts,
}: StatsBannerProps) {
  const stats = [
    {
      label: 'Registered Mandates',
      value: totalMandates.toString(),
      icon: <Bot size={20} color="#8338ec" />,
      subtext: 'Bound to ERC-8004 IDs',
    },
    {
      label: 'Active On-Chain',
      value: activeMandates.toString(),
      icon: <ShieldCheck size={20} color="#34D399" />,
      subtext: 'Hardware Passkey Protected',
    },
    {
      label: 'Enforced Spending',
      value: `${totalSpentEth} MON`,
      icon: <Coins size={20} color="#00f2fe" />,
      subtext: 'Atomic Checks-Effects-Interactions',
    },
    {
      label: 'Attacks / Violations Blocked',
      value: blockedAttempts.toString(),
      icon: <Ban size={20} color="#FB7185" />,
      subtext: 'Policy Reverted On-Chain',
    },
  ];

  return (
    <div className="grid-stats">
      {stats.map((s, idx) => (
        <div key={idx} className="glass-panel" style={{ padding: '1.25rem' }}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'flex-start',
              marginBottom: '0.75rem',
            }}
          >
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{s.label}</span>
            <div
              style={{
                background: 'rgba(255, 255, 255, 0.05)',
                padding: '0.4rem',
                borderRadius: '8px',
              }}
            >
              {s.icon}
            </div>
          </div>
          <div style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '0.2rem' }}>
            {s.value}
          </div>
          <div style={{ fontSize: '0.7rem', color: 'var(--text-faint)' }}>{s.subtext}</div>
        </div>
      ))}
    </div>
  );
}
