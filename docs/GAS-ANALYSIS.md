# Gas Analysis

Measured optimisation of `contracts/SupplyChain.sol`. All figures produced by
`hardhat-gas-reporter` on Solidity 0.8.20, optimiser enabled, 200 runs, from
`npx hardhat test`. Every stage kept all 43 tests passing.

The interesting part of this study is that **the optimisation everyone reaches for first
barely helped, and the one that mattered was invisible until it was measured.**

---

## Headline result

| Operation | Before | After | Saved |
|---|---:|---:|---:|
| `createProduct` | 257,113 | **168,087** | −89,026 (−34.6%) |
| `transferToDistributor` | 93,406 | **71,852** | −21,554 (−23.1%) |
| `transferToRetailer` | 91,437 | **71,896** | −19,541 (−21.4%) |
| `markAsSold` | 88,649 | **66,071** | −22,578 (−25.5%) |
| `adminReassignCustody` | 89,622 | **67,147** | −22,475 (−25.1%) |

A full product lifecycle (register → distributor → retailer → sold) fell from
**530,605 to 377,906 gas, a 28.8% reduction.**

---

## Stage 1 — `memory` → `calldata` *(small win)*

External functions took `string memory` parameters, which copies the argument from
calldata into memory on entry. `calldata` reads it in place.

| Operation | Before | After | Saved |
|---|---:|---:|---:|
| `createProduct` | 257,113 | 256,398 | −715 |
| `transferToDistributor` | 93,406 | 92,624 | −782 |
| `markAsSold` | 88,649 | 87,867 | −782 |

**~750 gas per call, about 0.3%.** Free and correct, but nowhere near enough to matter.

Unexpectedly, deployment cost *rose* from 2,262,255 to 2,361,165 gas. Calldata parameter
handling generates slightly more code at each call site. Worth knowing: "cheaper per
call" and "cheaper to deploy" are not the same axis.

---

## Stage 2 — `require` strings → custom errors *(deployment win only)*

Nineteen `require` statements became eleven typed custom errors
(`UnauthorizedRole`, `ProductNotFound`, `UnexpectedStatus`, …).

| Metric | Before | After | Saved |
|---|---:|---:|---:|
| Deployment | 2,361,165 | 2,272,269 | −88,896 (−3.8%) |
| `createProduct` | 256,398 | 256,416 | +18 (noise) |

**Deployment got meaningfully cheaper; successful calls did not change at all.**

That is exactly what theory predicts and it is worth stating plainly: revert strings are
stored as raw UTF-8 in the deployed bytecode, so removing them shrinks the contract. But
a *successful* transaction never touches a revert path, so its gas is untouched. Custom
errors pay off in deployment size and in the cost of failing calls — not in the happy
path.

The larger benefit is not gas at all. `"Unauthorized: Invalid role"` tells a caller
nothing; `UnauthorizedRole(Manufacturer, Distributor)` tells them exactly what was
required and what they had.

---

## Stage 3 — Storage layout *(the win that mattered)*

Stages 1 and 2 together saved under 1% of execution gas. That prompted the obvious
question: **where is the 257,000 gas actually going?**

Writing a storage slot from zero costs 20,000 gas (`SSTORE`, cold, zero → non-zero).
Everything else here — arithmetic, comparisons, the role lookup — is in the tens or
hundreds. So the cost is essentially *the number of fresh slots written*, and nothing
else is close.

Counting the original `Product` struct:

```solidity
struct Product {
    string productId;          // duplicate of the mapping key
    string name;
    string batchNumber;
    address manufacturer;      // 20 bytes → own slot
    address currentOwner;      // 20 bytes → own slot
    Status status;             // 1 byte  → own slot
    uint256 manufacturedDate;  // 32 bytes → own slot
    bool exists;               // 1 byte  → own slot
}
```

Two problems:

**1. `productId` duplicated the mapping key.** Products are stored as
`mapping(string => Product)`. The key *is* the ID. Storing it again inside the struct
wrote an entire second copy of the string — for information the caller already had in
their hand when they made the call. `getProduct` now echoes the argument back instead.

**2. Nothing packed.** The compiler packs adjacent fields that fit together in 32 bytes,
but only if they are *adjacent*. Here a `uint256` sat between the small fields,
preventing any packing. Reordering:

```solidity
struct Product {
    string name;
    string batchNumber;
    address manufacturer;     // 20 ┐
    Status status;            //  1 ├─ 22 of 32 bytes → ONE slot
    bool exists;              //  1 ┘
    address currentOwner;     // 20 ┐
    uint64 manufacturedDate;  //  8 ┘─ 28 of 32 bytes → ONE slot
}
```

Four slots became two. `manufacturedDate` narrowed from `uint256` to `uint64`, which
overflows in the year 584,942,417,355.

The same applied to `HistoryEntry`, which is written on **every** lifecycle step:

```solidity
struct HistoryEntry {
    address actor;      // 20 ┐
    Status status;      //  1 ├─ 29 of 32 bytes → ONE slot (was two)
    uint64 timestamp;   //  8 ┘
}
```

### Result

| Operation | Stage 2 | Stage 3 | Saved |
|---|---:|---:|---:|
| `createProduct` | 256,416 | **168,087** | −88,329 (−34.4%) |
| `transferToDistributor` | 92,624 | **71,852** | −20,772 (−22.4%) |
| `transferToRetailer` | 90,655 | **71,896** | −18,759 (−20.7%) |
| `markAsSold` | 87,867 | **66,071** | −21,796 (−24.8%) |

The ~20,000 gas saved on each transfer is precisely one `SSTORE` — the second
`HistoryEntry` slot that no longer exists. The theory and the measurement agree to
within noise, which is the most satisfying part of the exercise.

---

## Side experiment — `string` vs `bytes32` identifiers

The received wisdom is that `bytes32` keys are much cheaper than `string`. To test that
without refactoring the whole contract, `contracts/experiments/IdentifierCost.sol`
isolates the variable: two minimal contracts storing an identical record, differing only
in identifier type. Measured by `test/GasComparison.test.js`:

| | `string` | `bytes32` | Difference |
|---|---:|---:|---:|
| `store()` | 90,845 | 89,669 | −1,176 (−1.3%) |
| Deployed bytecode | 1,906 B | 1,333 B | −573 B (−30.1%) |
| Deployment | 464,920 | 341,208 | −123,712 (−26.6%) |

**The received wisdom is only half right.** `bytes32` is dramatically cheaper to *deploy*
— 30% less bytecode, because dynamic-string handling generates a lot of code — but only
1.3% cheaper to *execute*, because a short string still occupies one storage slot just
like a `bytes32` does.

**Decision: keep `string`.** It saves 1,176 gas per registration, against which:

- `bytes32` caps IDs at 31 bytes, or forces `keccak256` and loses human readability.
- `encodeBytes32String` / `decodeBytes32String` conversion would be needed at every
  frontend boundary.
- IDs must be printable on labels and typeable by a user on the verify page.

Trading away readability across the entire stack for 0.7% of a registration is a bad
deal. Recorded here because the measurement is what justifies the choice — the original
`string` decision was a guess, and now it is an argued one.

---

## Reproducing

```bash
npx hardhat test
```

```bash
npx hardhat test test/GasComparison.test.js
```

Gas reporting is configured in `hardhat.config.js` under `gasReporter`.

---

## What is left on the table

- **Deployment is now 2,304,250 gas**, up from the 2,262,255 baseline, because packing
  logic and `calldata` handling add code. Execution is far cheaper and deployment happens
  once, so this is the right trade — but it is a trade, not a free win.
- `getProductHistory` returns an unbounded array (see
  [THREAT-MODEL.md](THREAT-MODEL.md#t7--unbounded-array-return)). Pagination would cap it.
- `name` and `batchNumber` are still dynamic strings, each costing a slot plus content.
  `bytes32` for `batchNumber` would be nearly free to adopt since it is never displayed
  as free text — worth roughly one slot per registration.
- At 168,087 gas, registration is still uneconomic on L1 for individual consumer goods.
  Optimisation narrows the gap; it does not close it. That is an architecture question,
  not a Solidity one — see
  [ARCHITECTURE-DECISIONS.md](ARCHITECTURE-DECISIONS.md#adr-3-ethereum-l1-vs-an-l2).

---

## Conclusion

A 28.8% reduction across a full product lifecycle, almost all of it from **storage layout
rather than from the micro-optimisations attempted first.**

The methodological lesson is the one worth keeping: `calldata` and custom errors are the
well-known advice and they bought under 1% of execution gas between them. The real cost
was structural — a duplicated field and four slots that should have been two — and it was
only findable by asking where the 257,000 gas was actually going, rather than by applying
a checklist.
