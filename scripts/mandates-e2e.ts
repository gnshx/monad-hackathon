/**
 * End-to-end AgentMandates run: deploy, create a passkey-owned mandate through a relayer, let an
 * agent act within limits, show the contract blocking out-of-policy calls, revoke with the passkey
 * and withdraw the rest.
 *
 *   Local (spawns anvil with the Osaka P-256 precompile at 0x100):
 *     npm run e2e
 *   Monad testnet (deploys fresh contracts and records every tx in deployments.mandates.json):
 *     DEPLOYER_PRIVATE_KEY=0x... npm run e2e -- --testnet
 *
 * The owner signs with a software P-256 authenticator that emits byte-for-byte WebAuthn
 * assertions (authenticatorData + clientDataJSON). In the console the same calls are signed by a
 * real device passkey; the contract cannot tell the difference and does not need to.
 */
import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {
  createPublicClient,
  createWalletClient,
  encodeFunctionData,
  formatEther,
  http,
  parseEther,
  toFunctionSelector,
  type Address,
  type Chain,
  type Hex,
  type PublicClient,
} from 'viem';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import {
  AgentMandates,
  AgentMandatesABI,
  ANY_SELECTOR,
  createSoftwarePasskey,
  encode,
  ownerKeyOf,
  MONAD_TESTNET_ERC8004_REGISTRY,
  ERC8004_IDENTITY_REGISTRY_ABI,
} from '@agenttrust/sdk';

const ROOT = path.resolve(__dirname, '..');
const TESTNET = process.argv.includes('--testnet');
const SERVE = process.argv.includes('--serve'); // stop after setup and keep the chain up, e.g. to try the MCP server
const RPC_URL = TESTNET ? process.env.MONAD_RPC_URL || 'https://testnet-rpc.monad.xyz' : 'http://127.0.0.1:8546';
const ANVIL_KEY = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80'; // anvil account #0, public test key
const EXPLORER = 'https://testnet.monadexplorer.com';

loadDotEnv();

const MINT_ABI = [
  { type: 'function', name: 'mint', inputs: [{ type: 'address' }, { type: 'uint256' }], outputs: [], stateMutability: 'nonpayable' },
] as const;

const TARGET_ABI = [
  { type: 'function', name: 'doSomething', inputs: [{ name: 'v', type: 'uint256' }], outputs: [{ type: 'uint256' }], stateMutability: 'payable' },
] as const;

const log = (s = '') => console.log(s);
const step = (n: string, s: string) => log(`\n── ${n} ${s}`);
const link = (hash: Hex) => (TESTNET ? `${EXPLORER}/tx/${hash}` : hash);

async function main() {
  let anvil: ChildProcess | undefined;
  if (!TESTNET) anvil = await startAnvil();

  try {
    const deployerKey = (TESTNET ? process.env.DEPLOYER_PRIVATE_KEY : ANVIL_KEY) as Hex | undefined;
    if (!deployerKey) throw new Error('Set DEPLOYER_PRIVATE_KEY (a funded Monad testnet key) to run with --testnet');

    const publicClient = createPublicClient({ transport: http(RPC_URL) }) as PublicClient;
    const chainId = await publicClient.getChainId();
    const chain = { id: chainId, name: TESTNET ? 'Monad Testnet' : 'anvil', nativeCurrency: { name: 'MON', symbol: 'MON', decimals: 18 }, rpcUrls: { default: { http: [RPC_URL] } } } as Chain;

    const relayer = createWalletClient({ account: privateKeyToAccount(deployerKey), chain, transport: http(RPC_URL) });
    const agentKey = (process.env.AGENT_PRIVATE_KEY as Hex) || generatePrivateKey();
    const agentAccount = privateKeyToAccount(agentKey);
    const agent = createWalletClient({ account: agentAccount, chain, transport: http(RPC_URL) });
    const stranger = createWalletClient({ account: privateKeyToAccount(generatePrivateKey()), chain, transport: http(RPC_URL) });
    const passkey = createSoftwarePasskey();
    const ownerKey = ownerKeyOf(passkey.publicKey);
    const coldWallet = privateKeyToAccount(generatePrivateKey()).address;
    const merchant = privateKeyToAccount(generatePrivateKey()).address; // e.g. a pay-per-call API
    const record: Record<string, Hex> = {};
    const wait = async (hash: Hex) => publicClient.waitForTransactionReceipt({ hash });

    log(`Network:  ${chain.name} (chain ${chainId})`);
    log(`Relayer:  ${relayer.account.address}  balance ${formatEther(await publicClient.getBalance({ address: relayer.account.address }))} MON`);
    log(`Agent:    ${agentAccount.address}`);
    log(`Passkey:  ownerKey ${ownerKey}`);

    step('1/8', 'Deploy');
    const registry = TESTNET ? MONAD_TESTNET_ERC8004_REGISTRY : await deploy(relayer, publicClient, 'AgentMandates.t.sol/MockIdentityRegistry.json', []);
    const target = await deploy(relayer, publicClient, 'MockTarget.sol/MockTarget.json', []);
    const usdc = await deploy(relayer, publicClient, 'MockERC20.sol/MockERC20.json', []); // test stablecoin, 6 decimals
    const mandatesAddress = await deploy(relayer, publicClient, 'AgentMandates.sol/AgentMandates.json', [registry, '0x0000000000000000000000000000000000000000']);
    log(`AgentMandates  ${mandatesAddress}`);
    log(`ERC-8004       ${registry}`);
    log(`MockTarget     ${target}`);
    log(`Test USDC      ${usdc}`);

    step('2/8', 'Give the agent gas and an ERC-8004 identity');
    record.fundAgent = await relayer.sendTransaction({ to: agentAccount.address, value: parseEther(TESTNET ? '0.05' : '1') });
    await wait(record.fundAgent);
    let agentId: bigint;
    if (TESTNET) {
      record.registerAgent = await agent.writeContract({ address: registry, abi: ERC8004_IDENTITY_REGISTRY_ABI, functionName: 'register', args: ['https://agenttrust.vercel.app/agent.json'] });
      const rcpt = await wait(record.registerAgent);
      const transfer = rcpt.logs.find((l) => l.address.toLowerCase() === registry.toLowerCase() && l.topics[0] === '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef');
      if (!transfer?.topics[3]) throw new Error('Could not read minted agentId from the ERC-8004 registry');
      agentId = BigInt(transfer.topics[3]);
    } else {
      agentId = 1n;
      const setAbi = [{ type: 'function', name: 'set', inputs: [{ type: 'uint256' }, { type: 'address' }, { type: 'address' }], outputs: [], stateMutability: 'nonpayable' }] as const;
      record.registerAgent = await relayer.writeContract({ address: registry, abi: setAbi, functionName: 'set', args: [agentId, agentAccount.address, agentAccount.address] });
      await wait(record.registerAgent);
    }
    log(`agentId #${agentId} bound to ${agentAccount.address}`);

    const ownerSdk = new AgentMandates(mandatesAddress, publicClient, relayer);
    const agentSdk = new AgentMandates(mandatesAddress, publicClient, agent);
    const selector = toFunctionSelector('doSomething(uint256)');
    const terms = {
      agent: agentAccount.address,
      agentId,
      permissions: [{ target, selector }, { target: merchant, selector: ANY_SELECTOR }],
      maxPerCall: parseEther('0.01'),
      budget: parseEther('0.02'),
      expiresAt: BigInt(Math.floor(Date.now() / 1000) + 7 * 24 * 3600),
      tokenLimits: [{ token: usdc, maxPerCall: 10_000_000n, budget: 25_000_000n }], // 10 USDC per call, 25 total
    };

    step('3/8', 'Owner signs the mandate with a passkey; the relayer submits and funds it');
    const createAuth = passkey.sign(await ownerSdk.createChallenge(passkey.publicKey, terms));
    record.createMandate = await ownerSdk.relay(encode.createMandate(passkey.publicKey, terms, createAuth), parseEther('0.03'));
    const mandateId = await publicClient.readContract({ address: mandatesAddress, abi: AgentMandatesABI, functionName: 'mandateCount' });
    log(`mandate #${mandateId}: 0.01 MON/call, 0.02 MON budget, doSomething() only; 10 USDC/call, 25 USDC budget to the merchant   ${link(record.createMandate)}`);
    record.mintUsdc = await relayer.writeContract({ address: usdc, abi: MINT_ABI, functionName: 'mint', args: [relayer.account.address, 30_000_000n] });
    await wait(record.mintUsdc);
    record.depositUsdc = (await ownerSdk.depositToken(mandateId, usdc, 30_000_000n)).hash;
    log(`funded token vault with 30 USDC   ${link(record.depositUsdc)}`);

    step('4/8', 'Agent makes an allowed call');
    record.allowedCall = (await agentSdk.execute(mandateId, target, call(1), parseEther('0.01'))).hash;
    log(`allowed: 0.01 MON to doSomething()   ${link(record.allowedCall)}`);
    record.allowedPayment = (await agentSdk.payToken(mandateId, usdc, merchant, 10_000_000n)).hash;
    log(`allowed: paid the merchant 10 USDC   ${link(record.allowedPayment)}`);

    if (SERVE) {
      log(`\nLeaving the mandate live. Point the MCP server at it:\n`);
      log(`  AGENTTRUST_RPC_URL=${RPC_URL} AGENTTRUST_CONTRACT=${mandatesAddress} AGENTTRUST_MANDATE_ID=${mandateId} AGENT_PRIVATE_KEY=<agent key> node packages/mcp/dist/index.js`);
      fs.writeFileSync(path.join(ROOT, '.mcp-local.env'), `AGENTTRUST_RPC_URL=${RPC_URL}\nAGENTTRUST_CONTRACT=${mandatesAddress}\nAGENTTRUST_MANDATE_ID=${mandateId}\nAGENT_PRIVATE_KEY=${TESTNET ? '<agent key>' : agentKey}\nTARGET=${target}\nUSDC=${usdc}\nMERCHANT=${merchant}\n`);
      log('\nWrote .mcp-local.env (gitignored). Ctrl+C to stop.');
      await new Promise(() => {});
    }

    step('5/8', 'Out-of-policy calls (sent on-chain anyway, so the reverts are on record)');
    const attempts: [string, typeof agent, Address, Hex, bigint][] = [
      ['overLimitBlocked', agent, target, call(2), parseEther('0.02')],
      ['rogueTargetBlocked', agent, coldWallet, '0x', parseEther('0.005')],
      ['strangerBlocked', stranger, target, call(3), 0n],
    ];
    if (!TESTNET) await relayer.sendTransaction({ to: stranger.account.address, value: parseEther('1') });
    else await wait(await relayer.sendTransaction({ to: stranger.account.address, value: parseEther('0.02') }));
    {
      const check = await agentSdk.checkPayment(mandateId, agentAccount.address, usdc, merchant, 15_000_000n);
      record.tokenOverLimitBlocked = await agent.writeContract({ address: mandatesAddress, abi: AgentMandatesABI, functionName: 'payToken', args: [mandateId, usdc, merchant, 15_000_000n], gas: 300_000n });
      const rcpt = await wait(record.tokenOverLimitBlocked);
      log(`${'tokenOverLimitBlocked'.padEnd(20)} checkPayment → ${check.reason}, on-chain status: ${rcpt.status}   ${link(record.tokenOverLimitBlocked)}`);
      if (rcpt.status !== 'reverted') throw new Error('tokenOverLimitBlocked should have reverted');
    }
    for (const [name, wallet, to, data, value] of attempts) {
      const check = await agentSdk.checkAction(mandateId, wallet.account.address, to, data, value);
      record[name] = await forceExecute(wallet, mandatesAddress, mandateId, to, data, value);
      const rcpt = await wait(record[name]);
      log(`${name.padEnd(20)} checkAction → ${check.reason}, on-chain status: ${rcpt.status}   ${link(record[name])}`);
      if (rcpt.status !== 'reverted') throw new Error(`${name} should have reverted`);
    }

    step('6/8', 'Owner revokes with the passkey (relayed, owner pays no gas)');
    record.revoke = await ownerSdk.relay(encode.revoke(mandateId, passkey.sign(await ownerSdk.revokeChallenge(passkey.publicKey, mandateId))));
    record.afterRevokeBlocked = await forceExecute(agent, mandatesAddress, mandateId, target, call(4), 0n);
    log(`revoked   ${link(record.revoke)}`);
    log(`agent after revoke: ${(await wait(record.afterRevokeBlocked)).status}   ${link(record.afterRevokeBlocked)}`);

    step('7/8', 'Owner withdraws the unspent vault to a cold wallet');
    const left = (await ownerSdk.getMandate(mandateId)).balance;
    record.withdraw = await ownerSdk.relay(encode.withdraw(mandateId, coldWallet, left, passkey.sign(await ownerSdk.withdrawChallenge(passkey.publicKey, mandateId, coldWallet, left))));
    log(`withdrew ${formatEther(left)} MON to ${coldWallet}   ${link(record.withdraw)}`);
    const leftUsdc = (await ownerSdk.getTokenAllowance(mandateId, usdc)).balance;
    record.withdrawToken = await ownerSdk.relay(encode.withdrawToken(mandateId, usdc, coldWallet, leftUsdc, passkey.sign(await ownerSdk.withdrawTokenChallenge(passkey.publicKey, mandateId, usdc, coldWallet, leftUsdc))));
    log(`withdrew ${Number(leftUsdc) / 1e6} USDC to ${coldWallet}   ${link(record.withdrawToken)}`);

    step('8/8', 'Final state');
    const gas = async (h: Hex) => (await publicClient.getTransactionReceipt({ hash: h })).gasUsed;
    log(`gas: createMandate ${await gas(record.createMandate)}, execute ${await gas(record.allowedCall)}, payToken ${await gas(record.allowedPayment)}, revoke ${await gas(record.revoke)}`);
    const m = await ownerSdk.getMandate(mandateId);
    const ta = await ownerSdk.getTokenAllowance(mandateId, usdc);
    log(`spent ${formatEther(m.spent)} / ${formatEther(m.budget)} MON and ${Number(ta.spent) / 1e6} / ${Number(ta.budget) / 1e6} USDC, vaults empty: ${m.balance === 0n && ta.balance === 0n}, revoked ${m.revoked}`);

    if (TESTNET) {
      const out = {
        network: 'Monad Testnet',
        chainId,
        timestamp: new Date().toISOString(),
        contracts: { agentMandates: mandatesAddress, erc8004IdentityRegistry: registry, mockTarget: target, testUsdc: usdc, p256Precompile: '0x0000000000000000000000000000000000000100' },
        mandateId: Number(mandateId),
        agentId: Number(agentId),
        agent: agentAccount.address,
        ownerKey,
        transactions: record,
      };
      fs.writeFileSync(path.join(ROOT, 'deployments.mandates.json'), JSON.stringify(out, null, 2) + '\n');
      log('\nWrote deployments.mandates.json');
    }
    log('\nAll scenarios behaved as expected.');
  } finally {
    anvil?.kill();
  }
}

function call(n: number): Hex {
  return encodeFunctionData({ abi: TARGET_ABI, functionName: 'doSomething', args: [BigInt(n)] });
}

/** Send execute() with a fixed gas limit so it is mined even though it will revert. */
async function forceExecute(wallet: any, contract: Address, mandateId: bigint, target: Address, data: Hex, value: bigint): Promise<Hex> {
  return wallet.writeContract({ address: contract, abi: AgentMandatesABI, functionName: 'execute', args: [mandateId, target, data, value], gas: 300_000n });
}

async function deploy(wallet: any, publicClient: PublicClient, artifact: string, args: unknown[]): Promise<Address> {
  const file = path.join(ROOT, 'contracts/out', artifact);
  if (!fs.existsSync(file)) throw new Error(`Missing ${file}. Run: cd contracts && forge build`);
  const json = JSON.parse(fs.readFileSync(file, 'utf8'));
  const hash = await wallet.deployContract({ abi: json.abi, bytecode: json.bytecode.object, args });
  const rcpt = await publicClient.waitForTransactionReceipt({ hash });
  if (!rcpt.contractAddress) throw new Error(`Deploy failed for ${artifact}`);
  return rcpt.contractAddress;
}

async function startAnvil(): Promise<ChildProcess> {
  const bin = fs.existsSync(`${process.env.HOME}/.foundry/bin/anvil`) ? `${process.env.HOME}/.foundry/bin/anvil` : 'anvil';
  const proc = spawn(bin, ['--hardfork', 'osaka', '--port', '8546', '--silent', ...(process.env.LOCAL_CHAIN_ID ? ['--chain-id', process.env.LOCAL_CHAIN_ID] : [])], { stdio: 'ignore' });
  for (let i = 0; i < 50; i++) {
    try {
      await createPublicClient({ transport: http(RPC_URL) }).getChainId();
      return proc;
    } catch {
      await new Promise((r) => setTimeout(r, 100));
    }
  }
  proc.kill();
  throw new Error('anvil did not start (install Foundry: https://getfoundry.sh)');
}

function loadDotEnv() {
  const file = path.join(ROOT, '.env');
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

main().catch((e) => {
  console.error(`\n✗ ${e.shortMessage || e.message}`);
  process.exit(1);
});
