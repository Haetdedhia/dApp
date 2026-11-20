import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import Dashboard from './Dashboard';

/**
 * Covers the master-detail behaviour, which is the most intricate piece of the
 * redesign and the one most likely to regress.
 */

const PRODUCTS = [
  { id: 'MED-2026-001', name: 'Paracetamol 500mg', batch: 'BATCH-77A9', status: 3n, scans: 8n },
  { id: 'MED-2026-002', name: 'Amoxicillin 250mg', batch: 'BATCH-77B2', status: 2n, scans: 0n },
  { id: 'MED-2026-003', name: 'Insulin Glargine', batch: 'BATCH-77C5', status: 1n, scans: 0n },
  { id: 'MED-2026-004', name: 'Ibuprofen 400mg', batch: 'BATCH-77D8', status: 0n, scans: 0n }
];

const ACTOR = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8';

function makeReadContract(products = PRODUCTS) {
  const find = (id) => products.find((p) => p.id === id);

  return {
    filters: { ProductCreated: () => ({}) },
    queryFilter: vi.fn().mockResolvedValue(
      products.map((p) => ({
        args: { productIdPlain: p.id, timestamp: 1760000000n }
      }))
    ),
    getProduct: vi.fn(async (id) => {
      const p = find(id);
      return {
        productId: p.id,
        name: p.name,
        batchNumber: p.batch,
        manufacturer: ACTOR,
        currentOwner: ACTOR,
        status: p.status,
        manufacturedDate: 1760000000n
      };
    }),
    getProductHistory: vi.fn(async (id) => {
      const p = find(id);
      return Array.from({ length: Number(p.status) + 1 }, (_, idx) => ({
        actor: ACTOR,
        status: BigInt(idx),
        timestamp: 1760000000n + BigInt(idx)
      }));
    }),
    getScanCount: vi.fn(async (id) => find(id).scans)
  };
}

function renderDashboard(readContract) {
  return render(
    <MemoryRouter>
      <Dashboard readContract={readContract} />
    </MemoryRouter>
  );
}

describe('Dashboard (registry)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('lists every product rebuilt from event logs', async () => {
    const readContract = makeReadContract();
    renderDashboard(readContract);

    await waitFor(() => {
      expect(screen.getByText('Paracetamol 500mg')).toBeInTheDocument();
    });

    // Scoped to the list: the selected product's name also appears in the
    // detail pane heading, so an unscoped query matches twice.
    const list = screen.getByRole('list', { name: 'Products' });
    for (const product of PRODUCTS) {
      expect(within(list).getByText(product.name)).toBeInTheDocument();
    }
    expect(readContract.queryFilter).toHaveBeenCalled();
  });

  it('selects the first product automatically so the detail pane is never empty', async () => {
    renderDashboard(makeReadContract());

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 2, name: 'Ibuprofen 400mg' })).toBeInTheDocument();
    });
  });

  it('swaps the detail pane when a different product is selected', async () => {
    const user = userEvent.setup();
    renderDashboard(makeReadContract());

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 2, name: 'Ibuprofen 400mg' })).toBeInTheDocument();
    });

    // Rows are ordered newest first, so Paracetamol (the oldest) is last.
    const rows = screen.getAllByRole('button', { current: undefined });
    const paracetamolRow = rows.find((r) => within(r).queryByText('Paracetamol 500mg'));
    await user.click(paracetamolRow);

    await waitFor(() => {
      expect(
        screen.getByRole('heading', { level: 2, name: 'Paracetamol 500mg' })
      ).toBeInTheDocument();
    });
  });

  it('filters the list by ID, name or batch', async () => {
    const user = userEvent.setup();
    renderDashboard(makeReadContract());

    await waitFor(() => expect(screen.getByText('Insulin Glargine')).toBeInTheDocument());

    await user.type(screen.getByLabelText(/search products/i), 'insulin');

    await waitFor(() => {
      expect(screen.queryByText('Paracetamol 500mg')).not.toBeInTheDocument();
    });
    expect(screen.getByText('Insulin Glargine')).toBeInTheDocument();
  });

  it('tells the user when a search matches nothing', async () => {
    const user = userEvent.setup();
    renderDashboard(makeReadContract());

    await waitFor(() => expect(screen.getByText('Insulin Glargine')).toBeInTheDocument());
    await user.type(screen.getByLabelText(/search products/i), 'zzzzz');

    await waitFor(() => {
      expect(screen.getByText(/no products match/i)).toBeInTheDocument();
    });
  });

  it('flags a sold product that is still being checked', async () => {
    renderDashboard(makeReadContract());

    await waitFor(() => expect(screen.getByText('Paracetamol 500mg')).toBeInTheDocument());

    // 8 checks on an already-Sold item is the clone signal.
    expect(screen.getByText(/1 flagged/i)).toBeInTheDocument();
  });

  it('shows an empty state rather than a blank page when nothing is registered', async () => {
    renderDashboard(makeReadContract([]));

    await waitFor(() => {
      expect(screen.getByText(/no products registered yet/i)).toBeInTheDocument();
    });
  });

  it('surfaces a load failure instead of silently showing nothing', async () => {
    const readContract = makeReadContract();
    readContract.queryFilter.mockRejectedValue(new Error('RPC unreachable'));

    renderDashboard(readContract);

    await waitFor(() => {
      expect(screen.getByText(/RPC unreachable/i)).toBeInTheDocument();
    });
  });

  it('renders nothing but stays stable when the contract is not ready', () => {
    renderDashboard(null);
    expect(screen.getByRole('heading', { level: 1, name: /product registry/i })).toBeInTheDocument();
  });
});
