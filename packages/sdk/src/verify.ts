import {
  type Address,
  type Hex,
  type PublicClient,
  decodeEventLog,
} from 'viem';
import { MandateManagerABI } from './abi.js';
import { getMandate, getAllowedTargets, getMandateBalance } from './mandate.js';
import type {
  ExecutionReceiptVerification,
  VerificationResult,
  VerifyReceiptOptions,
} from './types.js';

/**
 * Advisory pre-check verifying whether an intended action satisfies all on-chain
 * permissions and spending constraints of a mandate before broadcasting.
 * Note: Contract execution on Monad remains the authoritative enforcement boundary.
 */
export async function verifyActionPreflight(
  publicClient: PublicClient,
  contractAddress: Address,
  mandateId: bigint,
  action: {
    agentId: bigint;
    target: Address;
    selector: Hex;
    value: bigint;
  }
): Promise<VerificationResult> {
  const mandate = await getMandate(publicClient, contractAddress, mandateId);

  if (mandate.owner === '0x0000000000000000000000000000000000000000') {
    return { valid: false, reason: 'Mandate does not exist' };
  }

  if (mandate.revoked) {
    return { valid: false, reason: 'Mandate has been revoked by owner' };
  }

  // Check expiry against latest block timestamp
  const block = await publicClient.getBlock();
  if (mandate.expiresAt !== 0n && block.timestamp > mandate.expiresAt) {
    return {
      valid: false,
      reason: `Mandate expired at ${mandate.expiresAt} (current block time: ${block.timestamp})`,
    };
  }

  if (mandate.agentId !== action.agentId) {
    return {
      valid: false,
      reason: `Agent ID mismatch: authorized for ${mandate.agentId}, requested by ${action.agentId}`,
    };
  }

  // Check spending constraints
  if (action.value > mandate.maxValuePerTx) {
    return {
      valid: false,
      reason: `Value ${action.value} exceeds per-action cap ${mandate.maxValuePerTx}`,
    };
  }

  const remainingBudget =
    mandate.maxTotalValue >= mandate.spentValue
      ? mandate.maxTotalValue - mandate.spentValue
      : 0n;

  if (action.value > remainingBudget) {
    return {
      valid: false,
      reason: `Value ${action.value} exceeds remaining cumulative budget ${remainingBudget}`,
      remainingBudget,
    };
  }

  // Check target and selector allowlist
  const targets = await getAllowedTargets(publicClient, contractAddress, mandateId);
  const targetLower = action.target.toLowerCase();
  const selectorLower = action.selector.toLowerCase();

  const isAllowed = targets.some((t) => {
    const isTargetMatch = t.target.toLowerCase() === targetLower;
    const isSelectorMatch =
      t.selector === '0x00000000' || t.selector.toLowerCase() === selectorLower;
    return isTargetMatch && isSelectorMatch;
  });

  if (!isAllowed) {
    return {
      valid: false,
      reason: `Target ${action.target} or selector ${action.selector} is not allowlisted`,
      mandate,
      allowedTargets: targets,
      remainingBudget,
    };
  }

  // Query isolated mandate vault balance
  let mandateBalance = 0n;
  try {
    mandateBalance = await getMandateBalance(publicClient, contractAddress, mandateId);
  } catch {
    // If balance reading fails, omit
  }

  return {
    valid: true,
    mandate,
    allowedTargets: targets,
    remainingBudget,
    mandateBalance,
  };
}

/**
 * Independently verifies an execution transaction receipt directly against the blockchain.
 * Decodes the on-chain ActionExecuted receipt event to prove authorization and execution.
 * Confirms contract address, event signature, and optional expected mandate / target fields.
 */
export async function verifyReceipt(
  publicClient: PublicClient,
  contractAddress: Address,
  transactionHash: Hex,
  options?: VerifyReceiptOptions
): Promise<ExecutionReceiptVerification> {
  let receipt;
  try {
    receipt = await publicClient.waitForTransactionReceipt({ hash: transactionHash });
  } catch (err: any) {
    return {
      verified: false,
      status: 'reverted',
      transactionHash,
      blockNumber: 0n,
      revertReason: `Failed to query transaction receipt: ${err.message || String(err)}`,
    };
  }

  if (receipt.status === 'reverted') {
    return {
      verified: false,
      status: 'reverted',
      transactionHash,
      blockNumber: receipt.blockNumber,
      revertReason: 'Transaction reverted on-chain (contract policy rejected execution)',
    };
  }

  const contractAddressLower = contractAddress.toLowerCase();

  // Search logs strictly for ActionExecuted event emitted by MandateManager contract
  for (const log of receipt.logs) {
    if (log.address.toLowerCase() !== contractAddressLower) continue;

    try {
      const decoded = decodeEventLog({
        abi: MandateManagerABI,
        data: log.data,
        topics: log.topics,
      });

      if (decoded.eventName === 'ActionExecuted') {
        const { mandateId, target, selector, value, returnData } = decoded.args;

        // Verify optional expectations if provided
        if (options?.expectedMandateId !== undefined && mandateId !== options.expectedMandateId) {
          return {
            verified: false,
            status: 'success',
            mandateId,
            target,
            selector: selector as Hex,
            value,
            returnData,
            transactionHash,
            blockNumber: receipt.blockNumber,
            revertReason: `Receipt emitted for Mandate #${mandateId.toString()}, expected #${options.expectedMandateId.toString()}`,
          };
        }

        if (
          options?.expectedTarget !== undefined &&
          target.toLowerCase() !== options.expectedTarget.toLowerCase()
        ) {
          return {
            verified: false,
            status: 'success',
            mandateId,
            target,
            selector: selector as Hex,
            value,
            returnData,
            transactionHash,
            blockNumber: receipt.blockNumber,
            revertReason: `Receipt target ${target} does not match expected ${options.expectedTarget}`,
          };
        }

        if (
          options?.expectedSelector !== undefined &&
          (selector as Hex).toLowerCase() !== options.expectedSelector.toLowerCase()
        ) {
          return {
            verified: false,
            status: 'success',
            mandateId,
            target,
            selector: selector as Hex,
            value,
            returnData,
            transactionHash,
            blockNumber: receipt.blockNumber,
            revertReason: `Receipt selector ${selector} does not match expected ${options.expectedSelector}`,
          };
        }

        return {
          verified: true,
          status: 'success',
          mandateId,
          target,
          selector: selector as Hex,
          value,
          returnData,
          transactionHash,
          blockNumber: receipt.blockNumber,
        };
      }
    } catch {
      // Ignore logs that don't match ActionExecuted
    }
  }

  return {
    verified: false,
    status: 'success',
    transactionHash,
    blockNumber: receipt.blockNumber,
    revertReason: 'Transaction succeeded but no ActionExecuted event was emitted by MandateManager',
  };
}
