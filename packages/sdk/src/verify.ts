import {
  type Address,
  type Hex,
  type PublicClient,
  decodeEventLog,
} from 'viem';
import { MandateManagerABI } from './abi.js';
import { getMandate, getAllowedTargets } from './mandate.js';
import type {
  ExecutionReceiptVerification,
  VerificationResult,
} from './types.js';

/**
 * Independently pre-validates whether an intended action satisfies all on-chain
 * permissions and spending constraints of a mandate before broadcasting.
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

  return {
    valid: true,
    mandate,
    allowedTargets: targets,
    remainingBudget,
  };
}

/**
 * Independently verifies an execution transaction receipt directly against the blockchain.
 * Decodes the on-chain ActionExecuted receipt event to prove authorization and execution.
 */
export async function verifyReceipt(
  publicClient: PublicClient,
  contractAddress: Address,
  transactionHash: Hex
): Promise<ExecutionReceiptVerification> {
  const receipt = await publicClient.waitForTransactionReceipt({ hash: transactionHash });

  if (receipt.status === 'reverted') {
    return {
      verified: false,
      status: 'reverted',
      transactionHash,
      blockNumber: receipt.blockNumber,
      revertReason: 'Transaction reverted on-chain',
    };
  }

  const contractAddressLower = contractAddress.toLowerCase();

  // Search logs for the ActionExecuted event from the MandateManager contract
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
