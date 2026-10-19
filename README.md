# Decentralized Supply-Chain Tracker

A Web3 supply-chain tracker that records products moving from manufacturers through distributors and
retailers to final consumers, with on-chain verification of provenance.

> **Read [docs/LIMITATIONS.md](docs/LIMITATIONS.md) before the feature list below.**
> This system proves that a *record* is genuine. It cannot prove that the *physical object* in your
> hand matches that record — a printed QR code can be photocopied, and a copy verifies identically.
> That boundary is the single most important thing to understand about the project, and the UI is
> worded so it never claims otherwise.

| | |
|---|---|
| Contract tests | 50 passing |
| Coverage | 100% statements / 100% functions / 86.59% branches |
| Frontend tests | 11 passing |
| Static analysis | Slither: 0 high, 0 medium, 0 low |
| Gas optimisation | −28.8% across a full product lifecycle |

## Analysis documents

| Document | Answers |
|---|---|
| [LIMITATIONS.md](docs/LIMITATIONS.md) | What this system cannot do, and why the oracle problem bounds it |
| [THREAT-MODEL.md](docs/THREAT-MODEL.md) | Who the adversaries are, 10 analysed threats, what was accepted vs mitigated |
| [ARCHITECTURE-DECISIONS.md](docs/ARCHITECTURE-DECISIONS.md) | Why blockchain at all, why a public chain, why immutable |
| [GAS-ANALYSIS.md](docs/GAS-ANALYSIS.md) | Measured optimisation: why storage layout beat every micro-optimisation |
| [SECURITY-ANALYSIS.md](docs/SECURITY-ANALYSIS.md) | Slither results and coverage, with each finding assessed |

## Architecture

**React + Vite** → **ethers.js v6** → **MetaMask** (writes) / **JSON-RPC** (public reads) → **Solidity 0.8.20** → **Hardhat / Sepolia**

The app holds **two contract instances**, and the split is the central design decision:

| Instance | Backed by | Used for | Wallet needed |
|---|---|---|---|
| `readContract` | `JsonRpcProvider` | `verifyProduct`, `getProduct`, `getProductHistory`, event queries | **No** |
| `contract` | MetaMask signer | `createProduct`, transfers, `assignRole` | Yes |

A consumer scanning a QR code is a shopper, not a supply chain participant, and will not have MetaMask
installed. Routing all read paths through a wallet-free provider is what makes the verification feature
actually usable by its intended audience.

### Key Features

1. **Product Twin Registration** — only Manufacturers can register products, generating a unique
   on-chain record plus a downloadable QR code.
2. **Chain of Custody** — a strict one-way state machine:
   `Manufactured → DistributorReceived → RetailerReceived → Sold`
3. **QR Verification** — scan with the in-app camera scanner or open `/verify/<PRODUCT-ID>` directly.
   Works with no wallet.
4. **Counterfeit Detection** — an unregistered ID returns
   *"No blockchain record found for this ID. This product may be counterfeit."*
5. **Clone Detection** — `recordScan` tracks verification activity per product. Heavy scanning of an
   item already marked `Sold` is flagged as a probable copied label. This detects cloning; it cannot
   prevent it ([why](docs/LIMITATIONS.md#1-the-oracle-problem-records-not-objects)).
6. **Product Registry** — a dashboard listing every product, rebuilt from event logs rather than
   on-chain storage (see the design note below).
7. **Owner Recovery** — `adminReassignCustody` frees products stranded by a mid-custody role change.
8. **Emergency Pause** — the owner can halt all writes. Reads are deliberately never pausable.

---

## Running Locally

### 1. Install and start a local chain
```bash
npm install
npx hardhat node
```

### 2. Deploy (separate terminal)
```bash
npm run deploy
```
Writes the address, ABI, chain ID, RPC URL and deployment block to `src/contracts/` for the frontend.

### 3. Seed demo data (recommended before a live demo)
```bash
npm run seed
```
Assigns Manufacturer / Distributor / Retailer to Hardhat accounts #1–#3 and registers four sample
products, each left at a different lifecycle stage.

### 4. Run the tests
```bash
npm test
```
50 tests covering role permissions, state transitions, input validation, custody guards, the history
trail, event payloads, event-log readability, scan tracking, emergency pause, and the admin recovery
path. Prints a per-function gas table.

```bash
npm run test:ui
```
11 React tests covering the verification flow: wallet-free lookup, the counterfeit path, the
disclaimer, clone-warning thresholds, and the route-change regression.

```bash
npm run coverage
```
100% statements, 100% functions, 86.59% branches on `SupplyChain.sol`.

```bash
python -m slither . --compile-force-framework hardhat --exclude-dependencies
```
Needs `pip install slither-analyzer`. Results are assessed in
[SECURITY-ANALYSIS.md](docs/SECURITY-ANALYSIS.md).

### 5. Start the frontend
```bash
npm run dev
```

Open `http://localhost:5173`. Verification works immediately with no wallet.

---

## Roles Setup

1. Connect MetaMask to the Hardhat network: `HTTP://127.0.0.1:8545`, chain ID `1337`.
   The app shows a **Switch Network** banner if your wallet is on the wrong chain.
2. The deploying account is the Owner. Only the Owner sees the **Manage Roles** page.
3. Assign roles: **1** Manufacturer, **2** Distributor, **3** Retailer, **0** revoke.
4. Switch MetaMask accounts to test each restricted operation.

If you ran `npm run seed`, roles are already assigned — just import the private keys that
`npx hardhat node` prints for accounts #1–#3.

---

## Sepolia Testnet Deployment

```bash
cp .env.example .env
```

Fill in `SEPOLIA_RPC_URL` and `PRIVATE_KEY`, then:

```bash
npm run deploy:sepolia
```

> **Use a throwaway wallet funded from a faucet.** Never put a real private key in `.env`.
> `.env` is gitignored; `.env.example` is the committed template.

---

## Design Notes

**Why product IDs are emitted twice.** Solidity stores an `indexed` dynamic type (string, bytes, array)
in the log topic as its **keccak256 hash**, not its value. An off-chain listener reading an indexed
string therefore gets an irreversible hash. The events emit `productId` (indexed, for filtering) *and*
`productIdPlain` (unindexed, in the log data) so the registry can actually enumerate products.

**Why the registry uses logs, not on-chain storage.** A `string[] productIds` array would add roughly
20k gas of storage cost to every registration. Logs are far cheaper to write and free to read, and no
other contract needs to query the list. Paying for on-chain enumeration would buy nothing here.

**Why `adminReassignCustody` exists.** Every pipeline function requires both an exact role match *and*
current custody. If the Owner revokes the role of an address that is holding a product, nobody can move
it again — the product is deadlocked permanently. The recovery function is a deliberate trade-off:
it reintroduces centralisation, made auditable by a distinct `CustodyReassigned` event so an
administrative intervention can never be mistaken for a normal transfer.

**Why a sale keeps the retailer as owner.** The consumer is off-chain and has no address, so
`markAsSold` changes *status* only. The retailer stays as custodian of record, which preserves
accountability for who sold the item.

**Why struct field order looks odd.** `Product` and `HistoryEntry` order their fields so the
compiler packs them into fewer 32-byte storage slots. Reordering them and dropping a redundant
field cut `createProduct` by 34.6% — far more than `calldata` and custom errors combined.
Full measurements in [GAS-ANALYSIS.md](docs/GAS-ANALYSIS.md).

**Why verification is free but recording a scan is not.** `verifyProduct` is `view`, so a shopper
pays nothing and needs no wallet. `recordScan` is a separate paid call, because clone detection
needs a trace and a free read leaves none. In production the caller would be a retailer's POS
terminal, not the shopper.
