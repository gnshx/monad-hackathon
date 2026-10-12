'use client';

import React from 'react';
import { Shield, KeyRound, Wallet, Cpu } from 'lucide-react';

interface NavbarProps {
  walletAddress: string | null;
  passkeyRegistered: boolean;
  onConnectWallet: () => void;
  onRegisterPasskey: () => void;
}

export function Navbar({
  walletAddress,
  passkeyRegistered,
  onConnectWallet,
  onRegisterPasskey,
}: NavbarProps) {
  return (
    <nav className="navbar">
      <div className="brand">
        <div className="brand-icon">
          <Shield size={20} color="#ffffff" />
        </div>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span className="brand-title">AgentTrust</span>
            <span className="brand-tag">Monad Testnet</span>
          </div>
          <p style={{ fontSize: '0.7rem', color: 'var(--text-faint)' }}>
            Passkey-Authorized On-Chain AI Agent Permissions
          </p>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
        <button
          onClick={onRegisterPasskey}
          className={`btn ${passkeyRegistered ? 'btn-secondary' : 'btn-primary'}`}
          style={{ fontSize: '0.8rem', padding: '0.5rem 0.9rem' }}
        >
          <KeyRound size={15} />
          {passkeyRegistered ? 'Passkey Enrolled (P-256)' : 'Enroll Passkey'}
        </button>

        <button
          onClick={onConnectWallet}
          className="btn btn-secondary"
          style={{ fontSize: '0.8rem', padding: '0.5rem 0.9rem' }}
        >
          <Wallet size={15} />
          {walletAddress
            ? `${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}`
            : 'Connect Wallet'}
        </button>
      </div>
    </nav>
  );
}
