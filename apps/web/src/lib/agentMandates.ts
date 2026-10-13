import { createPublicClient, defineChain, http, type Address, type PublicClient } from 'viem';
import { AgentMandates } from '@agenttrust/sdk';
import { MONAD_TESTNET_CONFIG } from './contracts';

export const DEFAULT_AGENT_MANDATES_ADDRESS: Address = '0xc911e902bf3b3f532bffc1a988e2d00969a1237c';

/** AgentMandates deployment the console talks to. Set after running `npm run e2e -- --testnet`. */
export const AGENT_MANDATES_ADDRESS = ((process.env.NEXT_PUBLIC_AGENT_MANDATES_ADDRESS as Address) ||
  DEFAULT_AGENT_MANDATES_ADDRESS) as Address;

export const RPC_URL = process.env.NEXT_PUBLIC_MONAD_RPC_URL || MONAD_TESTNET_CONFIG.rpcUrls.default.http[0];
export const EXPLORER = MONAD_TESTNET_CONFIG.blockExplorers.default.url;

export const monadTestnet = defineChain({
  id: MONAD_TESTNET_CONFIG.id,
  name: MONAD_TESTNET_CONFIG.name,
  nativeCurrency: MONAD_TESTNET_CONFIG.nativeCurrency,
  rpcUrls: { default: { http: [RPC_URL] } },
  blockExplorers: MONAD_TESTNET_CONFIG.blockExplorers,
  // Monad blocks land about every 0.4 s; without this viem assumes 12 s blocks and polls every 4 s.
  blockTime: 400,
});

/** Receipt polling interval: owner actions confirm in about a second instead of waiting on a 4 s poll. */
export const RECEIPT_POLL_MS = 1_000;

export function publicClient(): PublicClient {
  return createPublicClient({ chain: monadTestnet, transport: http(RPC_URL), pollingInterval: RECEIPT_POLL_MS }) as PublicClient;
}

export function mandatesClient(): AgentMandates | null {
  return AGENT_MANDATES_ADDRESS ? new AgentMandates(AGENT_MANDATES_ADDRESS, publicClient()) : null;
}
