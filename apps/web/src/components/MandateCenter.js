/**
 * Mandate Center Component
 * Create, manage, inspect, and revoke Passkey-authorized mandates.
 */

import { MONAD_CONFIG } from '../lib/monad.js';
import { passkeyManager } from '../lib/passkey.js';
import { engine } from '../lib/engine.js';

export function renderMandateCenter(container, { onSwitchTab }) {
  const state = engine.getState();
  const cred = passkeyManager.currentCredential;

  container.innerHTML = `
    <div class="grid-main-side">
      <!-- Left Column: Create Mandate Form & Passkey Vault -->
      <div style="display: flex; flex-direction: column; gap: 24px;">
        <!-- Passkey Vault Status -->
        <div class="card" style="border-color: var(--border-highlight); background: linear-gradient(135deg, rgba(14, 17, 26, 0.9) 0%, rgba(21, 25, 38, 0.7) 100%);">
          <div class="card-header">
            <div class="card-title-group">
              <h3>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--cyan-accent)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M12 2a5 5 0 0 0-5 5v3H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8a2 2 0 0 0-2-2h-1V7a5 5 0 0 0-5-5zM9 7a3 3 0 0 1 6 0v3H9V7z"/>
                </svg>
                Passkey Vault (Monad Native P256 / WebAuthn)
              </h3>
              <p>Hardware-backed cryptographic identity bound directly to Monad's P256 precompile</p>
            </div>
            <span class="badge ${cred ? 'badge-active' : 'badge-purple'}">
              ${cred ? (cred.isHardware ? 'Hardware Biometric' : 'Virtual Authenticator') : 'Unregistered'}
            </span>
          </div>

          ${cred ? `
            <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 14px; font-size: 0.82rem;">
              <div style="background: var(--bg-surface-elevated); padding: 10px 14px; border-radius: var(--radius-md); border: 1px solid var(--border-subtle);">
                <div style="color: var(--text-muted); font-size: 0.75rem;">SOVEREIGN OWNER ADDRESS</div>
                <div style="font-family: var(--font-mono); color: var(--cyan-accent); font-weight: 600;">${cred.ownerAddress}</div>
              </div>
              <div style="background: var(--bg-surface-elevated); padding: 10px 14px; border-radius: var(--radius-md); border: 1px solid var(--border-subtle);">
                <div style="color: var(--text-muted); font-size: 0.75rem;">CREDENTIAL ID</div>
                <div style="font-family: var(--font-mono); color: #cbd5e1; word-break: break-all;">${cred.id.slice(0, 22)}...</div>
              </div>
            </div>

            <div style="margin-top: 12px; background: #050609; padding: 10px 14px; border-radius: var(--radius-md); border: 1px solid var(--border-subtle); font-size: 0.75rem; font-family: var(--font-mono); color: var(--text-muted);">
              <div><strong style="color: #c4b5fd;">P256 Curve:</strong> secp256r1 (ES256, alg -7)</div>
              <div><strong style="color: #c4b5fd;">Public Key X:</strong> ${cred.x.slice(0, 26)}...</div>
              <div><strong style="color: #c4b5fd;">Public Key Y:</strong> ${cred.y.slice(0, 26)}...</div>
              <div><strong style="color: #c4b5fd;">Precompile Target:</strong> ${MONAD_CONFIG.contracts.p256Precompile}</div>
            </div>
          ` : `
            <div style="text-align: center; padding: 16px 0;">
              <p style="color: var(--text-muted); font-size: 0.88rem; margin-bottom: 14px;">
                No passkey enrolled yet. Register your WebAuthn passkey in a single tap without invasive biometrics or centralized servers.
              </p>
              <button id="btn-vault-enroll" class="btn btn-primary">
                Register Sovereign Passkey (P256)
              </button>
            </div>
          `}
        </div>

        <!-- Create Mandate Form -->
        <div class="card" id="card-create-mandate">
          <div class="card-header">
            <div class="card-title-group">
              <h2>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--monad-purple)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                  <polyline points="14 2 14 8 20 8"/>
                  <line x1="12" y1="18" x2="12" y2="12"/>
                  <line x1="9" y1="15" x2="15" y2="15"/>
                </svg>
                Create Passkey Mandate
              </h2>
              <p>Authorize an autonomous AI agent with cryptographic boundaries enforced on Monad</p>
            </div>
          </div>

          <form id="form-mandate">
            <div class="form-group">
              <label class="form-label">Select Registered AI Agent (ERC-8004)</label>
              <select id="mandate-agent" class="form-control form-select">
                ${state.agents.map(a => `
                  <option value="${a.id}">${a.name} (ID: #${a.id} • ${a.model.split('/')[0].trim()})</option>
                `).join('')}
              </select>
            </div>

            <div class="form-group">
              <label class="form-label">Permitted Target Contracts (Monad Testnet)</label>
              <div style="display: flex; flex-direction: column; gap: 8px;">
                <label style="display: flex; align-items: center; gap: 8px; font-size: 0.82rem; cursor: pointer;">
                  <input type="checkbox" name="target-option" value="${MONAD_CONFIG.contracts.monadRouter}" checked />
                  <span>Monad DEX Router (<code style="font-family: var(--font-mono); color: var(--cyan-accent);">${MONAD_CONFIG.contracts.monadRouter.slice(0, 10)}...</code>)</span>
                </label>
                <label style="display: flex; align-items: center; gap: 8px; font-size: 0.82rem; cursor: pointer;">
                  <input type="checkbox" name="target-option" value="${MONAD_CONFIG.contracts.liquidStaking}" checked />
                  <span>Liquid Staking Contract (<code style="font-family: var(--font-mono); color: var(--cyan-accent);">${MONAD_CONFIG.contracts.liquidStaking.slice(0, 10)}...</code>)</span>
                </label>
                <label style="display: flex; align-items: center; gap: 8px; font-size: 0.82rem; cursor: pointer;">
                  <input type="checkbox" name="target-option" value="${MONAD_CONFIG.contracts.oracleAttester}" />
                  <span>Oracle Attester Gateway (<code style="font-family: var(--font-mono); color: var(--cyan-accent);">${MONAD_CONFIG.contracts.oracleAttester.slice(0, 10)}...</code>)</span>
                </label>
              </div>
            </div>

            <div class="form-group">
              <label class="form-label">Permitted Function Selectors</label>
              <div class="checkbox-group" id="selector-chips">
                <span class="selector-chip active" data-selector="0x38ed1739">swapExactTokens (0x38ed1739)</span>
                <span class="selector-chip active" data-selector="0xd0e30db0">deposit (0xd0e30db0)</span>
                <span class="selector-chip active" data-selector="0xa9059cbb">transfer (0xa9059cbb)</span>
                <span class="selector-chip" data-selector="0xf8c8765e">rebalance (0xf8c8765e)</span>
                <span class="selector-chip" data-selector="0x2e1a7d4d">withdraw (0x2e1a7d4d)</span>
              </div>
            </div>

            <div class="grid-2">
              <div class="form-group">
                <label class="form-label">Max Value Per Action (MON)</label>
                <input type="number" id="mandate-max-action" class="form-control" value="0.25" step="0.05" min="0.01" />
              </div>
              <div class="form-group">
                <label class="form-label">Max Total Spending Cap (MON)</label>
                <input type="number" id="mandate-max-total" class="form-control" value="2.50" step="0.1" min="0.1" />
              </div>
            </div>

            <div class="grid-2">
              <div class="form-group">
                <label class="form-label">Expiry Duration</label>
                <select id="mandate-duration" class="form-control form-select">
                  <option value="1">24 Hours</option>
                  <option value="7" selected>7 Days</option>
                  <option value="30">30 Days</option>
                </select>
              </div>
              <div class="form-group">
                <label class="form-label">Replay Nonce</label>
                <input type="text" class="form-control form-control-mono" value="0 (Contract Protected)" disabled />
              </div>
            </div>

            <button type="submit" id="btn-submit-mandate" class="btn btn-primary" style="width: 100%; margin-top: 10px; padding: 12px;">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
              </svg>
              <span>Sign & Authorize Mandate with Passkey (P256)</span>
            </button>
          </form>
        </div>
      </div>

      <!-- Right Column: Active Mandates & Spending Gauges -->
      <div style="display: flex; flex-direction: column; gap: 20px;">
        <div class="card" id="card-active-mandates">
          <div class="card-header">
            <div class="card-title-group">
              <h3>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--cyan-accent)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
                </svg>
                Active On-Chain Mandates (${state.mandates.length})
              </h3>
              <p>Real-time enforcement state verified on Monad Testnet</p>
            </div>
          </div>

          <div style="display: flex; flex-direction: column; gap: 16px;">
            ${state.mandates.length === 0 ? `
              <p style="color: var(--text-muted); font-size: 0.85rem; text-align: center; padding: 30px 0;">
                No active mandates found. Create one using the form on the left.
              </p>
            ` : state.mandates.map(m => {
              const agent = state.agents.find(a => a.id === m.agentId);
              const percentSpent = Math.min(100, Math.round((m.spentTotal / m.maxTotalValue) * 100));
              const daysLeft = Math.max(0, Math.ceil((m.expiresAt - Date.now()) / 86400000));
              const isWarning = percentSpent > 75;

              return `
                <div style="background: var(--bg-surface-elevated); border: 1px solid ${m.isRevoked ? 'var(--rose-danger)' : 'var(--border-subtle)'}; border-radius: var(--radius-md); padding: 18px; position: relative;">
                  <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 12px;">
                    <div>
                      <div style="font-weight: 700; font-size: 0.95rem; color: #ffffff;">
                        ${agent?.name || 'Agent #' + m.agentId}
                      </div>
                      <div style="font-family: var(--font-mono); font-size: 0.72rem; color: var(--cyan-accent);">
                        ID: ${m.mandateId.slice(0, 14)}...${m.mandateId.slice(-6)}
                      </div>
                    </div>
                    <span class="badge ${m.isRevoked ? 'badge-revoked' : 'badge-active'}">
                      ${m.isRevoked ? 'Revoked' : 'Active On Monad'}
                    </span>
                  </div>

                  <!-- Spending Meter -->
                  <div class="meter-wrapper">
                    <div class="meter-header">
                      <span>Spending Allocation</span>
                      <strong style="color: ${isWarning ? 'var(--rose-danger)' : 'var(--cyan-accent)'};">
                        ${m.spentTotal.toFixed(2)} / ${m.maxTotalValue.toFixed(2)} MON (${percentSpent}%)
                      </strong>
                    </div>
                    <div class="meter-bar-bg">
                      <div class="meter-bar-fill ${isWarning ? 'warning' : ''}" style="width: ${percentSpent}%;"></div>
                    </div>
                  </div>

                  <!-- Constraints Metadata -->
                  <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; font-size: 0.75rem; color: var(--text-muted); margin: 12px 0;">
                    <div>• Max Per Action: <strong style="color: #cbd5e1;">${m.maxValuePerAction} MON</strong></div>
                    <div>• Actions Executed: <strong style="color: #cbd5e1;">${m.actionCount}</strong></div>
                    <div>• Time Remaining: <strong style="color: #cbd5e1;">${daysLeft} days</strong></div>
                    <div>• Replay Nonce: <strong style="color: #cbd5e1;">${m.nonce}</strong></div>
                  </div>

                  <!-- Allowed Target chips -->
                  <div style="margin-bottom: 14px;">
                    <div style="font-size: 0.7rem; color: var(--text-dim); text-transform: uppercase; margin-bottom: 4px;">Allowed Targets</div>
                    <div style="display: flex; flex-wrap: wrap; gap: 4px;">
                      ${m.allowedTargets.map(t => `
                        <span style="font-family: var(--font-mono); font-size: 0.7rem; padding: 2px 6px; border-radius: var(--radius-sm); background: #050609; border: 1px solid var(--border-subtle); color: #cbd5e1;">
                          ${t.slice(0, 8)}...${t.slice(-4)}
                        </span>
                      `).join('')}
                    </div>
                  </div>

                  <div style="display: flex; gap: 8px;">
                    ${!m.isRevoked ? `
                      <button class="btn btn-danger btn-sm btn-revoke" data-mandate-id="${m.mandateId}" style="width: 100%;">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                          <circle cx="12" cy="12" r="10"/>
                          <line x1="15" y1="9" x2="9" y2="15"/>
                          <line x1="9" y1="9" x2="15" y2="15"/>
                        </svg>
                        Revoke Mandate with Passkey
                      </button>
                    ` : `
                      <div style="color: var(--rose-danger); font-size: 0.78rem; font-weight: 600; text-align: center; width: 100%; padding: 6px 0;">
                        🔒 Mandate Revoked on Monad
                      </div>
                    `}
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        </div>
      </div>
    </div>
  `;

  // Attach chip toggling
  container.querySelectorAll('.selector-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      chip.classList.toggle('active');
    });
  });

  // Attach form submission
  container.querySelector('#form-mandate')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const agentId = container.querySelector('#mandate-agent').value;
    const maxAction = container.querySelector('#mandate-max-action').value;
    const maxTotal = container.querySelector('#mandate-max-total').value;
    const duration = container.querySelector('#mandate-duration').value;

    const targets = Array.from(container.querySelectorAll('input[name="target-option"]:checked')).map(cb => cb.value);
    if (targets.length === 0) {
      alert('Please select at least one permitted target contract.');
      return;
    }

    const selectors = Array.from(container.querySelectorAll('.selector-chip.active')).map(chip => chip.dataset.selector);
    if (selectors.length === 0) {
      alert('Please select at least one permitted function selector.');
      return;
    }

    const submitBtn = container.querySelector('#btn-submit-mandate');
    submitBtn.disabled = true;
    submitBtn.innerHTML = `<span>Signing with Passkey (P256)...</span>`;

    try {
      await engine.createMandate({
        agentId,
        allowedTargets: targets,
        allowedSelectors: selectors,
        maxValuePerAction: maxAction,
        maxTotalValue: maxTotal,
        durationDays: duration,
      });
      renderMandateCenter(container, { onSwitchTab });
    } catch (err) {
      alert('Error creating mandate: ' + err.message);
    } finally {
      submitBtn.disabled = false;
      submitBtn.innerHTML = `<span>Sign & Authorize Mandate with Passkey (P256)</span>`;
    }
  });

  // Attach Revoke actions
  container.querySelectorAll('.btn-revoke').forEach(btn => {
    btn.addEventListener('click', async () => {
      const mandateId = btn.dataset.mandateId;
      if (!confirm('Are you sure you want to revoke this mandate? The agent will immediately be blocked by the Monad contract from executing any further actions.')) {
        return;
      }

      btn.disabled = true;
      btn.textContent = 'Revoking via Passkey...';
      try {
        await engine.revokeMandate(mandateId);
        renderMandateCenter(container, { onSwitchTab });
      } catch (err) {
        alert('Revocation error: ' + err.message);
      }
    });
  });

  // Vault enroll button
  container.querySelector('#btn-vault-enroll')?.addEventListener('click', async () => {
    await passkeyManager.registerPasskey();
    renderMandateCenter(container, { onSwitchTab });
  });
}
