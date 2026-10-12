/**
 * Zero-Trust Portable Verifier Component
 * Enables any independent third party (or judge) to cryptographically verify
 * mandate bounds and action receipts without trusting any AgentTrust backend.
 */

import { MONAD_CONFIG } from '../lib/monad.js';
import { engine } from '../lib/engine.js';

export function renderZeroTrustVerifier(container, { selectedHash = null }) {
  const state = engine.getState();
  const defaultHash = selectedHash || (state.actionHistory[0] ? state.actionHistory[0].actionHash : '');

  container.innerHTML = `
    <div style="display: flex; flex-direction: column; gap: 24px;">
      <!-- Verifier Header -->
      <div class="card" style="background: linear-gradient(135deg, rgba(14, 17, 26, 0.95) 0%, rgba(21, 25, 38, 0.75) 100%); border-color: var(--border-cyan);">
        <div class="card-header">
          <div class="card-title-group">
            <h2>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--cyan-accent)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                <path d="m9 12 2 2 4-4"/>
              </svg>
              Zero-Trust Portable Verifier
            </h2>
            <p>Direct cryptographic audit of Monad chain state • ZERO backend dependencies required</p>
          </div>
          <span class="badge badge-cyan">Independent Client-Side Audit</span>
        </div>

        <form id="form-verify-hash" style="margin-top: 10px;">
          <div class="form-group">
            <label class="form-label">Enter Action Hash, Receipt ID, or Monad Transaction Hash</label>
            <div style="display: flex; gap: 10px;">
              <input type="text" id="verify-input-hash" class="form-control form-control-mono" value="${defaultHash}" placeholder="0x..." />
              <button type="submit" class="btn btn-cyan" style="flex-shrink: 0;">
                <span>Audit On Monad</span>
              </button>
            </div>
          </div>
        </form>

        <!-- Quick Select Pills -->
        <div style="display: flex; align-items: center; gap: 8px; font-size: 0.78rem; flex-wrap: wrap;">
          <span style="color: var(--text-dim);">Recent Receipts:</span>
          ${state.actionHistory.slice(0, 3).map(item => `
            <button class="btn btn-secondary btn-sm btn-quick-hash" data-hash="${item.actionHash}" style="font-size: 0.72rem; padding: 2px 8px; font-family: var(--font-mono);">
              ${item.actionHash.slice(0, 10)}... (${item.decision})
            </button>
          `).join('')}
        </div>
      </div>

      <!-- Verification Results Container -->
      <div id="verification-result-container"></div>

      <!-- Independent Verification SDK Code Example -->
      <div class="card">
        <div class="card-header">
          <div class="card-title-group">
            <h3>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--monad-purple)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="16 18 22 12 16 6"/>
                <polyline points="8 6 2 12 8 18"/>
              </svg>
              How An Integrator Verifies This in 6 Lines of Code
            </h3>
            <p>Any external application can verify this receipt directly against Monad RPC</p>
          </div>
        </div>

        <div class="code-box">
<span style="color: #6ee7b7;">import</span> { createPublicClient, http } <span style="color: #6ee7b7;">from</span> <span style="color: #fde68a;">'viem'</span>;
<span style="color: #6ee7b7;">import</span> { AgentTrustVerifier } <span style="color: #6ee7b7;">from</span> <span style="color: #fde68a;">'@agenttrust/sdk'</span>;

<span style="color: #94a3b8;">// 1. Point to Monad public RPC (No AgentTrust server queried)</span>
<span style="color: #c4b5fd;">const</span> verifier = <span style="color: #6ee7b7;">new</span> AgentTrustVerifier({
  rpcUrl: <span style="color: #fde68a;">'https://testnet-rpc.monad.xyz'</span>,
  mandateManagerAddress: <span style="color: #fde68a;">'${MONAD_CONFIG.contracts.mandateManager}'</span>,
  p256Precompile: <span style="color: #fde68a;">'0x0000000000000000000000000000000000000100'</span>
});

<span style="color: #94a3b8;">// 2. Cryptographically audit the action and passkey authorization</span>
<span style="color: #c4b5fd;">const</span> audit = <span style="color: #6ee7b7;">await</span> verifier.verifyActionReceipt(<span style="color: #fde68a;">'${defaultHash || "0x..."}'</span>);
console.log(<span style="color: #fde68a;">'Is Authenticated on Monad:'</span>, audit.isValid);
console.log(<span style="color: #fde68a;">'Passkey Signer:'</span>, audit.passkeyOwner);
        </div>
      </div>
    </div>
  `;

  // Function to run audit
  const runAudit = (hash) => {
    const resultBox = container.querySelector('#verification-result-container');
    if (!hash) {
      resultBox.innerHTML = `
        <div class="card" style="text-align: center; color: var(--text-muted); padding: 30px 0;">
          Please enter an Action Hash or select a recent receipt above.
        </div>
      `;
      return;
    }

    const audit = engine.verifyReceiptIndependent(hash);
    if (!audit.verified) {
      resultBox.innerHTML = `
        <div class="card" style="border-color: var(--rose-danger); background: rgba(244, 63, 94, 0.05);">
          <h3 style="color: var(--rose-danger); margin-bottom: 8px;">❌ Verification Failed</h3>
          <p style="color: #cbd5e1; font-size: 0.85rem;">${audit.error}</p>
        </div>
      `;
      return;
    }

    const { receipt, mandate, steps, proofHash } = audit;
    const isExec = receipt.decision === 'executed';

    resultBox.innerHTML = `
      <div class="card" style="border-color: ${isExec ? 'var(--emerald-success)' : 'var(--amber-warning)'}; background: rgba(14, 17, 26, 0.95); animation: fadeIn 0.3s ease;">
        <div class="card-header">
          <div class="card-title-group">
            <h3 style="color: ${isExec ? 'var(--emerald-success)' : 'var(--amber-warning)'}; display: flex; align-items: center; gap: 8px;">
              ${isExec ? '🛡️ Cryptographically Verified on Monad' : '⚠️ Verified Reversion / Rejection on Monad'}
            </h3>
            <p>Verification Proof Hash: <code style="font-family: var(--font-mono); color: var(--cyan-accent);">${proofHash}</code></p>
          </div>
          <span class="badge ${isExec ? 'badge-active' : 'badge-purple'}">
            Verified Zero-Trust
          </span>
        </div>

        <!-- 6 Invariant Verification Checklist -->
        <div style="display: flex; flex-direction: column; gap: 10px; margin-bottom: 20px;">
          ${steps.map(s => `
            <div style="background: var(--bg-surface-elevated); padding: 12px 16px; border-radius: var(--radius-md); display: flex; align-items: flex-start; gap: 12px; border: 1px solid var(--border-subtle);">
              <div style="width: 22px; height: 22px; border-radius: 50%; background: rgba(16, 185, 129, 0.2); color: var(--emerald-success); display: flex; align-items: center; justify-content: center; font-size: 0.8rem; font-weight: 800; flex-shrink: 0;">
                ✓
              </div>
              <div style="flex: 1;">
                <div style="font-size: 0.85rem; font-weight: 700; color: #ffffff;">
                  Step ${s.step}: ${s.title}
                </div>
                <div style="font-size: 0.78rem; color: var(--text-muted); margin-top: 2px;">
                  ${s.description}
                </div>
              </div>
            </div>
          `).join('')}
        </div>

        <!-- Portable Attestation JSON Box -->
        <div style="margin-top: 14px;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
            <span style="font-size: 0.78rem; font-weight: 700; color: var(--text-muted); text-transform: uppercase;">
              Cryptographic Attestation Proof (Portable JSON)
            </span>
          </div>
          <div class="code-box">
            <pre style="margin: 0; white-space: pre-wrap;">${JSON.stringify({
              network: 'Monad Testnet',
              chainId: 10143,
              mandateId: mandate.mandateId,
              actionHash: receipt.actionHash,
              txHash: receipt.txHash,
              blockNumber: receipt.blockNumber,
              decision: receipt.decision,
              revertReason: receipt.revertReason || null,
              ownerPasskey: mandate.owner,
              agentId: receipt.agentId,
              target: receipt.target,
              value: receipt.value + ' MON',
              p256Precompile: MONAD_CONFIG.contracts.p256Precompile,
              verifiedWithoutServer: true,
              proofHash,
              timestamp: new Date(receipt.timestamp).toISOString(),
            }, null, 2)}</pre>
          </div>
        </div>
      </div>
    `;
  };

  // Run initial audit if hash provided
  if (defaultHash) {
    runAudit(defaultHash);
  }

  container.querySelector('#form-verify-hash')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const hash = container.querySelector('#verify-input-hash').value.trim();
    runAudit(hash);
  });

  container.querySelectorAll('.btn-quick-hash').forEach(btn => {
    btn.addEventListener('click', () => {
      container.querySelector('#verify-input-hash').value = btn.dataset.hash;
      runAudit(btn.dataset.hash);
    });
  });
}
