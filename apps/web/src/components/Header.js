/**
 * Header Component for AgentTrust Dashboard
 */

import { MONAD_CONFIG } from '../lib/monad.js';
import { passkeyManager } from '../lib/passkey.js';

export function renderHeader(container, { onStartTour, onConnectPasskey }) {
  const cred = passkeyManager.currentCredential;
  const shortAddress = cred ? `${cred.ownerAddress.slice(0, 6)}...${cred.ownerAddress.slice(-4)}` : null;

  container.innerHTML = `
    <header class="app-header">
      <a href="#" class="brand-wrapper">
        <img src="/logo.jpg" alt="AgentTrust" class="brand-logo" onerror="this.style.display='none'" />
        <div class="brand-info">
          <h1>
            AgentTrust
            <span class="badge-chain">Monad</span>
          </h1>
          <p>Trust & Data Ownership Layer for Autonomous AI Agents</p>
        </div>
      </a>

      <div class="header-actions">
        <div class="status-pill" title="Connected to Monad Testnet RPC">
          <span class="status-indicator"></span>
          <span>${MONAD_CONFIG.chainName} (${MONAD_CONFIG.chainId})</span>
        </div>

        <div class="status-pill" style="border-color: var(--border-cyan); color: var(--cyan-accent);" title="Monad Native P256 Precompile (RIP-7212)">
          <span>⚡ P256 Precompile: <strong>0x100</strong></span>
        </div>

        <button id="btn-judge-tour" class="btn btn-tour" title="Launch 1-Click Guided Demo Narrative for Judges">
          <span>🎯 Judge Demo Tour</span>
        </button>

        <button id="btn-passkey-connect" class="btn ${cred ? 'btn-secondary' : 'btn-primary'}">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M2 18v3c0 .6.4 1 1 1h4v-3h3v-3h2l1.4-1.4a6.5 6.5 0 1 0-4-4Z"/>
            <circle cx="16.5" cy="7.5" r=".5" fill="currentColor"/>
          </svg>
          <span id="passkey-btn-text">${cred ? `Passkey: ${shortAddress}` : 'Register Passkey (P256)'}</span>
        </button>
      </div>
    </header>
  `;

  container.querySelector('#btn-judge-tour')?.addEventListener('click', onStartTour);
  container.querySelector('#btn-passkey-connect')?.addEventListener('click', onConnectPasskey);
}
