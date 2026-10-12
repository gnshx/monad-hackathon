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
        <img
          src="/logo.jpg"
          alt="AgentTrust"
          style={{
            width: '36px',
            height: '36px',
            borderRadius: '10px',
            objectFit: 'cover',
            border: '1px solid var(--border-highlight, #836ef9)',
            boxShadow: '0 0 12px rgba(131, 110, 249, 0.4)'
          }}
          onError={(e) => {
            (e.target as HTMLElement).style.display = 'none';
          }}
        />
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span className="brand-title">AgentTrust</span>
            <span className="brand-tag">Monad Testnet</span>
            <span className="badge badge-monad" style={{ fontSize: '0.65rem', padding: '0.15rem 0.45rem' }}>
              ⚡ P256 Precompile: 0x100
            </span>
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
