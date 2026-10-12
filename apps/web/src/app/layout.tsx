import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'AgentTrust — Passkey-Authorized, On-Chain Permissions for AI Agents',
  description:
    'Authorize AI agents using hardware WebAuthn passkeys with strict spending limits and target contracts enforced directly by Monad smart contracts.',
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
