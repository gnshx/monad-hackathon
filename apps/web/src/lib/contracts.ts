import type { Address } from 'viem';

export const MONAD_TESTNET_CONFIG = {
  id: 10143,
  name: 'Monad Testnet',
  network: 'monad-testnet',
  nativeCurrency: {
    decimals: 18,
    name: 'Monad',
    symbol: 'MON',
  },
  rpcUrls: {
    default: {
      http: ['https://testnet-rpc.monad.xyz'],
    },
    public: {
      http: ['https://testnet-rpc.monad.xyz'],
    },
  },
  blockExplorers: {
    default: {
      name: 'Monad Explorer',
      url: 'https://testnet.monadexplorer.com',
    },
  },
};

// Default deployed contract address on Monad Testnet (or test address)
export const DEFAULT_MANDATE_MANAGER_ADDRESS: Address =
  (process.env.NEXT_PUBLIC_MANDATE_MANAGER_ADDRESS as Address) ||
  '0xa5754E89745eC4eB9d7F31f0C34eB267773531b7';

export const DEFAULT_ERC8004_REGISTRY: Address =
  '0x8004A818BFB912233c491871b3d84c89A494BD9e';

