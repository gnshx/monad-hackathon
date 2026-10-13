import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'AgentTrust · Passkey mandates for AI agents on Monad',
  description:
    'Give your AI agent a budget, not your keys. Passkey-signed spending mandates, verified by the Monad P-256 precompile, bound to ERC-8004 agent identities and enforced on-chain.',
  icons: { icon: '/logo.jpg' },
  openGraph: {
    title: 'AgentTrust: give your AI agent a budget, not your keys',
    description: 'Passkey-signed, on-chain spending mandates for AI agents on Monad.',
    images: ['/logo.jpg'],
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
