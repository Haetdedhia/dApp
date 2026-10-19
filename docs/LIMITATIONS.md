# Limitations

What this system cannot do. Read this before the README's feature list, because every
claim there is bounded by something here.

---

## 1. The oracle problem: records, not objects

This is the fundamental limitation, and it is not solvable on-chain.

A blockchain can guarantee that a **record** is authentic, unaltered, and written by an
authorised party. It cannot guarantee anything about a **physical object** in someone's
hand. The link between the two is a QR code, and a QR code is just a number printed on a
box.

**The attack:** a counterfeiter buys one genuine product, photographs its label, and
prints the code onto 10,000 fakes. Every one of those fakes resolves to a real,
manufacturer-registered, cryptographically sound blockchain record. The chain has no way
to tell them apart, because from its perspective nothing is wrong — the record it was
asked about genuinely exists.

**Why the app no longer claims otherwise.** The verification result is deliberately
phrased as a statement about the record:

> "A genuine blockchain record exists for this ID."

not "Product verified." The UI shows an explicit note that a matching record does not
prove physical authenticity. `verifyProduct` in `contracts/SupplyChain.sol` carries the
same warning in its NatSpec. Overclaiming here would mislead exactly the people the
feature exists to protect.

**What we do instead: make cloning visible.** `recordScan` tracks how many times each ID
has been checked, and the verify page flags suspicious patterns — most usefully, heavy
scanning of an item already marked `Sold`, since the genuine article has left the chain
by then. Thresholds live in `src/pages/VerifyProduct.jsx` so they can be tuned without a
redeploy.

This detects cloning after the fact. It does not prevent it.

**What a production system would need**, none of which is implemented here:

| Mitigation | What it adds |
|---|---|
| NFC/RFID with challenge-response | The tag holds a secret and signs a fresh nonce, so it cannot be photocopied |
| Tamper-evident physical seals | Shifts trust to a physical property rather than a readable number |
| One-time scan tokens | Each label valid for a single verification; reuse is proof of copying |
| Geographic anomaly detection | Same ID scanned in Mumbai and Toronto within an hour |

Only the last of these is even partially approached by the current scan counter.

---

## 2. Garbage in, garbage forever

The contract enforces *who* may write and *in what order*. It does not and cannot
validate that what they wrote is true.

A manufacturer with a valid role can register a product that does not exist, misstate a
batch number, or register genuine-looking records for counterfeit goods they are
themselves producing. The chain faithfully preserves the lie, and immutability means it
preserves it permanently.

Blockchain moves the trust problem; it does not remove it. Here it reduces to: *do you
trust whoever holds the Manufacturer role?* The system's value is that this trust is
**narrow and auditable** — you know exactly which address made each claim and when — not
that it is eliminated.

---

## 3. Centralisation

A single `owner` address:

- assigns and revokes every role
- can override any product's custody via `adminReassignCustody`
- can pause the entire system
- cannot be replaced if the key is lost

This is a meaningful compromise of the decentralisation the project otherwise argues for.
Each individual power exists for a defensible reason (documented in
[THREAT-MODEL.md](THREAT-MODEL.md)), but together they mean the system is only as
trustworthy as one private key. See [ARCHITECTURE-DECISIONS.md](ARCHITECTURE-DECISIONS.md)
for why this was accepted and what would replace it.

---

## 4. Everything is public

All data is world-readable: which manufacturers supply which distributors, how many units
move, how fast, and when. In a real supply chain this is commercially sensitive —
competitors could infer volumes, relationships and demand patterns from the public ledger.

This is a genuine argument for a permissioned chain such as Hyperledger Fabric over a
public one, discussed in [ARCHITECTURE-DECISIONS.md](ARCHITECTURE-DECISIONS.md).

---

## 5. The supply chain model is simplified

Real supply chains are graphs. This one is a four-step line.

- **No branching.** One manufacturer → one distributor → one retailer. Real goods pass
  through multiple distributors, warehouses and customs.
- **No batch hierarchy.** `batchNumber` is stored and displayed but drives no logic. You
  cannot query a batch, split it into units, or recall it. For pharmaceuticals — which the
  sample data imitates — batch-level recall is a legal requirement.
- **No returns or reversals.** The state machine only moves forward. A customer return or
  a rejected shipment cannot be represented.
- **No condition monitoring.** The sample data includes Insulin Glargine, a cold-chain
  product that is ruined above 8°C. Nothing records temperature, so a product could be
  destroyed in transit and still verify as perfect.

---

## 6. Operational limits

- **Cost.** `createProduct` is roughly 255,000 gas (see [GAS-ANALYSIS.md](GAS-ANALYSIS.md)).
  At real mainnet prices, registering individual consumer goods is not economic. This is
  why L2s or a permissioned chain matter for production.
- **Unbounded history.** `getProductHistory` returns an array that grows without limit.
  A product with thousands of entries could exceed the gas limit for an on-chain caller.
- **Immutable.** No proxy pattern, so a discovered bug cannot be patched — only paused.
- **Timestamps.** `block.timestamp` is influenceable by a validator within a few seconds.
  Immaterial for supply chain events measured in hours, but worth stating.

---

## Summary

The honest claim this project can make is:

> An auditable, tamper-evident, multi-party record of custody, where every claim is
> attributable to a known address and no participant can silently rewrite history.

The claim it **cannot** make is:

> This proves the product in your hand is genuine.

Most of the gap between those two sentences is physical, not computational, and no amount
of Solidity closes it.
