# Threat Model

Adversaries considered, attacks analysed, and what was done about each. Where a risk is
accepted rather than mitigated, that is stated explicitly.

---

## Adversaries

| Adversary | Capability | Goal |
|---|---|---|
| **Counterfeiter (external)** | No roles. Can read the chain, copy labels, print packaging | Pass fakes off as genuine |
| **Malicious insider** | Holds a legitimate Manufacturer / Distributor / Retailer role | Sabotage a competitor, falsify records, squat identifiers |
| **Compromised owner** | Holds the deployer key, by theft or coercion | Seize control of the registry |
| **Curious competitor** | No roles, reads public chain data | Infer trade relationships and volumes |

---

## T1 — Label cloning *(not mitigated; detection only)*

**Severity: High.** The central weakness.

An external counterfeiter copies a genuine QR code onto any number of fakes. Each one
verifies successfully, because the record it points at is real.

**Mitigation:** none possible on-chain. See [LIMITATIONS.md](LIMITATIONS.md#1-the-oracle-problem-records-not-objects).

**What was done:** `recordScan` / `scanCount` make cloning *visible* through scan-pattern
anomalies, and the UI wording was changed so it never claims physical authenticity.
Detection, not prevention.

---

## T2 — Product ID squatting / front-running *(accepted, documented)*

**Severity: Medium.** A real finding.

`createProduct` claims IDs from a single global namespace on a first-come basis:

```solidity
require(!products[_productId].exists, "Product already exists");
```

Two consequences:

1. **Accidental collision.** Two manufacturers using similar SKU schemes collide, and
   the loser can never register that ID.
2. **Deliberate front-running.** A transaction sits in the public mempool before it is
   mined. An insider holding the Manufacturer role can watch for a competitor's
   `createProduct`, copy the ID, and resubmit with higher gas. Their transaction lands
   first and the competitor's reverts. In a consortium of competing manufacturers —
   exactly the setting this system targets — that adversary is realistic.

**Mitigation available:** key products on `keccak256(abi.encodePacked(msg.sender, _productId))`
so each manufacturer owns a private namespace, making cross-manufacturer squatting
impossible by construction. A commit-reveal scheme would additionally hide the ID until
it is claimed.

**Status: accepted, not fixed.** The change touches the contract's core data model and
every frontend consumer of it. It is recorded here rather than silently left out.

---

## T3 — Owner key compromise *(accepted)*

**Severity: High.**

Whoever holds the deployer key can assign themselves every role, override any product's
custody via `adminReassignCustody`, and pause the system. There is no multi-sig, no
timelock, and no recovery path. If the key is **lost** rather than stolen, no role can
ever be assigned again and the registry ossifies.

**Mitigation available:** a Gnosis Safe multi-sig as owner, or OpenZeppelin
`AccessControl` with a separate admin role per function and a timelock on sensitive
operations.

**Status: accepted** for a single-developer academic project. In production this would be
the first thing to change.

---

## T4 — Administrative custody override *(accepted by design)*

**Severity: Medium.**

`adminReassignCustody` lets the owner move any product to any address at any time, which
could be used to falsify a custody trail.

**Why it exists:** without it, revoking the role of an address that currently holds a
product deadlocks that product permanently — every pipeline function requires both an
exact role match *and* current custody, so neither the old holder nor anyone else can
move it. This is tested in `test/SupplyChain.test.js` under "Admin Custody Recovery".

**Trade-off accepted:** permanent loss of goods is worse than a trusted recovery path.
Made auditable by a distinct `CustodyReassigned` event, deliberately separate from
`ProductTransferred`, so an administrative intervention can never be mistaken for a
normal movement when auditing the logs.

---

## T5 — Emergency pause abuse *(partially mitigated)*

**Severity: Low.**

The owner can halt all supply chain operations unilaterally, a denial of service against
every participant.

**Mitigation:** read paths are deliberately **never** pausable. `verifyProduct`,
`getProduct` and `getProductHistory` work while paused, so a compromised or careless
owner cannot blind consumers or hide the current state. Tested under "Emergency Pause".

The ability to freeze writes is accepted as the price of having any containment at all in
a non-upgradeable contract.

---

## T6 — Confidentiality *(accepted)*

**Severity: Medium in production, low academically.**

Every trade relationship, transfer time and volume is world-readable. A competitor can
reconstruct who supplies whom and infer demand.

**Mitigation available:** a permissioned chain (Hyperledger Fabric) with channel-level
data isolation, or storing commitments on-chain and details off-chain, or zero-knowledge
proofs of custody. See [ARCHITECTURE-DECISIONS.md](ARCHITECTURE-DECISIONS.md).

**Status: accepted.** Public verifiability was prioritised over confidentiality, which is
the right call for consumer-facing anti-counterfeiting and the wrong one for enterprise
logistics.

---

## T7 — Unbounded array return *(accepted)*

**Severity: Low.**

`getProductHistory` returns an array with no upper bound. Entries accrue on every state
change and every admin reassignment, so a product cycled repeatedly could grow a history
large enough to exhaust gas for an on-chain caller.

Harmless for off-chain callers, which is the only consumer today — `eth_call` has no
meaningful gas constraint. Paginated access (`getHistorySlice(id, offset, limit)`) would
fix it if another contract ever needed to read this.

---

## T8 — Timestamp dependence *(accepted, immaterial)*

**Severity: Negligible.**

`block.timestamp` is used for all event times and can be nudged by a validator within a
few seconds. No logic branches on it — it is recorded, never compared — and supply chain
events are measured in hours. Noted for completeness.

---

## T9 — Reentrancy *(not applicable)*

**Analysed and ruled out.** The contract makes no external calls, holds no ether, and has
no `payable` functions, so there is no point at which control transfers to untrusted code
mid-execution. The checks-effects-interactions pattern is moot where there are no
interactions. No `ReentrancyGuard` is needed, and adding one would cost gas for nothing.

Stated explicitly because "we didn't find any reentrancy" and "there cannot be any
reentrancy" are different claims, and this is the second.

---

## T10 — Integer overflow *(not applicable)*

Solidity 0.8.20 reverts on overflow by default. `scanCount` is the only unbounded
counter and would need 2²⁵⁶ scans to wrap.

---

## Summary

| ID | Threat | Severity | Status |
|---|---|---|---|
| T1 | Label cloning | High | Detection only — unsolvable on-chain |
| T2 | ID squatting / front-running | Medium | Accepted, fix documented |
| T3 | Owner key compromise | High | Accepted — multi-sig needed in production |
| T4 | Custody override | Medium | By design, audited via distinct event |
| T5 | Pause abuse | Low | Mitigated — reads never pausable |
| T6 | Confidentiality | Medium | Accepted — public verifiability prioritised |
| T7 | Unbounded array | Low | Accepted — off-chain callers unaffected |
| T8 | Timestamp dependence | Negligible | Accepted |
| T9 | Reentrancy | — | Not applicable by construction |
| T10 | Overflow | — | Not applicable (Solidity ≥0.8) |

The two findings worth the most attention are **T1**, which bounds what the project can
honestly claim, and **T3**, which bounds how decentralised it actually is.
