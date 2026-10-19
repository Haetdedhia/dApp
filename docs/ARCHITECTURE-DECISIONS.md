# Architecture Decisions

Why this system is built the way it is, including where the reasoning is weaker than we
would like.

---

## ADR-1: Why a blockchain at all?

**The hard version of the question:** a PostgreSQL table with an append-only audit log
does everything this contract does — faster, free, and with better queries. So why not
that?

**The honest answer, in two parts.**

*Where blockchain genuinely wins:* a supply chain spans organisations that compete. If
the manufacturer hosts the database, the distributor must trust them not to rewrite
history after a dispute. If a third party hosts it, everyone must trust that party, and
pay them. A blockchain removes the question of **who holds the pen** — no participant can
silently alter a record, and every claim is cryptographically attributable to a known
address. A consumer can verify independently without asking anyone's permission or
trusting the brand's own server to tell the truth.

That property — *mutual auditability among parties who do not trust each other* — is the
one thing a centralised database genuinely cannot provide.

*Where this implementation undercuts that argument:* a single `owner` key assigns every
role, can override any custody, and can pause the system. If you must trust one key,
much of the benefit evaporates, and "a permissioned database with extra steps" becomes a
fair description. The architecture is correct in shape and compromised in practice.

**What would close the gap:** a Gnosis Safe multi-sig as owner, with signers drawn from
different organisations in the consortium. That is a configuration change at deployment,
not a rewrite — but it is not done here, and the project should not pretend otherwise.
See [THREAT-MODEL.md](THREAT-MODEL.md#t3--owner-key-compromise-accepted).

---

## ADR-2: Public chain vs. permissioned (Hyperledger Fabric)

**Decision: public chain (Ethereum/Sepolia).**

| | Public (chosen) | Hyperledger Fabric |
|---|---|---|
| Consumer verification | Anyone, no permission, no account | Needs network access — a shopper cannot |
| Confidentiality | **None** — all trade data public | Channel-level isolation |
| Cost | Real gas per write | No gas; infrastructure cost instead |
| Throughput | ~15–30 TPS (L1) | Thousands of TPS |
| Setup | Deploy and done | Orderers, CAs, peers, governance |

**Why public won:** the primary user is a shopper holding a box. They must be able to
verify without an account, an app, or permission from the brand being checked. On a
permissioned network, consumer verification requires a gateway controlled by the
consortium — which means trusting the brand's server to answer honestly, reintroducing
exactly the trust assumption the system exists to remove.

**What it costs:** confidentiality, entirely. Competitors can read every relationship and
volume (T6). For enterprise logistics, where that data is the commercial asset, Fabric
would be the correct choice and this would be the wrong one. The decision follows from
*consumer-facing anti-counterfeiting* being the goal; change the goal and the answer
flips.

---

## ADR-3: Ethereum L1 vs. an L2

**Decision: Ethereum (Sepolia for demonstration), with reservations.**

`createProduct` costs ~255,000 gas ([GAS-ANALYSIS.md](GAS-ANALYSIS.md)). At mainnet
prices, registering individual consumer goods is not economically viable — the
verification costs more than a box of paracetamol.

Polygon PoS or an L2 such as Arbitrum or Base would cut this by two to three orders of
magnitude while keeping EVM compatibility and public verifiability, and the contract
would deploy unchanged.

**Why L1 anyway:** Sepolia is the reference testnet, has the best tooling and faucet
support, and the project's purpose is demonstrating the mechanism rather than operating
at cost. **For a real deployment this decision should be revisited first** — it is the
clearest gap between the prototype and something deployable.

---

## ADR-4: Immutable contract, no proxy

**Decision: no upgradeability. Pausable instead.**

Upgradeable proxies (UUPS or Transparent) would allow patching bugs after deployment. We
did not use one, for two reasons.

*Philosophical:* an upgradeable contract is a contract whose rules can change after you
relied on them. For an audit trail whose entire value is "these records cannot be
altered," an owner who can swap the logic undermines the guarantee. Immutability *is* the
product here.

*Practical:* proxies add delegatecall indirection, storage-layout constraints and a real
class of upgrade bugs. For a contract this size that complexity buys little.

**The cost, stated plainly:** a bug found in production cannot be fixed. The only
response is `pause()`, which stops the bleeding without curing it. Recovery means
deploying a new contract and migrating — and since products are keyed by string in
storage, migration would need every ID replayed.

This is a defensible trade-off, not a free one.

---

## ADR-5: Event logs vs. on-chain array for enumeration

**Decision: rebuild the product list from `ProductCreated` logs.**

An on-chain `string[] productIds` with a getter would be simpler to read, but pushing to
it costs roughly 20,000+ gas of storage on **every** registration, permanently, so that a
dashboard can render a list. Logs cost a fraction of that to write and nothing to read.

The deciding question: **does any contract need this list?** No — only the frontend does,
and the frontend can query logs. On-chain enumeration would be paying for a capability
nobody uses.

**Consequence:** this only works because the events emit `productIdPlain` alongside the
indexed `productId`. Solidity stores an indexed dynamic type as its keccak256 hash, so
the indexed copy alone is unreadable. Discovering that was what made this design viable —
see the NatSpec on `ProductCreated` in `contracts/SupplyChain.sol`.

---

## ADR-6: Two contract instances in the frontend

**Decision: a wallet-free `JsonRpcProvider` instance for reads, a signer-bound instance
for writes.**

The original design built the contract only inside `connectWallet()`, which meant
verification required MetaMask. The target user for verification is a shopper, who will
not have a wallet — the headline feature was unusable by its intended audience.

Since `verifyProduct`, `getProduct` and `getProductHistory` are all `view`, they need no
signer and no gas. Splitting the instances makes verification work for anyone with a
browser. See `src/App.jsx`.

---

## ADR-7: Scan recording as a separate, non-view function

**Decision: `verifyProduct` stays `view` and free; `recordScan` is a separate paid call.**

Clone detection needs a trace of who checked what. But making verification itself cost
gas would price out the shopper the feature exists for, and require them to hold ETH.

Splitting it keeps reading free and makes contributing an observation optional. In
production the caller would be a retailer's POS terminal or a brand's verified scanning
app — parties who already transact — not the shopper.

`recordScan` is deliberately **unrestricted by role**: clone detection is worth less if
only insiders can contribute observations. The cost is that the counter can be inflated
by anyone willing to pay gas, which is an accepted weakness in a heuristic signal that
was never meant to be authoritative.

---

## Summary of accepted compromises

| Decision | Gained | Given up |
|---|---|---|
| Public chain | Permissionless consumer verification | All confidentiality |
| Ethereum L1 | Tooling, reference environment | Economic viability at scale |
| Immutable | Credible audit trail | Any ability to patch bugs |
| Event-log enumeration | Much lower gas per registration | Cannot be read by other contracts |
| Single owner | Simplicity | Much of the decentralisation argument |
| Free reads, paid scans | Shoppers verify at no cost | Scan counter is inflatable |

The last row of column three is the one that matters most, and
[THREAT-MODEL.md](THREAT-MODEL.md) says what would fix it.
