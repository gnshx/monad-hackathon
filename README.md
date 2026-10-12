# AgentTrust — Passkey-Authorized, On-Chain Permissions for AI Agents

<p align="center">
  <img src="./docs/assets/agenttrust_logo.jpg" alt="AgentTrust Logo" width="220" style="border-radius: 20px; box-shadow: 0 8px 32px rgba(131, 110, 249, 0.4);" />
</p>

<p align="center">
  <strong>Passkey-Authorized Mandates · Monad Native P256 Precompile (RIP-7212) · ERC-8004 Trustless Agent Registry · Zero-Backend Portable Verification</strong>
</p>

<p align="center">
  <a href="./docs/pitch.md">2-Min Pitch Video Script</a> •
  <a href="./docs/demo-script.md">3-Min Demo Video Script</a> •
  <a href="./docs/integration-guide.md">Integrator Guide</a> •
  <a href="#quickstart">Quickstart</a>
</p>

> **Track:** Trust, Identity & AI Infrastructure (Metropolis Track)  
> **Target Network:** Monad Blockchain (Testnet & Mainnet)

---

## 1. Overview

**AgentTrust** establishes a decentralized trust and security boundary for autonomous AI agents. Rather than trusting off-chain backend policies or agent prompts (which are vulnerable to prompt injection and jailbreaks), a human owner authorizes an agent using a hardware **WebAuthn Passkey (P-256)**. 

The permissions, target contract allowlists, per-action caps, and cumulative spending limits are committed directly to the **`MandateManager`** smart contract on Monad.

- **The contract is the enforcement boundary**: The frontend, AI framework, and SDK are convenience layers; the blockchain guarantees that unauthorized actions revert.
- **Passkey-Authorized Mandates**: Uses WebAuthn P-256 signatures to authorize canonical mandate definitions bound to `chainId` and contract nonce.
- **ERC-8004 Identity Integration**: References registered on-chain agent identities.
- **Independent Verification**: Anyone can verify execution receipts and audit historical agent compliance using the `@agenttrust/sdk`.

---

## 2. Architecture

```
                          ┌──────────────────────────┐
                          │       Human Owner        │
                          │ (Passkey / WebAuthn P256) │
                          └─────────────┬────────────┘
                                        │ Signed Mandate Challenge
                                        ▼
                          ┌──────────────────────────┐
                          │    AgentTrust Web App    │
                          │   (Next.js 15 Dashboard) │
                          └─────────────┬────────────┘
                                        │ Broadcasts Mandate
                                        ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                              MONAD BLOCKCHAIN                               │
│                                                                             │
│  ┌────────────────────────┐                   ┌──────────────────────────┐  │
│  │    IP256Verifier       │                   │  ERC-8004 Registry       │  │
│  │ (Monad P256 Precompile)│                   │   (Agent Identity)       │  │
│  └───────────▲────────────┘                   └────────────▲─────────────┘  │
│              │ Verify sig                                  │ Check ID       │
│  ┌───────────┴─────────────────────────────────────────────┴─────────────┐  │
│  │                          MandateManager                               │  │
│  │  - Nonce & Replay Check     - Per-Action & Total Spending Caps        │  │
│  │  - Target/Selector Allowlist - Owner Revocation & Expiry              │  │
│  └───────────────────────────────────┬───────────────────────────────────┘  │
│                                      │ Atomic Execution / Revert            │
│                                      ▼                                      │
│                         ┌──────────────────────────┐                        │
│                         │ Target Protocol/Contract │                        │
│                         └──────────────────────────┘                        │
└──────────────────────────────────────▲──────────────────────────────────────┘
                                       │
                      Execute Action   │ Verify Receipts
                                       │
                        ┌──────────────┴──────────────┐
                        │    AI Agent / Verifier      │
                        │    (@agenttrust/sdk)        │
                        └─────────────────────────────┘
```

---

## 3. Monorepo Structure

```
agenttrust/
├── contracts/               # Smart contracts (Solidity 0.8.24 & Foundry)
│   ├── src/
│   │   ├── MandateManager.sol   # Core permissions & execution engine
│   │   ├── IP256Verifier.sol    # Monad P256 precompile interface
│   │   └── lib/ReentrancyGuard.sol
│   ├── test/
│   │   ├── MandateManager.t.sol # Test suite (expiry, replay, limits, revocation)
│   │   ├── MockP256Verifier.sol
│   │   └── MockTarget.sol
│   ├── script/Deploy.s.sol      # Monad testnet deployment script
│   └── foundry.toml
│
├── packages/
│   └── sdk/                 # TypeScript SDK (@agenttrust/sdk)
│       ├── src/
│       │   ├── client.ts    # AgentTrustClient
│       │   ├── mandate.ts   # Canonical hashing, creation, revocation
│       │   ├── execute.ts   # On-chain execution wrapper
│       │   ├── verify.ts    # Independent receipt and preflight verification
│       │   ├── abi.ts       # Typed contract ABI
│       │   ├── types.ts     # TypeScript interfaces
│       │   └── errors.ts    # Typed error hierarchy
│       └── test/sdk.test.ts # 10 unit tests with vitest
│
├── apps/
│   ├── web/                 # Next.js 15 passkey dashboard & activity inspector
│   │   ├── src/app/         # Dashboard UI & design system
│   │   └── src/lib/         # WebAuthn passkey registration & signing
│   │
│   └── demo-agent/          # Autonomous AI agent simulation & verifier client
│       ├── src/index.ts     # Agent attempting allowed vs blocked actions
│       └── src/verifier-client.ts # Third-party receipt verification client
│
└── package.json             # Monorepo workspaces
```

---

## 4. Key Security Invariants

| Risk | On-Chain Mitigation |
|---|---|
| **Replay Attacks** | Sequential owner nonces for mandate creation + per-mandate execution nonces |
| **Rogue AI Actions** | Strict allowlist of `(targetContract, selector)` tuples |
| **Budget Depletion** | Enforces both `maxValuePerTx` and cumulative `maxTotalValue` atomically |
| **Compromised Agent** | Instant owner revocation with zero lingering delegation |
| **Failed Calls** | Revert rolls back state; failed calls never consume spending allowance |
| **Reentrancy** | Checks-effects-interactions pattern + reentrancy guard |

---

## 5. Quickstart

### 1. Build and Test the SDK
```bash
cd packages/sdk
npm install
npm test      # Runs vitest unit tests
npm run build # Compiles TypeScript to dist/
```

### 2. Run the Web Application
```bash
cd apps/web
npm install
npm run dev   # Starts Next.js dashboard at http://localhost:3000
```

### 3. Run the Demo AI Agent
```bash
cd apps/demo-agent
npm install
npm run build
npm start          # Simulates agent actions (allowed, over-limit, rogue target)
npm run verify-client <txHash> # Independently verifies an execution receipt
```

---

## 6. Monad Network Configuration

- **Chain ID:** `10143`
- **RPC URL:** `https://testnet-rpc.monad.xyz`
- **Currency Symbol:** `MON`
- **Explorer:** `https://testnet.monadexplorer.com`
