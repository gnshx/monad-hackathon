/**
 * AgentTrust Root Application Controller
 */

import { engine } from './lib/engine.js';
import { passkeyManager } from './lib/passkey.js';
import { renderHeader } from './components/Header.js';
import { renderMandateCenter } from './components/MandateCenter.js';
import { renderAgentRegistry } from './components/AgentRegistry.js';
import { renderExecutionConsole } from './components/ExecutionConsole.js';
import { renderZeroTrustVerifier } from './components/ZeroTrustVerifier.js';
import { renderDeveloperHub } from './components/DeveloperHub.js';
import { renderTourBanner } from './components/TourModal.js';

class App {
  constructor() {
    this.currentTab = 'mandates';
    this.isTourActive = false;
    this.tourStep = 1;
    this.selectedVerifierHash = null;

    this.headerContainer = document.getElementById('header-root');
    this.tourContainer = document.getElementById('tour-root');
    this.mainContainer = document.getElementById('main-root');
    this.navContainer = document.getElementById('nav-root');

    this.init();
  }

  init() {
    this.renderNavigation();
    this.renderHeader();
    this.renderTabContent();

    // Subscribe to engine state changes
    engine.subscribe(() => {
      this.renderHeader();
      this.renderNavigation();
      this.renderTabContent();
    });

    // Auto-enroll a passkey on initial load if none exists so the demo is ready instantly
    if (!passkeyManager.currentCredential) {
      passkeyManager.registerPasskey('monad.sovereign@agenttrust.xyz').then(() => {
        this.renderHeader();
        this.renderTabContent();
      });
    }
  }

  renderNavigation() {
    const state = engine.getState();
    const activeMandateCount = state.mandates.filter(m => !m.isRevoked).length;

    this.navContainer.innerHTML = `
      <nav class="nav-tabs">
        <button class="tab-btn ${this.currentTab === 'mandates' ? 'active' : ''}" data-tab="mandates">
          <span>📜 Mandates & Passkeys</span>
          <span class="badge-counter">${activeMandateCount}</span>
        </button>
        <button class="tab-btn ${this.currentTab === 'agents' ? 'active' : ''}" data-tab="agents">
          <span>🤖 Agent Registry (ERC-8004)</span>
          <span class="badge-counter">${state.agents.length}</span>
        </button>
        <button class="tab-btn ${this.currentTab === 'execution' ? 'active' : ''}" data-tab="execution">
          <span>⚡ Security Proof Sandbox</span>
          <span class="badge-counter" style="background: rgba(16, 185, 129, 0.2); color: #6ee7b7;">Live</span>
        </button>
        <button class="tab-btn ${this.currentTab === 'verifier' ? 'active' : ''}" data-tab="verifier">
          <span>🛡️ Zero-Trust Verifier</span>
        </button>
        <button class="tab-btn ${this.currentTab === 'developer' ? 'active' : ''}" data-tab="developer">
          <span>💻 Developer Hub & SDK</span>
        </button>
      </nav>
    `;

    this.navContainer.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        this.switchTab(btn.dataset.tab);
      });
    });
  }

  renderHeader() {
    renderHeader(this.headerContainer, {
      onStartTour: () => this.startTour(),
      onConnectPasskey: async () => {
        await passkeyManager.registerPasskey();
        this.renderHeader();
        this.renderTabContent();
      }
    });
  }

  switchTab(tabId, extraData = {}) {
    this.currentTab = tabId;
    if (extraData.hash) {
      this.selectedVerifierHash = extraData.hash;
    }
    this.renderNavigation();
    this.renderTabContent();
  }

  renderTabContent() {
    if (this.isTourActive) {
      this.tourContainer.style.display = 'block';
      renderTourBanner(this.tourContainer, {
        currentStep: this.tourStep,
        onNextStep: () => this.nextTourStep(),
        onCloseTour: () => this.closeTour(),
        onJumpStep: (step) => {
          this.tourStep = step;
          this.applyTourStep();
        }
      });
    } else {
      this.tourContainer.style.display = 'none';
      this.tourContainer.innerHTML = '';
    }

    switch (this.currentTab) {
      case 'mandates':
        renderMandateCenter(this.mainContainer, {
          onSwitchTab: (tab) => this.switchTab(tab),
        });
        break;

      case 'agents':
        renderAgentRegistry(this.mainContainer, {
          onSelectAgentForMandate: (agentId) => {
            this.switchTab('mandates');
            const selectEl = document.getElementById('mandate-agent');
            if (selectEl) selectEl.value = agentId;
          }
        });
        break;

      case 'execution':
        renderExecutionConsole(this.mainContainer, {
          onVerifyReceipt: (hash) => {
            this.switchTab('verifier', { hash });
          }
        });
        break;

      case 'verifier':
        renderZeroTrustVerifier(this.mainContainer, {
          selectedHash: this.selectedVerifierHash,
        });
        break;

      case 'developer':
        renderDeveloperHub(this.mainContainer);
        break;

      default:
        break;
    }
  }

  startTour() {
    this.isTourActive = true;
    this.tourStep = 1;
    this.applyTourStep();
  }

  closeTour() {
    this.isTourActive = false;
    this.renderTabContent();
  }

  nextTourStep() {
    if (this.tourStep >= 5) {
      this.closeTour();
      return;
    }
    this.tourStep += 1;
    this.applyTourStep();
  }

  applyTourStep() {
    // Step 1: Authorize Mandate (Mandates tab)
    if (this.tourStep === 1) {
      this.currentTab = 'mandates';
    }
    // Step 2: Succeed (Execution tab -> run allowed action)
    else if (this.tourStep === 2) {
      this.currentTab = 'execution';
      setTimeout(() => {
        document.getElementById('btn-scenario-allowed')?.click();
      }, 200);
    }
    // Step 3: Reject (Execution tab -> run forbidden action)
    else if (this.tourStep === 3) {
      this.currentTab = 'execution';
      setTimeout(() => {
        document.getElementById('btn-scenario-bad-target')?.click();
      }, 200);
    }
    // Step 4: Revoke (Execution tab -> run revoke failure)
    else if (this.tourStep === 4) {
      this.currentTab = 'execution';
      setTimeout(() => {
        document.getElementById('btn-scenario-revoke-fail')?.click();
      }, 200);
    }
    // Step 5: Verify Independently (Verifier tab)
    else if (this.tourStep === 5) {
      const state = engine.getState();
      const latestHash = state.actionHistory[0]?.actionHash;
      this.currentTab = 'verifier';
      this.selectedVerifierHash = latestHash;
    }

    this.renderNavigation();
    this.renderTabContent();
  }
}

// Bootstrap
document.addEventListener('DOMContentLoaded', () => {
  new App();
});
