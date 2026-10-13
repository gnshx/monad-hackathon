import { describe, expect, it, vi } from 'vitest';
import {
  EstimateGasExecutionError,
  ExecutionRevertedError,
  HttpRequestError,
  RpcRequestError,
  TimeoutError,
  encodeAbiParameters,
  encodeErrorResult,
  encodeEventTopics,
  keccak256,
  parseAbiParameters,
  type Address,
  type Hex,
} from 'viem';
import {
  AgentMandates,
  AgentMandatesABI,
  MANDATE_ERRORS,
  MandateCallFailedError,
  MandateDeniedError,
  decodeMandateRevert,
  mandateTools,
  verifyMandatesReceipt,
} from '../src/mandates/index.js';
import { MandateManagerABI } from '../src/abi.js';

const CONTRACT = '0x1111111111111111111111111111111111111111' as Address;
const AGENT = '0x2222222222222222222222222222222222222222' as Address;
const TARGET = '0x3333333333333333333333333333333333333333' as Address;
const TOKEN = '0x5555555555555555555555555555555555555555' as Address;
const PAYEE = '0x6666666666666666666666666666666666666666' as Address;
const TX = `0x${'ab'.repeat(32)}` as Hex;

const mandateError = (errorName: string, args?: readonly unknown[]) =>
  encodeErrorResult({ abi: AgentMandatesABI, errorName: errorName as any, args: args as any });

/** What viem's estimateGas throws when the node says the call reverts. */
const revertError = (data?: Hex) =>
  new EstimateGasExecutionError(
    new ExecutionRevertedError({
      cause: new RpcRequestError({ body: {}, url: 'http://rpc', error: { code: 3, message: 'execution reverted', data } }),
      message: 'execution reverted',
    }),
    {} as any
  );

/** What viem's estimateGas throws when the RPC itself fails. */
const transportError = () =>
  new EstimateGasExecutionError(
    new HttpRequestError({ url: 'http://rpc', status: 429, details: 'Too Many Requests' }),
    {} as any
  );

function setup(opts: {
  estimateGas?: (args: any) => Promise<bigint>;
  readContract?: (args: any) => Promise<any>;
  receiptStatus?: (hash: Hex) => 'success' | 'reverted';
} = {}) {
  const publicClient: any = {
    getChainId: async () => 10143,
    estimateGas: vi.fn(opts.estimateGas ?? (async () => 100_000n)),
    readContract: vi.fn(
      opts.readContract ??
        (async ({ functionName }: any) => {
          if (functionName === 'checkAction' || functionName === 'checkPayment') return [true, '0x00000000'];
          throw new Error(`unexpected read ${functionName}`);
        })
    ),
    waitForTransactionReceipt: vi.fn(async ({ hash }: any) => ({ status: opts.receiptStatus?.(hash) ?? 'success' })),
  };
  let n = 0;
  const nextHash = () => `0x${(++n).toString(16).padStart(64, '0')}` as Hex;
  const walletClient: any = {
    account: { address: AGENT },
    chain: { id: 10143 },
    writeContract: vi.fn(async () => nextHash()),
    sendTransaction: vi.fn(async () => nextHash()),
  };
  return { publicClient, walletClient, mandates: new AgentMandates(CONTRACT, publicClient, walletClient) };
}

describe('MANDATE_ERRORS', () => {
  it('keys every error by the selector of its full signature', () => {
    for (const e of AgentMandatesABI.filter((x) => x.type === 'error')) {
      const data = mandateError(e.name, e.inputs.length ? ['0x'] : undefined);
      expect(MANDATE_ERRORS[data.slice(0, 10)]).toBe(e.name);
    }
  });

  it('maps CallFailed(bytes) from 0xa5fa8d2b, not the v1 CallFailed() selector', () => {
    expect(MANDATE_ERRORS['0xa5fa8d2b']).toBe('CallFailed');
    expect(MANDATE_ERRORS['0x3204506f']).toBeUndefined();
  });
});

describe('decodeMandateRevert', () => {
  it('maps policy errors to MandateDeniedError and CallFailed to MandateCallFailedError', () => {
    const denied = decodeMandateRevert(mandateError('ExceedsBudget'));
    expect(denied).toBeInstanceOf(MandateDeniedError);
    expect((denied as MandateDeniedError).reason).toBe('ExceedsBudget');

    const inner = encodeErrorResult({
      abi: [{ type: 'error', name: 'Error', inputs: [{ type: 'string', name: 'message' }] }],
      errorName: 'Error',
      args: ['too poor'],
    });
    const failed = decodeMandateRevert(mandateError('CallFailed', [inner]));
    expect(failed).toBeInstanceOf(MandateCallFailedError);
    expect((failed as MandateCallFailedError).returnData).toBe(inner);
    expect((failed as MandateCallFailedError).targetReason).toBe('too poor');
  });

  it('returns undefined for data that is not an AgentMandates error', () => {
    expect(decodeMandateRevert(undefined)).toBeUndefined();
    expect(decodeMandateRevert('0xdeadbeef')).toBeUndefined();
  });
});

describe('gas sizing (gasFor)', () => {
  it('pads the estimate by 25%', async () => {
    const { mandates, walletClient } = setup({ estimateGas: async () => 100_000n });
    await mandates.execute(1n, TARGET, '0x', 0n);
    expect(walletClient.writeContract.mock.calls[0][0].gas).toBe(125_000n);
  });

  it('caps the padded estimate at the ceiling', async () => {
    const { mandates, walletClient } = setup({ estimateGas: async () => 1_000_000n });
    await mandates.execute(1n, TARGET, '0x', 0n);
    expect(walletClient.writeContract.mock.calls[0][0].gas).toBe(300_000n);
  });

  it('falls back to the ceiling on transport errors', async () => {
    for (const err of [transportError(), new TimeoutError({ body: {}, url: 'http://rpc' })]) {
      const { mandates, walletClient } = setup({ estimateGas: async () => { throw err; } });
      await mandates.execute(1n, TARGET, '0x', 0n);
      expect(walletClient.writeContract).toHaveBeenCalledTimes(1);
      expect(walletClient.writeContract.mock.calls[0][0].gas).toBe(300_000n);
    }
  });

  it('execute(): a call the target rejects throws MandateCallFailedError and sends nothing', async () => {
    const inner = encodeErrorResult({
      abi: [{ type: 'error', name: 'Error', inputs: [{ type: 'string', name: 'message' }] }],
      errorName: 'Error',
      args: ['bad input'],
    });
    const { mandates, walletClient } = setup({
      estimateGas: async () => { throw revertError(mandateError('CallFailed', [inner])); },
    });
    const err = await mandates.execute(1n, TARGET, '0x12345678', 0n).catch((e) => e);
    expect(err).toBeInstanceOf(MandateCallFailedError);
    expect(err.reason).toBe('CallFailed');
    expect(err.targetReason).toBe('bad input');
    expect(walletClient.writeContract).not.toHaveBeenCalled();
  });

  it('payToken(): TransferFailed throws MandateCallFailedError and sends nothing', async () => {
    const { mandates, walletClient } = setup({
      estimateGas: async () => { throw revertError(mandateError('TransferFailed')); },
    });
    const err = await mandates.payToken(1n, TOKEN, PAYEE, 5n).catch((e) => e);
    expect(err).toBeInstanceOf(MandateCallFailedError);
    expect(err.reason).toBe('TransferFailed');
    expect(walletClient.writeContract).not.toHaveBeenCalled();
  });

  it('relay(): a stale or bad owner assertion throws MandateDeniedError and sends nothing', async () => {
    const { mandates, walletClient } = setup({
      estimateGas: async () => { throw revertError(mandateError('InvalidSignature')); },
    });
    const err = await mandates.relay('0x1234').catch((e) => e);
    expect(err).toBeInstanceOf(MandateDeniedError);
    expect(err.reason).toBe('InvalidSignature');
    expect(walletClient.sendTransaction).not.toHaveBeenCalled();
  });

  it('a revert without data rethrows the estimate error and sends nothing', async () => {
    const original = revertError(undefined);
    const { mandates, walletClient } = setup({ estimateGas: async () => { throw original; } });
    await expect(mandates.relay('0x1234')).rejects.toBe(original);
    expect(walletClient.sendTransaction).not.toHaveBeenCalled();
  });

  it('recognises a revert from a plain (non-viem) error with data', async () => {
    const { mandates, walletClient } = setup({
      estimateGas: async () => {
        throw Object.assign(new Error('execution reverted'), { data: mandateError('InvalidTerms') });
      },
    });
    const err = await mandates.relay('0x1234').catch((e) => e);
    expect(err).toBeInstanceOf(MandateDeniedError);
    expect(err.reason).toBe('InvalidTerms');
    expect(walletClient.sendTransaction).not.toHaveBeenCalled();
  });
});

describe('depositToken', () => {
  it('sizes both transactions from estimates, approving against the token', async () => {
    const { mandates, walletClient, publicClient } = setup({ estimateGas: async () => 40_000n });
    await mandates.depositToken(1n, TOKEN, 10n);
    expect(publicClient.estimateGas.mock.calls[0][0].to).toBe(TOKEN);
    expect(publicClient.estimateGas.mock.calls[1][0].to).toBe(CONTRACT);
    expect(walletClient.writeContract.mock.calls.map((c: any) => c[0].gas)).toEqual([50_000n, 50_000n]);
  });

  it('does not send the deposit when approve reverted', async () => {
    const { mandates, walletClient } = setup({ receiptStatus: () => 'reverted' });
    await expect(mandates.depositToken(1n, TOKEN, 10n)).rejects.toThrow(/approve reverted/);
    expect(walletClient.writeContract).toHaveBeenCalledTimes(1);
    expect(walletClient.writeContract.mock.calls[0][0].functionName).toBe('approve');
  });
});

describe('mandateTools token decimals', () => {
  const tokenReads = (decimals: () => Promise<number>) => async ({ functionName }: any) => {
    switch (functionName) {
      case 'decimals': return decimals();
      case 'checkPayment': return [true, '0x00000000'];
      case 'getMandate':
        return { maxPerCall: 0n, budget: 0n, spent: 0n, balance: 0n, expiresAt: 0n };
      case 'getPermissions': return [];
      case 'getTokens': return [TOKEN];
      case 'isActive': return true;
      case 'getTokenAllowance':
        return { maxPerCall: 10_000_000n, budget: 25_000_000n, spent: 5_000_000n, balance: 30_000_000n, enabled: true };
      default: throw new Error(`unexpected read ${functionName}`);
    }
  };

  it('pay_token scales the amount with on-chain decimals and ignores a model-supplied value', async () => {
    const { mandates } = setup({ readContract: tokenReads(async () => 6) });
    const pay = vi.spyOn(mandates, 'payToken').mockResolvedValue({ hash: TX });
    const tool = mandateTools(mandates, 1n).find((t) => t.name === 'pay_token')!;
    expect(tool.input_schema.required).toEqual(['token', 'to', 'amount']);
    expect(tool.input_schema.properties).not.toHaveProperty('decimals');

    const res = await tool.run({ token: TOKEN, to: PAYEE, amount: '1', decimals: 8 });
    expect(res).toEqual({ ok: true, transactionHash: TX });
    expect(pay).toHaveBeenCalledWith(1n, TOKEN, PAYEE, 1_000_000n);
  });

  it('pay_token refuses when decimals() cannot be read, and does not cache the failure', async () => {
    let fail = true;
    const { mandates } = setup({
      readContract: tokenReads(async () => {
        if (fail) throw new Error('rate limited');
        return 6;
      }),
    });
    const pay = vi.spyOn(mandates, 'payToken').mockResolvedValue({ hash: TX });
    const tool = mandateTools(mandates, 1n).find((t) => t.name === 'pay_token')!;

    await expect(tool.run({ token: TOKEN, to: PAYEE, amount: '1' })).rejects.toThrow(/decimals/);
    expect(pay).not.toHaveBeenCalled();

    fail = false;
    await tool.run({ token: TOKEN, to: PAYEE, amount: '2.5' });
    expect(pay).toHaveBeenCalledWith(1n, TOKEN, PAYEE, 2_500_000n);
  });

  it('mandate_status reports token caps in whole tokens with their decimals', async () => {
    const { mandates } = setup({ readContract: tokenReads(async () => 6) });
    const tool = mandateTools(mandates, 1n).find((t) => t.name === 'mandate_status')!;
    const res: any = await tool.run({});
    expect(res.tokenBudgets[0]).toMatchObject({
      token: TOKEN,
      decimals: 6,
      maxPerCall: '10',
      remaining: '20',
      vault: '30',
      units: { maxPerCall: '10000000', remaining: '20000000', vault: '30000000' },
    });
  });

  it('execute_action reports a target rejection as data, not as a policy denial', async () => {
    const { mandates } = setup({
      estimateGas: async () => { throw revertError(mandateError('CallFailed', ['0x'])); },
      readContract: async () => [true, '0x00000000'],
    });
    const tool = mandateTools(mandates, 1n).find((t) => t.name === 'execute_action')!;
    const res: any = await tool.run({ target: TARGET });
    expect(res).toMatchObject({ ok: false, failed: 'CallFailed' });
    expect(res.blockedBy).toBeUndefined();
  });
});

describe('verifyMandatesReceipt', () => {
  const actionLog = (mandateId = 1n, address: Address = CONTRACT) => ({
    address,
    topics: encodeEventTopics({ abi: AgentMandatesABI, eventName: 'ActionExecuted', args: { mandateId, agent: AGENT, target: TARGET } }),
    data: encodeAbiParameters(parseAbiParameters('bytes4, uint256, uint256, bytes32'), [
      '0xa9059cbb', 5n, 15n, keccak256('0xa9059cbb'),
    ]),
  });
  const tokenPaidLog = (mandateId = 1n) => ({
    address: CONTRACT,
    topics: encodeEventTopics({ abi: AgentMandatesABI, eventName: 'TokenPaid', args: { mandateId, token: TOKEN, to: PAYEE } }),
    data: encodeAbiParameters(parseAbiParameters('uint256, uint256'), [2_500_000n, 7_500_000n]),
  });
  const client = (logs: unknown[], status = 'success') =>
    ({
      getChainId: async () => 10143,
      waitForTransactionReceipt: async () => ({ status, blockNumber: 9n, gasUsed: 70_000n, logs }),
    }) as any;

  it('verifies a v2 ActionExecuted receipt', async () => {
    const r = await verifyMandatesReceipt(client([actionLog()]), CONTRACT, TX, { expectedChainId: 10143, expectedMandateId: 1n });
    expect(r).toMatchObject({
      verified: true, status: 'success', kind: 'action', mandateId: 1n, agent: AGENT,
      target: TARGET, selector: '0xa9059cbb', value: 5n, spent: 15n,
    });
  });

  it('verifies a v2 TokenPaid receipt', async () => {
    const r = await verifyMandatesReceipt(client([tokenPaidLog()]), CONTRACT, TX, { expectedMandateId: 1n });
    expect(r).toMatchObject({
      verified: true, kind: 'tokenPayment', mandateId: 1n, token: TOKEN, to: PAYEE, amount: 2_500_000n, spent: 7_500_000n,
    });
  });

  it('rejects a receipt for another mandate', async () => {
    const r = await verifyMandatesReceipt(client([actionLog(2n)]), CONTRACT, TX, { expectedMandateId: 1n });
    expect(r.verified).toBe(false);
    expect(r.revertReason).toMatch(/Mandate #2, expected #1/);
  });

  it('rejects events from another contract and v1 events', async () => {
    const v1 = {
      address: CONTRACT,
      topics: encodeEventTopics({ abi: MandateManagerABI, eventName: 'ActionExecuted', args: { mandateId: 1n, target: TARGET } }),
      data: encodeAbiParameters(parseAbiParameters('bytes4, uint256, bytes'), ['0xa9059cbb', 5n, '0x']),
    };
    const r = await verifyMandatesReceipt(client([actionLog(1n, TARGET), v1]), CONTRACT, TX);
    expect(r.verified).toBe(false);
    expect(r.status).toBe('success');
    expect(r.revertReason).toMatch(/no ActionExecuted or TokenPaid/);
  });

  it('reports reverted transactions and wrong networks', async () => {
    expect((await verifyMandatesReceipt(client([], 'reverted'), CONTRACT, TX)).status).toBe('reverted');
    expect((await verifyMandatesReceipt(client([actionLog()]), CONTRACT, TX, { expectedChainId: 1 })).status).toBe('wrong_network');
  });
});
