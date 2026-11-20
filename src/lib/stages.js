import { Factory, Truck, Store, Check } from 'lucide-react';

/**
 * Single source of truth for the four lifecycle stages.
 *
 * The array index IS the contract's Status enum value, so `STAGES[Number(status)]`
 * resolves directly from a contract read with no lookup table in between. Do not
 * reorder: the order mirrors `enum Status` in contracts/SupplyChain.sol.
 *
 * `contractName` is the raw enum name, kept because the existing tests and the
 * verify page's status classes are built from it. `label` is what a person reads.
 */
export const STAGES = [
  {
    contractName: 'Manufactured',
    label: 'Manufactured',
    shortLabel: 'Made',
    color: 'var(--stage-manufactured)',
    rgb: '245, 165, 36',
    icon: Factory,
    description: 'Registered by the manufacturer.'
  },
  {
    contractName: 'DistributorReceived',
    label: 'Distributor received',
    shortLabel: 'In transit',
    color: 'var(--stage-distributor)',
    rgb: '91, 157, 249',
    icon: Truck,
    description: 'Accepted by a verified distributor.'
  },
  {
    contractName: 'RetailerReceived',
    label: 'Retailer received',
    shortLabel: 'At retailer',
    color: 'var(--stage-retailer)',
    rgb: '177, 138, 249',
    icon: Store,
    description: 'Received into retail inventory.'
  },
  {
    contractName: 'Sold',
    label: 'Sold',
    shortLabel: 'Sold',
    color: 'var(--stage-sold)',
    rgb: '70, 208, 127',
    icon: Check,
    description: 'Lifecycle complete.'
  }
];

/** Resolve a contract status (BigInt, number or string) to its stage config. */
export function getStage(status) {
  return STAGES[Number(status)] ?? STAGES[0];
}

/** Kept for the existing status-* CSS class convention. */
export const STATUS_LABELS = STAGES.map((s) => s.contractName);

/** Shorten a 42-character hex address for display. Full value belongs in a title attribute. */
export function shortenAddress(address) {
  if (!address) return '';
  return `${address.substring(0, 6)}…${address.substring(address.length - 4)}`;
}
