# Security Analysis

Automated static analysis and test-coverage results for `contracts/SupplyChain.sol`.

For the manual adversarial analysis — who the attackers are and what they can do — see
[THREAT-MODEL.md](THREAT-MODEL.md). Automated tools find code-level defects; they cannot
find design-level ones, and the most serious weakness in this project (label cloning,
T1) is invisible to every tool below precisely because it is not a code defect.

---

## Static analysis — Slither 0.11.6

```bash
python -m slither . --compile-force-framework hardhat --exclude-dependencies
```

**Result: 26 findings across 102 detectors. Zero high severity, zero medium severity,
zero low severity.** All 26 are informational.

| Detector | Count | Severity | Assessment |
|---|---:|---|---|
| `naming-convention` | 25 | Informational | Not a defect — see below |
| `solc-version` | 1 | Informational | Not applicable — see below |

### What did *not* fire

More useful than the findings is the list of serious detectors that stayed silent:

- `reentrancy-eth`, `reentrancy-no-eth`, `reentrancy-benign`
- `arbitrary-send-eth`, `suicidal`, `controlled-delegatecall`
- `uninitialized-state`, `uninitialized-storage`, `uninitialized-local`
- `unchecked-transfer`, `unprotected-upgrade`
- `tx-origin`, `incorrect-equality`, `shadowing-state`
- `weak-prng`, `locked-ether`

The reentrancy family is silent for a structural reason, not a lucky one: the contract
makes no external calls, holds no ether, and has no `payable` functions. There is no
point at which control transfers to untrusted code mid-execution, so reentrancy is
impossible by construction rather than merely absent. Adding a `ReentrancyGuard` would
cost gas to defend against something that cannot occur — see
[THREAT-MODEL.md T9](THREAT-MODEL.md#t9--reentrancy-not-applicable).

### Finding 1 — `naming-convention` (25 occurrences)

Slither flags every `_productId`, `_account`, `_newOwner` and similar as "not in
mixedCase".

**Not fixed, deliberately.** The underscore prefix on function parameters is a long-
standing Solidity convention that distinguishes arguments from state variables and
prevents accidental shadowing. It is applied consistently across the whole contract.
Slither's preferred style is also valid; this is a disagreement about convention, not a
defect, and renaming 25 parameters to satisfy a linter would make the code less readable
to anyone who knows the ecosystem.

### Finding 2 — `solc-version`

Slither warns that `^0.8.20` has three known compiler issues:

| Issue | Applies here? |
|---|---|
| `VerbatimInvalidDeduplication` | **No** — requires Yul `verbatim`, which this contract does not use |
| `FullInlinerNonExpressionSplitArgumentEvaluationOrder` | **No** — requires side-effecting expressions as function arguments under the full inliner |
| `MissingSideEffectsOnSelectorAccess` | **No** — requires `.selector` on an expression with side effects; never used |

**Not applicable.** The warning is raised against the version pragma, not against any
observed code pattern. 0.8.20 was chosen for compatibility with OpenZeppelin Contracts
v5, which also targets it. All three issues are checked individually above rather than
dismissed as a group.

---

## Test coverage — solidity-coverage

```bash
npm run coverage
```

| File | % Statements | % Branches | % Functions | % Lines |
|---|---:|---:|---:|---:|
| **SupplyChain.sol** | **100** | **86.59** | **100** | **100** |

**50 passing tests.** Every statement, line and function in the production contract is
executed by the suite.

The 86.59% branch figure is the honest number and reflects two things:

1. **Compiler-generated branches.** Solidity inserts implicit checks (arithmetic
   overflow guards, the `uint64` downcast on `block.timestamp`) that cannot be driven to
   their failing side from a test — forcing the timestamp cast to overflow would require
   mining a block in the year 584 billion.
2. **Inherited modifier paths.** `onlyOwner` and `whenNotPaused` come from OpenZeppelin
   and carry their own branches, which are covered by OpenZeppelin's own test suite.

Reaching 100% branch coverage would mean writing tests for conditions that cannot occur,
which is a worse use of effort than the behavioural tests already present. The branches
that represent *reachable* states — every role check, status guard, custody check,
recovery path, and both sides of every validation — are covered.

Getting here required adding tests for the `Status.Manufactured` and
`Status.RetailerReceived` recovery branches of `adminReassignCustody`, which coverage
identified as unreached. That is the measurement doing its job: those were real,
reachable paths with no test behind them, and the report is what surfaced them.

---

## Reproducing

```bash
pip install slither-analyzer
```

```bash
python -m slither . --compile-force-framework hardhat --exclude-dependencies
```

```bash
npm run coverage
```

On Windows, Slither needs `--compile-force-framework hardhat` because it otherwise looks
for a standalone `solc` binary, which Hardhat does not install on the system path. The
HTML coverage report is written to `coverage/index.html`.

---

## Limits of this analysis

Static analysis and coverage establish that the code does what it was written to do, with
no known vulnerability patterns. Neither says anything about whether *what it was written
to do* is the right thing.

The most serious weakness in this system — that a cloned QR label verifies exactly like a
genuine one — produces no Slither finding and would not reduce coverage by a single line.
The code behaves perfectly; the design cannot distinguish the two cases. Tools do not find
that class of problem, which is why [THREAT-MODEL.md](THREAT-MODEL.md) and
[LIMITATIONS.md](LIMITATIONS.md) exist alongside this document and matter more than it
does.
