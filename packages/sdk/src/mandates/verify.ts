import { decodeEventLog, type Address, type Hex, type PublicClient } from 'viem';
import { AgentMandatesABI } from './abi.js';
import type { ReceiptVerificationStatus } from '../types.js';

export interface VerifyMandatesReceiptOptions {
  /** Fail with status 'wrong_network' if the RPC is on another chain. */
  expectedChainId?: number;
  /** Only accept an event for this mandate. */
  expectedMandateId?: bigint;
}

export interface MandatesReceiptVerification {
  verified: boolean;
  status: ReceiptVerificationStatus;
  /** 'action' for execute() (ActionExecuted), 'tokenPayment' for payToken() (TokenPaid). */
  kind?: 'action' | 'tokenPayment';
  mandateId?: bigint;
  /** action: the agent that called execute(). */
  agent?: Address;
  /** action: the contract or address called. */
  target?: Address;
  /** action: 4-byte selector of the call (0x00000000 for a plain transfer). */
  selector?: Hex;
  /** action: native MON sent, in wei. */
  value?: bigint;
  /** action: keccak256 of the calldata. */
  callDataHash?: Hex;
  /** tokenPayment: the ERC-20 paid out. */
  token?: Address;
  /** tokenPayment: the payee. */
  to?: Address;
  /** tokenPayment: amount in the token's base units. */
  amount?: bigint;
  /** The mandate's cumulative spend after this transaction (wei for actions, token base units for payments). */
  spent?: bigint;
  transactionHash: Hex;
  blockNumber: bigint;
  gasUsed?: bigint;
  revertReason?: string;
  logs?: readonly unknown[];
}

/**
 * Verify a transaction against an AgentMandates (v2) contract: it succeeded and that contract
 * emitted ActionExecuted (execute) or TokenPaid (payToken), optionally for a given mandate.
 * For the v1 MandateManager use verifyReceipt().
 */
export async function verifyMandatesReceipt(
  publicClient: PublicClient,
  contractAddress: Address,
  transactionHash: Hex,
  options: VerifyMandatesReceiptOptions = {}
): Promise<MandatesReceiptVerification> {
  const fail = (status: ReceiptVerificationStatus, revertReason: string): MandatesReceiptVerification => ({
    verified: false, status, transactionHash, blockNumber: 0n, revertReason,
  });

  if (options.expectedChainId !== undefined) {
    try {
      const live = await publicClient.getChainId();
      if (live !== options.expectedChainId) {
        return fail('wrong_network', `Chain ID mismatch: RPC returned ${live}, expected ${options.expectedChainId}`);
      }
    } catch (err: any) {
      return fail('rpc_error', `Failed to query chain ID: ${err?.message ?? String(err)}`);
    }
  }

  let receipt: any;
  try {
    receipt = await publicClient.waitForTransactionReceipt({ hash: transactionHash, timeout: 10_000 });
  } catch (err: any) {
    receipt = err?.receipt ?? (await publicClient.getTransactionReceipt({ hash: transactionHash }).catch(() => undefined));
    if (!receipt) {
      const msg = err?.message ?? String(err);
      return /not found|could not find|timeout|timed out|unknown transaction/i.test(msg)
        ? fail('not_found', `Transaction receipt not found on chain: ${msg}`)
        : fail('rpc_error', `RPC error while querying receipt: ${msg}`);
    }
  }

  const base = {
    transactionHash,
    blockNumber: receipt.blockNumber as bigint,
    gasUsed: receipt.gasUsed as bigint | undefined,
    logs: receipt.logs as readonly unknown[],
  };

  if (receipt.status !== 'success') {
    return {
      ...base,
      verified: false,
      status: 'reverted',
      revertReason: 'Transaction reverted on-chain: no ActionExecuted or TokenPaid event was emitted',
    };
  }

  const contract = contractAddress.toLowerCase();
  let otherMandate: bigint | undefined;
  for (const log of receipt.logs as { address: Address; data: Hex; topics: [Hex, ...Hex[]] }[]) {
    if (log.address?.toLowerCase() !== contract) continue;
    let decoded;
    try {
      decoded = decodeEventLog({ abi: AgentMandatesABI, data: log.data, topics: log.topics });
    } catch {
      continue;
    }
    let found: Omit<MandatesReceiptVerification, keyof typeof base | 'verified' | 'status'> | undefined;
    if (decoded.eventName === 'ActionExecuted') {
      const a = decoded.args;
      found = {
        kind: 'action', mandateId: a.mandateId, agent: a.agent, target: a.target,
        selector: a.selector, value: a.value, spent: a.spent, callDataHash: a.callDataHash,
      };
    } else if (decoded.eventName === 'TokenPaid') {
      const a = decoded.args;
      found = { kind: 'tokenPayment', mandateId: a.mandateId, token: a.token, to: a.to, amount: a.amount, spent: a.spent };
    }
    if (!found) continue;
    if (options.expectedMandateId !== undefined && found.mandateId !== options.expectedMandateId) {
      otherMandate ??= found.mandateId;
      continue;
    }
    return { ...base, ...found, verified: true, status: 'success' };
  }

  return {
    ...base,
    verified: false,
    status: 'success',
    ...(otherMandate !== undefined ? { mandateId: otherMandate } : {}),
    revertReason:
      otherMandate !== undefined
        ? `Receipt emitted for Mandate #${otherMandate}, expected #${options.expectedMandateId}`
        : `Transaction succeeded but AgentMandates at ${contractAddress} emitted no ActionExecuted or TokenPaid event`,
  };
}
