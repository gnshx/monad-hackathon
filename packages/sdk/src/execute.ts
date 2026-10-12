import {
  type Address,
  type Hex,
  type PublicClient,
  type WalletClient,
  decodeEventLog,
} from 'viem';
import { MandateManagerABI } from './abi.js';
import type { ExecuteActionParams } from './types.js';
import { ExecutionFailedError } from './errors.js';

export interface ExecuteResult {
  transactionHash: Hex;
  blockNumber: bigint;
  returnData: Hex;
  success: boolean;
}

/**
 * Executes an action on-chain under the authority of an active mandate.
 */
export async function executeAction(
  walletClient: WalletClient,
  publicClient: PublicClient,
  contractAddress: Address,
  params: ExecuteActionParams
): Promise<ExecuteResult> {
  const [account] = await walletClient.getAddresses();
  if (!account) throw new Error('No account available in WalletClient');

  // If execNonce is not provided, query the contract for the next expected nonce
  const execNonce =
    params.execNonce ??
    (await publicClient.readContract({
      address: contractAddress,
      abi: MandateManagerABI,
      functionName: 'executionNonces',
      args: [params.mandateId],
    }));

  try {
    const hash = await walletClient.writeContract({
      account,
      chain: walletClient.chain,
      address: contractAddress,
      abi: MandateManagerABI,
      functionName: 'execute',
      args: [
        params.mandateId,
        params.agentId,
        params.target,
        params.selector,
        params.callData,
        params.value,
        execNonce,
      ],
    });

    const receipt = await publicClient.waitForTransactionReceipt({ hash });

    if (receipt.status === 'reverted') {
      throw new ExecutionFailedError(`Transaction reverted: ${hash}`);
    }

    // Parse ActionExecuted event to retrieve returnData
    let returnData: Hex = '0x';
    for (const log of receipt.logs) {
      try {
        const decoded = decodeEventLog({
          abi: MandateManagerABI,
          data: log.data,
          topics: log.topics,
        });

        if (decoded.eventName === 'ActionExecuted') {
          returnData = decoded.args.returnData;
          break;
        }
      } catch {
        // Not an ActionExecuted log
      }
    }

    return {
      transactionHash: hash,
      blockNumber: receipt.blockNumber,
      returnData,
      success: true,
    };
  } catch (error: any) {
    if (error instanceof ExecutionFailedError) throw error;
    throw new ExecutionFailedError(
      `Execution failed on Mandate ${params.mandateId.toString()}: ${error.message || String(error)}`,
      error.data
    );
  }
}
