/**
 * Monad Testnet Configuration & Precompile Constants
 */

export const MONAD_CONFIG = {
  chainId: 10143,
  chainName: 'Monad Testnet',
  nativeCurrency: {
    name: 'MON',
    symbol: 'MON',
    decimals: 18,
  },
  rpcUrl: 'https://testnet-rpc.monad.xyz',
  explorerUrl: 'https://testnet.monadexplorer.com',
  contracts: {
    // Monad Native P256 Precompile (RIP-7212)
    p256Precompile: '0x0000000000000000000000000000000000000100',
    // AgentTrust Deployed Mandate Manager
    mandateManager: '0x836EF907c125d7b57F481De24A9A65D65A4B2901',
    // ERC-8004 Trustless Agent Registry
    erc8004Registry: '0x8004E85C27F47fD7eB368C090D782D2a8c962b10',
    // Common Verified Target Protocols on Monad
    monadRouter: '0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D',
    liquidStaking: '0x1111111254fb6c44bac0bed2854e76f90643097d',
    oracleAttester: '0x222222209677e5d83aef7bb184f475f483c6c19a',
    unauthorizedDrainTarget: '0xDeadDeAdDeADdeAdDeaddeadDEADdeAdDeadbEEf',
  },
  functionSelectors: {
    '0xa9059cbb': 'transfer(address,uint256)',
    '0x38ed1739': 'swapExactTokens(uint256,address)',
    '0xd0e30db0': 'deposit()',
    '0x2e1a7d4d': 'withdraw(uint256)',
    '0xf8c8765e': 'rebalance(uint256)',
    '0x6b876543': 'drainAll() [MALICIOUS]',
  }
};
