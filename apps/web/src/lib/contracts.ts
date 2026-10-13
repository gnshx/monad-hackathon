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

// Default deployed contract address on Monad Testnet (Chain ID 10143)
export const DEFAULT_MANDATE_MANAGER_ADDRESS: Address =
  (process.env.NEXT_PUBLIC_MANDATE_MANAGER_ADDRESS as Address) ||
  '0x3550f9fc84640a9cfd7c51330615a1e05cb948be';

export const DEFAULT_MOCK_TARGET_ADDRESS: Address =
  (process.env.NEXT_PUBLIC_MOCK_TARGET_ADDRESS as Address) ||
  '0x0758fdc78e20f748fa89e2d53f84748697cb177f';

export const DEFAULT_ERC8004_REGISTRY: Address =
  '0x8004A818BFB912233c491871b3d84c89A494BD9e';

