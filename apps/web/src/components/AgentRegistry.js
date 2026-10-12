/**
 * Agent Registry Component (ERC-8004 First-Class Agent Standard)
 * Displays sovereign AI agent identities registered on Monad.
 */

import { MONAD_CONFIG } from '../lib/monad.js';
import { engine } from '../lib/engine.js';

export function renderAgentRegistry(container, { onSelectAgentForMandate }) {
  const state = engine.getState();

  container.innerHTML = `
    <div style="display: flex; flex-direction: column; gap: 24px;">
      <!-- Registry Header & Stats -->
      <div class="card" style="background: linear-gradient(135deg, rgba(14, 17, 26, 0.9) 0%, rgba(21, 25, 38, 0.7) 100%); border-color: var(--border-highlight);">
        <div class="card-header">
          <div class="card-title-group">
            <h2>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--monad-purple)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <rect x="2" y="3" width="20" height="14" rx="2" ry="2"/>
                <line x1="8" y1="21" x2="16" y2="21"/>
                <line x1="12" y1="17" x2="12" y2="21"/>
              </svg>
              ERC-8004 Trustless Agent Registry
            </h2>
            <p>On-chain agent identity primitives natively registered on Monad Testnet</p>
          </div>

          <div style="display: flex; gap: 10px;">
            <button id="btn-register-agent-modal" class="btn btn-primary btn-sm">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <line x1="12" y1="5" x2="12" y2="19"/>
                <line x1="5" y1="12" x2="19" y2="12"/>
              </svg>
              Register New AI Agent
            </button>
          </div>
        </div>

        <div class="grid-3" style="margin-top: 10px;">
          <div style="background: var(--bg-surface-elevated); padding: 14px; border-radius: var(--radius-md); border: 1px solid var(--border-subtle);">
            <div style="font-size: 0.75rem; color: var(--text-muted); text-transform: uppercase;">Registry Contract</div>
            <div style="font-family: var(--font-mono); font-size: 0.85rem; color: var(--cyan-accent); font-weight: 600;">
              ${MONAD_CONFIG.contracts.erc8004Registry}
            </div>
          </div>
          <div style="background: var(--bg-surface-elevated); padding: 14px; border-radius: var(--radius-md); border: 1px solid var(--border-subtle);">
            <div style="font-size: 0.75rem; color: var(--text-muted); text-transform: uppercase;">Registered Sovereign Agents</div>
            <div style="font-size: 1.25rem; font-weight: 800; color: #ffffff;">
              ${state.agents.length} Active Agents
            </div>
          </div>
          <div style="background: var(--bg-surface-elevated); padding: 14px; border-radius: var(--radius-md); border: 1px solid var(--border-subtle);">
            <div style="font-size: 0.75rem; color: var(--text-muted); text-transform: uppercase;">Contract Violations Intercepted</div>
            <div style="font-size: 1.25rem; font-weight: 800; color: var(--emerald-success);">
              ${state.agents.reduce((sum, a) => sum + a.totalBlocked, 0)} Blocked Safely
            </div>
          </div>
        </div>
      </div>

      <!-- Agent Cards Grid -->
      <div class="grid-3">
        ${state.agents.map(agent => {
          const mandatesForAgent = state.mandates.filter(m => m.agentId === agent.id);
          const activeMandates = mandatesForAgent.filter(m => !m.isRevoked);

          return `
            <div class="card" style="display: flex; flex-direction: column; justify-content: space-between;">
              <div>
                <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 14px;">
                  <div style="width: 44px; height: 44px; border-radius: 12px; background: rgba(131, 110, 249, 0.15); border: 1px solid var(--border-highlight); display: flex; align-items: center; justify-content: center; font-size: 1.2rem;">
                    🤖
                  </div>
                  <span class="badge ${agent.status === 'active' ? 'badge-active' : 'badge-purple'}">
                    ERC-8004 ID #${agent.id}
                  </span>
                </div>

                <h3 style="font-size: 1.05rem; font-weight: 700; color: #ffffff; margin-bottom: 4px;">
                  ${agent.name}
                </h3>
                <p style="font-size: 0.8rem; color: var(--text-muted); margin-bottom: 16px;">
                  ${agent.role}
                </p>

                <div style="display: flex; flex-direction: column; gap: 8px; font-size: 0.78rem; background: var(--bg-surface-elevated); padding: 12px; border-radius: var(--radius-md); border: 1px solid var(--border-subtle); margin-bottom: 16px;">
                  <div>
                    <span style="color: var(--text-dim);">Model Architecture:</span>
                    <strong style="color: #cbd5e1; display: block; font-family: var(--font-mono); font-size: 0.72rem;">${agent.model}</strong>
                  </div>
                  <div>
                    <span style="color: var(--text-dim);">Agent Execution Key:</span>
                    <strong style="color: var(--cyan-accent); display: block; font-family: var(--font-mono); font-size: 0.72rem;">
                      ${agent.publicKey.slice(0, 16)}...${agent.publicKey.slice(-6)}
                    </strong>
                  </div>
                  <div>
                    <span style="color: var(--text-dim);">ERC-8004 Metadata CID:</span>
                    <strong style="color: #cbd5e1; display: block; font-family: var(--font-mono); font-size: 0.72rem;">
                      ${agent.metadataURI.slice(0, 26)}...
                    </strong>
                  </div>
                </div>

                <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; text-align: center; font-size: 0.75rem; margin-bottom: 16px;">
                  <div style="background: #050609; padding: 8px 4px; border-radius: var(--radius-sm);">
                    <div style="color: var(--text-muted); font-size: 0.68rem;">EXECUTED</div>
                    <strong style="color: #ffffff;">${agent.totalExecuted}</strong>
                  </div>
                  <div style="background: #050609; padding: 8px 4px; border-radius: var(--radius-sm);">
                    <div style="color: var(--text-muted); font-size: 0.68rem;">BLOCKED</div>
                    <strong style="color: var(--rose-danger);">${agent.totalBlocked}</strong>
                  </div>
                  <div style="background: #050609; padding: 8px 4px; border-radius: var(--radius-sm);">
                    <div style="color: var(--text-muted); font-size: 0.68rem;">REPUTATION</div>
                    <strong style="color: var(--emerald-success);">${agent.reputationScore}%</strong>
                  </div>
                </div>
              </div>

              <div>
                <button class="btn btn-secondary btn-sm btn-create-mandate-agent" data-agent-id="${agent.id}" style="width: 100%;">
                  <span>Authorize Mandate for Agent #${agent.id}</span>
                </button>
              </div>
            </div>
          `;
        }).join('')}
      </div>
    </div>
  `;

  // Attach buttons
  container.querySelectorAll('.btn-create-mandate-agent').forEach(btn => {
    btn.addEventListener('click', () => {
      onSelectAgentForMandate(btn.dataset.agentId);
    });
  });

  container.querySelector('#btn-register-agent-modal')?.addEventListener('click', () => {
    const name = prompt('Enter AI Agent Name:');
    if (!name) return;
    const model = prompt('Enter Model Architecture (e.g. Anthropic Claude 3.5 Sonnet / Llama 3 70B):', 'Anthropic Claude 3.5 Sonnet');
    
    const newId = state.agents.length + 1;
    const newAgent = {
      id: newId,
      name,
      role: 'Custom Autonomous Agent',
      model: model || 'Custom Agent',
      publicKey: '0x' + Array.from(crypto.getRandomValues(new Uint8Array(20))).map(b => b.toString(16).padStart(2, '0')).join(''),
      metadataURI: `ipfs://bafybeig${Math.random().toString(36).substring(2, 12)}/agent.json`,
      reputationScore: 100.0,
      totalExecuted: 0,
      totalBlocked: 0,
      status: 'active',
    };

    state.agents.push(newAgent);
    engine.notify();
    renderAgentRegistry(container, { onSelectAgentForMandate });
  });
}
