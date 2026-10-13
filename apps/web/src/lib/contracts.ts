import { toFunctionSelector, type Address, type Hex } from 'viem';

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

// MockTarget.doSomething(uint256): the one payable method the v1 demo allowlists. Equals 0xa6b206bf.
export const DO_SOMETHING_SIGNATURE = 'doSomething(uint256)';
export const DO_SOMETHING_SELECTOR: Hex = toFunctionSelector(DO_SOMETHING_SIGNATURE);

export const MONAD_TESTNET_EXPLORER = 'https://testnet.monadexplorer.com';

// Transactions recorded by scripts/deploy-and-run-testnet.ts against the v1 MandateManager
// (copied from the repo-root deployments.json, which sits outside the Next.js app root).
export const V1_TESTNET_RUN_TXS = {
  credentialRegistration: '0x3eafdec02f64a2fb78e0ae3fef6f7ba4eea5da0cb142e58041d100605a5d21d2',
  mandateCreation: '0xd9e9a355baa9d16c37c3411349a9437c6c09c9dcf2ffc0940cf049c7c8182e32',
  allowedExecution: '0xdf928824bddee386bac134559d4148ac88fa5d79fdf9dcb710d8bcd2947e7e77',
  rogueTargetRevert: '0x83df0f92e51350248df49713c9a19c6a9b2b2d0e7eb40dca6dd8155318228c7a',
  overLimitRevert: '0x959dbe12d49225b19d1fea8344077f849b89a3dc5a1d7b38b9aa24ba3a0cc0bd',
  strangerHijackRevert: '0xc9ca8bfa073880c6818d0b43ac023ef490a56b31a7a95e5fcc3653fe909cd691',
  mandateRevocation: '0x5b082de833511df83bd84d7351dcca5aff57eaf43a30aa2f5200a80d952e33ff',
  vaultWithdrawal: '0x56d206d2ae776e4aad9997059c87caeeefa44de887f1eea0c094d45f1a572f84',
} as const;

export const explorerTxUrl = (hash: string) => `${MONAD_TESTNET_EXPLORER}/tx/${hash}`;

