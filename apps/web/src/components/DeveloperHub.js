/**
 * Developer Hub & Monad P256 Precompile Deep Dive Component
 * Focuses on developer experience, typed SDK usage, and Monad low-level primitives.
 */

import { MONAD_CONFIG } from '../lib/monad.js';

export function renderDeveloperHub(container) {
  container.innerHTML = `
    <div style="display: flex; flex-direction: column; gap: 24px;">
      <!-- Hero / Quickstart Overview -->
      <div class="card" style="background: linear-gradient(135deg, rgba(14, 17, 26, 0.95) 0%, rgba(21, 25, 38, 0.75) 100%); border-color: var(--border-highlight);">
        <div class="card-header">
          <div class="card-title-group">
            <h2>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--monad-purple)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="4 17 10 11 4 5"/>
                <line x1="12" y1="19" x2="20" y2="19"/>
              </svg>
              Developer Integration Hub & SDK
            </h2>
            <p>Integrate passkey-enforced mandates into any AI agent framework (LangChain, AutoGPT, CrewAI, MCP)</p>
          </div>
          <span class="badge badge-purple">@agenttrust/sdk v0.1.0</span>
        </div>

        <p style="font-size: 0.88rem; color: var(--text-muted); line-height: 1.6; margin-bottom: 20px;">
          AgentTrust provides the trust and data ownership primitive for the AI-native internet. AI models operate inside strict cryptographic bounds authorized by user passkeys and enforced directly at the Monad EVM layer.
        </p>

        <div class="grid-3">
          <div style="background: var(--bg-surface-elevated); padding: 14px; border-radius: var(--radius-md); border: 1px solid var(--border-subtle);">
            <div style="font-size: 0.75rem; color: var(--text-muted); text-transform: uppercase;">1. Install Package</div>
            <div style="font-family: var(--font-mono); font-size: 0.82rem; color: var(--cyan-accent); font-weight: 600; margin-top: 4px;">
              npm install @agenttrust/sdk viem
            </div>
          </div>
          <div style="background: var(--bg-surface-elevated); padding: 14px; border-radius: var(--radius-md); border: 1px solid var(--border-subtle);">
            <div style="font-size: 0.75rem; color: var(--text-muted); text-transform: uppercase;">2. Monad Chain ID</div>
            <div style="font-family: var(--font-mono); font-size: 0.82rem; color: #ffffff; font-weight: 600; margin-top: 4px;">
              10143 (Monad Testnet)
            </div>
          </div>
          <div style="background: var(--bg-surface-elevated); padding: 14px; border-radius: var(--radius-md); border: 1px solid var(--border-subtle);">
            <div style="font-size: 0.75rem; color: var(--text-muted); text-transform: uppercase;">3. Precompile Gas Cost</div>
            <div style="font-family: var(--font-mono); font-size: 0.82rem; color: var(--emerald-success); font-weight: 600; margin-top: 4px;">
              ~3,450 gas (10x EVM Secp256r1)
            </div>
          </div>
        </div>
      </div>

      <!-- 10-Line Integration Quickstart -->
      <div class="card">
        <div class="card-header">
          <div class="card-title-group">
            <h3>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--cyan-accent)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="16 18 22 12 16 6"/>
                <polyline points="8 6 2 12 8 18"/>
              </svg>
              10-Line AI Agent Integration
            </h3>
            <p>How an AI agent tool executor wraps calls with AgentTrust mandate verification</p>
          </div>
        </div>

        <div class="code-box">
<span style="color: #6ee7b7;">import</span> { AgentTrustClient } <span style="color: #6ee7b7;">from</span> <span style="color: #fde68a;">'@agenttrust/sdk'</span>;

<span style="color: #94a3b8;">// 1. Initialize client connected to Monad Testnet</span>
<span style="color: #c4b5fd;">const</span> agentTrust = <span style="color: #6ee7b7;">new</span> AgentTrustClient({
  rpcUrl: <span style="color: #fde68a;">'https://testnet-rpc.monad.xyz'</span>,
  mandateManager: <span style="color: #fde68a;">'${MONAD_CONFIG.contracts.mandateManager}'</span>,
});

<span style="color: #94a3b8;">// 2. Query mandate status before proposing action</span>
<span style="color: #c4b5fd;">const</span> mandate = <span style="color: #6ee7b7;">await</span> agentTrust.getMandate(mandateId);

<span style="color: #94a3b8;">// 3. AI Agent submits action; Monad EVM contract enforces all limits</span>
<span style="color: #c4b5fd;">const</span> receipt = <span style="color: #6ee7b7;">await</span> agentTrust.executeAction({
  mandateId,
  target: <span style="color: #fde68a;">'0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D'</span>,
  value: parseEther(<span style="color: #fde68a;">'0.10'</span>),
  data: encodeFunctionData({ ... }),
  agentKey: process.env.AGENT_PRIVATE_KEY
});

<span style="color: #94a3b8;">// 4. Any external party verifies receipt without querying our server</span>
<span style="color: #c4b5fd;">const</span> isVerified = <span style="color: #6ee7b7;">await</span> agentTrust.verifyReceipt(receipt.actionHash);
        </div>
      </div>

      <!-- Monad Native P256 Precompile Deep Dive -->
      <div class="card" style="border-color: var(--border-cyan);">
        <div class="card-header">
          <div class="card-title-group">
            <h3>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--cyan-accent)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="10"/>
                <line x1="12" y1="16" x2="12" y2="12"/>
                <line x1="12" y1="8" x2="12.01" y2="8"/>
              </svg>
              Monad Native P256 Precompile (0x100 / RIP-7212) Architecture
            </h3>
            <p>Why Monad makes WebAuthn passkey verification practical at scale</p>
          </div>
        </div>

        <p style="font-size: 0.85rem; color: #cbd5e1; line-height: 1.6; margin-bottom: 16px;">
          Traditional Ethereum lacks native curve secp256r1 (P-256) support, requiring expensive Solidity emulation (costing over 300,000 gas per passkey verification).
          Monad implements native precompile <code>0x0000000000000000000000000000000000000100</code> (RIP-7212), verifying WebAuthn assertions in ~3,450 gas.
        </p>

        <div style="background: #050609; padding: 16px; border-radius: var(--radius-md); border: 1px solid var(--border-subtle); margin-bottom: 16px;">
          <div style="font-size: 0.78rem; font-weight: 700; color: var(--cyan-accent); margin-bottom: 8px; text-transform: uppercase;">
            Precompile Input Memory Layout (Exact 160 Bytes)
          </div>
          <div style="font-family: var(--font-mono); font-size: 0.78rem; color: #cbd5e1; line-height: 1.8;">
            <div>[000:032] • <strong style="color: #c4b5fd;">hash:</strong> 32 bytes (SHA-256 / Keccak-256 of WebAuthn clientDataJSON & challenge)</div>
            <div>[032:064] • <strong style="color: #c4b5fd;">r:</strong> 32 bytes (P-256 signature r coordinate)</div>
            <div>[064:096] • <strong style="color: #c4b5fd;">s:</strong> 32 bytes (P-256 signature s coordinate)</div>
            <div>[096:128] • <strong style="color: #c4b5fd;">x:</strong> 32 bytes (WebAuthn Public Key x coordinate)</div>
            <div>[128:160] • <strong style="color: #c4b5fd;">y:</strong> 32 bytes (WebAuthn Public Key y coordinate)</div>
          </div>
        </div>

        <div style="font-size: 0.82rem; color: var(--text-muted); line-height: 1.5;">
          <strong>Security Guarantee:</strong> If the passkey signature is invalid or forged, the precompile call returns <code>0</code> and the <code>IMandateManager</code> transaction immediately reverts with <code>InvalidPasskeySignature()</code>.
        </div>
      </div>
    </div>
  `;
}
