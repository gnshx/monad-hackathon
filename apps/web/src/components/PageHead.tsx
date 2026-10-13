import React from 'react';

export function PageHead({
  eyebrow,
  title,
  sub,
  icon,
  actions,
}: {
  eyebrow?: string;
  title: React.ReactNode;
  sub?: React.ReactNode;
  icon?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <div className="page-head">
      <div>
        {eyebrow && (
          <span className="page-eyebrow">
            {icon}
            {eyebrow}
          </span>
        )}
        <h1 className="page-title">{title}</h1>
        {sub && <p className="page-sub">{sub}</p>}
      </div>
      {actions && <div style={{ display: 'flex', gap: '0.65rem', flexWrap: 'wrap' }}>{actions}</div>}
    </div>
  );
}

export function LegacyNote({ onGo }: { onGo: () => void }) {
  return (
    <div className="legacy-note">
      <span>
        Legacy v1 prototype: these Lab views use the older wallet-owned <code>MandateManager</code>, and several run as
        simulations in your browser. The live passkey product is
      </span>
      <button onClick={onGo}>Passkey Mandates →</button>
    </div>
  );
}
