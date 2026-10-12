/**
 * Judge Demo Tour Component
 * Implements the required 5-step compelling narrative for hackathon judges:
 * 1. Authorize: user creates a mandate with passkey
 * 2. Succeed: agent performs allowed action, transaction succeeds on Monad Testnet
 * 3. Reject: agent attempts forbidden/over-limit action, contract reverts
 * 4. Revoke: owner revokes mandate, subsequent execution fails
 * 5. Verify independently: separate client verifies state without AgentTrust backend
 */

export function renderTourBanner(container, { currentStep, onNextStep, onCloseTour, onJumpStep }) {
  const steps = [
    { num: 1, title: 'Authorize Mandate', desc: 'Create mandate with Passkey (P256)' },
    { num: 2, title: 'Succeed', desc: 'Agent executes permitted DEX swap' },
    { num: 3, title: 'Reject', desc: 'Forbidden target reverts on Monad' },
    { num: 4, title: 'Revoke', desc: 'Owner revokes; agent blocked' },
    { num: 5, title: 'Verify Independently', desc: 'Zero-trust verification without server' }
  ];

  const current = steps[currentStep - 1] || steps[0];

  container.innerHTML = `
    <div class="tour-banner">
      <div style="flex: 1;">
        <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 6px;">
          <span class="badge badge-purple">Judge Walkthrough Mode</span>
          <strong style="color: #ffffff; font-size: 0.95rem;">Step ${current.num} of 5: ${current.title}</strong>
        </div>
        <p style="font-size: 0.82rem; color: #cbd5e1; margin-bottom: 10px;">
          ${current.desc}
        </p>

        <div class="tour-steps">
          ${steps.map(s => {
            const isDone = s.num < currentStep;
            const isActive = s.num === currentStep;
            return `
              <div class="tour-step-pill ${isActive ? 'active' : isDone ? 'done' : ''}" data-step="${s.num}" style="cursor: pointer;">
                <span>${isDone ? '✓' : s.num}.</span>
                <span>${s.title}</span>
              </div>
            `;
          }).join('')}
        </div>
      </div>

      <div style="display: flex; gap: 10px; align-items: center;">
        <button id="btn-tour-action" class="btn btn-cyan btn-sm">
          <span>${currentStep === 5 ? 'Finish Tour' : 'Proceed to Step ' + (currentStep + 1) + ' ▶'}</span>
        </button>
        <button id="btn-tour-close" class="btn btn-secondary btn-sm" title="Close Tour">
          ✕
        </button>
      </div>
    </div>
  `;

  container.querySelectorAll('.tour-step-pill').forEach(pill => {
    pill.addEventListener('click', () => {
      onJumpStep(Number(pill.dataset.step));
    });
  });

  container.querySelector('#btn-tour-action')?.addEventListener('click', onNextStep);
  container.querySelector('#btn-tour-close')?.addEventListener('click', onCloseTour);
}
