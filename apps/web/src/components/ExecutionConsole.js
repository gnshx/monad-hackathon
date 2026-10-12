/**
 * Security Demonstration & Execution Console Component
 * Proves on-chain enforcement invariants:
 * 1. Allowed action succeeding
 * 2. Forbidden action (unauthorized target) reverting
 * 3. Over-limit action (value > maxValuePerAction) reverting
 * 4. Revoked mandate failing
 */

import { MONAD_CONFIG } from '../lib/monad.js';
import { engine } from '../lib/engine.js';

export function renderExecutionConsole(container, { onVerifyReceipt }) {
  const state = engine.getState();
  const activeMandates = state.mandates;

  container.innerHTML = `
    <div class="grid-main-side">
      <!-- Left Column: Scenario Launcher & Execution Control -->
      <div style="display: flex; flex-direction: column; gap: 24px;">
        <div class="card" style="border-color: var(--border-highlight);">
          <div class="card-header">
            <div class="card-title-group">
              <h2>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--cyan-accent)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="m18 15-6-6-6 6"/>
                </svg>
                Autonomous Execution Sandbox
              </h2>
              <p>Simulate AI agent actions and watch Monad EVM contract invariants enforce security live</p>
            </div>
            <span class="badge badge-cyan">Monad Testnet EVM</span>
          </div>

          <div style="margin-bottom: 20px;">
            <label class="form-label">Active Mandate Context</label>
            <select id="exec-mandate-select" class="form-control form-select">
              ${activeMandates.map(m => {
                const agent = state.agents.find(a => a.id === m.agentId);
                return `
                  <option value="${m.mandateId}">
                    ${agent?.name} • ID: ${m.mandateId.slice(0, 10)}... (Cap: ${m.maxValuePerAction} MON / action) ${m.isRevoked ? '[REVOKED]' : ''}
                  </option>
                `;
              }).join('')}
            </select>
          </div>

          <!-- Preset Demonstration Scenarios -->
          <div style="margin-bottom: 12px; font-size: 0.82rem; font-weight: 700; color: var(--text-muted); text-transform: uppercase;">
            Judges Security Proof Scenarios (Click to Dispatch)
          </div>

          <div class="scenario-grid">
            <!-- Scenario 1: Allowed Action -->
            <div class="scenario-card" id="btn-scenario-allowed" style="border-left: 4px solid var(--emerald-success);">
              <div class="scenario-card-header">
                <span class="scenario-title">1. Permitted Action</span>
                <span class="badge badge-active">Will Succeed</span>
              </div>
              <p class="scenario-desc">
                Agent swaps <strong>0.10 MON</strong> on approved Monad DEX Router (<code style="font-family: var(--font-mono); color: var(--cyan-accent); font-size: 0.72rem;">0x7a25...</code>) within spending cap.
              </p>
              <div style="margin-top: 10px; font-size: 0.75rem; color: var(--emerald-success); font-weight: 600;">
                ▶ Run Allowed Swap
              </div>
            </div>

            <!-- Scenario 2: Forbidden Target -->
            <div class="scenario-card" id="btn-scenario-bad-target" style="border-left: 4px solid var(--rose-danger);">
              <div class="scenario-card-header">
                <span class="scenario-title">2. Forbidden Target</span>
                <span class="badge badge-revoked">Will Revert</span>
              </div>
              <p class="scenario-desc">
                Agent attempts to call unwhitelisted hacker contract (<code style="font-family: var(--font-mono); color: var(--rose-danger); font-size: 0.72rem;">0xDead...bEEf</code>).
              </p>
              <div style="margin-top: 10px; font-size: 0.75rem; color: var(--rose-danger); font-weight: 600;">
                ▶ Run Unapproved Target
              </div>
            </div>

            <!-- Scenario 3: Limit Exceeded -->
            <div class="scenario-card" id="btn-scenario-limit" style="border-left: 4px solid var(--rose-danger);">
              <div class="scenario-card-header">
                <span class="scenario-title">3. Spending Cap Exceeded</span>
                <span class="badge badge-revoked">Will Revert</span>
              </div>
              <p class="scenario-desc">
                Agent attempts to spend <strong>1.50 MON</strong> (exceeds the 0.25 MON per-action mandate limit).
              </p>
              <div style="margin-top: 10px; font-size: 0.75rem; color: var(--rose-danger); font-weight: 600;">
                ▶ Run Over-Limit Action
              </div>
            </div>

            <!-- Scenario 4: Revocation Replay -->
            <div class="scenario-card" id="btn-scenario-revoke-fail" style="border-left: 4px solid var(--amber-warning);">
              <div class="scenario-card-header">
                <span class="scenario-title">4. Revoked Mandate Failure</span>
                <span class="badge" style="background: rgba(245, 158, 11, 0.2); color: #fde68a;">Will Revert</span>
              </div>
              <p class="scenario-desc">
                Attempts action against a mandate that was revoked by the sovereign passkey owner.
              </p>
              <div style="margin-top: 10px; font-size: 0.75rem; color: var(--amber-warning); font-weight: 600;">
                ▶ Run Post-Revocation Test
              </div>
            </div>
          </div>

          <!-- Custom Action Runner -->
          <div style="margin-top: 24px; padding-top: 20px; border-top: 1px solid var(--border-subtle);">
            <div style="font-size: 0.85rem; font-weight: 700; color: #ffffff; margin-bottom: 12px;">
              Custom AI Agent Action Dispatcher
            </div>
            <form id="form-custom-action">
              <div class="form-group">
                <label class="form-label">Target Contract Address</label>
                <input type="text" id="custom-target" class="form-control form-control-mono" value="${MONAD_CONFIG.contracts.monadRouter}" />
              </div>
              <div class="grid-2">
                <div class="form-group">
                  <label class="form-label">Function Selector</label>
                  <select id="custom-selector" class="form-control form-select">
                    <option value="0x38ed1739">swapExactTokens (0x38ed1739)</option>
                    <option value="0xa9059cbb">transfer (0xa9059cbb)</option>
                    <option value="0xd0e30db0">deposit (0xd0e30db0)</option>
                    <option value="0x6b876543">drainAll [MALICIOUS] (0x6b876543)</option>
                  </select>
                </div>
                <div class="form-group">
                  <label class="form-label">Action Value (MON)</label>
                  <input type="number" id="custom-value" class="form-control" value="0.10" step="0.05" />
                </div>
              </div>
              <button type="submit" class="btn btn-secondary" style="width: 100%;">
                <span>Execute Custom Action via Monad Mandate</span>
              </button>
            </form>
          </div>
        </div>

        <!-- Latest Execution Receipt View -->
        <div id="latest-receipt-container"></div>
      </div>

      <!-- Right Column: Live On-Chain Activity Feed -->
      <div style="display: flex; flex-direction: column; gap: 20px;">
        <div class="card">
          <div class="card-header">
            <div class="card-title-group">
              <h3>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--monad-purple)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
                </svg>
                Monad Block Receipts (${state.actionHistory.length})
              </h3>
              <p>On-chain event logs emitted by IMandateManager</p>
            </div>
          </div>

          <div class="activity-feed" id="activity-feed-list">
            ${state.actionHistory.map(item => {
              const isExec = item.decision === 'executed';
              const isRev = item.decision === 'revoked';

              return `
                <div class="activity-item ${isExec ? 'success' : isRev ? 'revoked' : 'reverted'}">
                  <div class="activity-icon">
                    ${isExec ? '✅' : isRev ? '🔒' : '🛑'}
                  </div>
                  <div class="activity-content">
                    <div class="activity-title">
                      <span>${item.agentName}</span>
                      <span class="badge ${isExec ? 'badge-active' : isRev ? 'badge-purple' : 'badge-revoked'}">
                        ${item.decision.toUpperCase()}
                      </span>
                    </div>

                    <div class="activity-subtitle">
                      Tx: <span style="color: var(--cyan-accent);">${item.txHash.slice(0, 14)}...</span> • Block #${item.blockNumber}
                    </div>

                    <div style="font-size: 0.75rem; color: #cbd5e1; margin-top: 4px;">
                      Target: <span style="font-family: var(--font-mono); color: #94a3b8;">${item.target.slice(0, 10)}...</span> •
                      Val: <strong>${item.value} MON</strong>
                    </div>

                    ${item.revertReason ? `
                      <div style="font-family: var(--font-mono); font-size: 0.72rem; color: var(--rose-danger); margin-top: 4px; background: rgba(244, 63, 94, 0.1); padding: 4px 6px; border-radius: var(--radius-sm);">
                        🛑 Revert: ${item.revertReason}
                      </div>
                    ` : ''}

                    <div style="margin-top: 8px; display: flex; justify-content: flex-end;">
                      <button class="btn btn-secondary btn-sm btn-verify-feed" data-receipt-hash="${item.actionHash}" style="font-size: 0.7rem; padding: 3px 8px;">
                        <span>Verify Independently ↗</span>
                      </button>
                    </div>
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        </div>
      </div>
    </div>
  `;

  // Function to render latest receipt
  const showReceipt = (receipt) => {
    const containerReceipt = container.querySelector('#latest-receipt-container');
    const isExec = receipt.decision === 'executed';
    containerReceipt.innerHTML = `
      <div class="card" style="border-color: ${isExec ? 'var(--emerald-success)' : 'var(--rose-danger)'}; background: rgba(14, 17, 26, 0.95); animation: fadeIn 0.3s ease;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
          <h3 style="font-size: 1rem; color: #ffffff; display: flex; align-items: center; gap: 8px;">
            ${isExec ? '✅ Transaction Successfully Executed on Monad' : '🛑 Transaction Reverted by Contract Invariant'}
          </h3>
          <span class="badge ${isExec ? 'badge-active' : 'badge-revoked'}">
            ${receipt.decision.toUpperCase()}
          </span>
        </div>

        <div class="code-box" style="margin-bottom: 14px;">
          <div><strong style="color: #c4b5fd;">Transaction Hash:</strong> ${receipt.txHash}</div>
          <div><strong style="color: #c4b5fd;">Action Hash:</strong> ${receipt.actionHash}</div>
          <div><strong style="color: #c4b5fd;">Target Contract:</strong> ${receipt.target}</div>
          <div><strong style="color: #c4b5fd;">Selector:</strong> ${receipt.selector} (${receipt.selectorName})</div>
          <div><strong style="color: #c4b5fd;">Value:</strong> ${receipt.value} MON</div>
          <div><strong style="color: #c4b5fd;">Monad Gas Used:</strong> ${receipt.gasUsed}</div>
          ${receipt.revertReason ? `
            <div style="color: var(--rose-danger); font-weight: 700; margin-top: 4px;">
              [REVERT TRACE] ${receipt.revertReason}
            </div>
          ` : `
            <div style="color: var(--emerald-success); font-weight: 700; margin-top: 4px;">
              [EVENT] ActionExecuted(mandateId, agentId, target, value, actionHash)
            </div>
          `}
        </div>

        <button class="btn btn-cyan btn-sm" id="btn-inspect-verified-receipt" style="width: 100%;">
          <span>Inspect Zero-Trust Cryptographic Proof ↗</span>
        </button>
      </div>
    `;

    containerReceipt.querySelector('#btn-inspect-verified-receipt')?.addEventListener('click', () => {
      onVerifyReceipt(receipt.actionHash);
    });
  };

  // Attach Scenario Handlers
  container.querySelector('#btn-scenario-allowed')?.addEventListener('click', () => {
    const mandateId = container.querySelector('#exec-mandate-select').value;
    const receipt = engine.executeAction({
      mandateId,
      target: MONAD_CONFIG.contracts.monadRouter,
      selector: '0x38ed1739',
      value: 0.10,
    });
    renderExecutionConsole(container, { onVerifyReceipt });
    showReceipt(receipt);
  });

  container.querySelector('#btn-scenario-bad-target')?.addEventListener('click', () => {
    const mandateId = container.querySelector('#exec-mandate-select').value;
    const receipt = engine.executeAction({
      mandateId,
      target: MONAD_CONFIG.contracts.unauthorizedDrainTarget,
      selector: '0xa9059cbb',
      value: 0.10,
    });
    renderExecutionConsole(container, { onVerifyReceipt });
    showReceipt(receipt);
  });

  container.querySelector('#btn-scenario-limit')?.addEventListener('click', () => {
    const mandateId = container.querySelector('#exec-mandate-select').value;
    const receipt = engine.executeAction({
      mandateId,
      target: MONAD_CONFIG.contracts.monadRouter,
      selector: '0x38ed1739',
      value: 1.50, // exceeds 0.25 limit
    });
    renderExecutionConsole(container, { onVerifyReceipt });
    showReceipt(receipt);
  });

  container.querySelector('#btn-scenario-revoke-fail')?.addEventListener('click', async () => {
    const mandateId = container.querySelector('#exec-mandate-select').value;
    // Mark revoked if not already
    const mandate = state.mandates.find(m => m.mandateId === mandateId);
    if (mandate && !mandate.isRevoked) {
      await engine.revokeMandate(mandateId);
    }
    const receipt = engine.executeAction({
      mandateId,
      target: MONAD_CONFIG.contracts.monadRouter,
      selector: '0x38ed1739',
      value: 0.05,
    });
    renderExecutionConsole(container, { onVerifyReceipt });
    showReceipt(receipt);
  });

  container.querySelector('#form-custom-action')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const mandateId = container.querySelector('#exec-mandate-select').value;
    const target = container.querySelector('#custom-target').value;
    const selector = container.querySelector('#custom-selector').value;
    const value = container.querySelector('#custom-value').value;

    const receipt = engine.executeAction({
      mandateId,
      target,
      selector,
      value,
    });
    renderExecutionConsole(container, { onVerifyReceipt });
    showReceipt(receipt);
  });

  container.querySelectorAll('.btn-verify-feed').forEach(btn => {
    btn.addEventListener('click', () => {
      onVerifyReceipt(btn.dataset.receiptHash);
    });
  });
}
