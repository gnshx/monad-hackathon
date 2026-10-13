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
        Lab view: these tools use the v1 wallet-owned <code>MandateManager</code>. The passkey-native product is{' '}
      </span>
      <button onClick={onGo}>Passkey Mandates →</button>
    </div>
  );
}
