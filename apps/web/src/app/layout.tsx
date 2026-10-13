import type { Metadata, Viewport } from 'next';
import './globals.css';

export const viewport: Viewport = { themeColor: '#08070E', colorScheme: 'dark' };

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || 'https://monad-hackathon-amber.vercel.app'),
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
