import type { Address, Hex, PublicClient, WalletClient } from 'viem';
import { verifyActionPreflight, verifyReceipt } from './verify.js';
import { executeAction, type ExecuteResult } from './execute.js';
import type { ExecutionReceiptVerification } from './types.js';

export interface GuardOptions {
  mandateId: bigint;
  agentId: bigint;
  contractAddress: Address;
  publicClient: PublicClient;
  walletClient: WalletClient;
}

export interface GuardedExecutionResult extends ExecuteResult {
  receipt: ExecutionReceiptVerification;
}

/**
 * 15-Minute Drop-in Security Middleware for any AI Agent or Tool Server on Monad.
 * Protects agent tool calls by preflighting on-chain constraints, executing
 * strictly through the MandateManager boundary, and independently verifying the receipt.
 */
export function createAgentGuard(options: GuardOptions) {
  return {
    /**
     * Executes an action through the protected MandateManager boundary.
     * Reverts fail-closed if spend limits, target allowlists, or caller checks fail.
     */
    async execute(action: {
      target: Address;
      selector: Hex;
      callData: Hex;
      value: bigint;
    }): Promise<GuardedExecutionResult> {
      // 1. Preflight on-chain invariants before broadcasting
      const preflight = await verifyActionPreflight(
        options.publicClient,
        options.contractAddress,
        options.mandateId,
        {
          agentId: options.agentId,
          target: action.target,
          selector: action.selector,
          value: action.value,
        }
      );

      if (!preflight.valid) {
        throw new Error(`[AgentTrust Guard] Preflight rejection: ${preflight.reason}`);
      }

      // 2. Execute on-chain
      const execResult = await executeAction(
        options.walletClient,
        options.publicClient,
        options.contractAddress,
        {
          mandateId: options.mandateId,
          agentId: options.agentId,
          ...action,
        }
      );

      // 3. Verify receipt
      const receipt = await verifyReceipt(
        options.publicClient,
        options.contractAddress,
        execResult.transactionHash,
        {
          expectedMandateId: options.mandateId,
          expectedTarget: action.target,
          expectedSelector: action.selector,
          expectedValue: action.value,
        }
      );

      return {
        ...execResult,
        receipt,
      };
    },
  };
}
