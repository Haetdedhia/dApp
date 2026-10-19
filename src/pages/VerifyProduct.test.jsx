import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route, Link } from 'react-router-dom';
import VerifyProduct from './VerifyProduct';

// The camera scanner needs getUserMedia, which jsdom does not provide, and it is
// not what these tests are about.
vi.mock('../components/QrScanner', () => ({
  default: () => <div data-testid="qr-scanner" />
}));

const SOLD = 3n;
const IN_TRANSIT = 1n;

/**
 * Builds a stand-in for the read-only ethers contract. Only the four methods
 * VerifyProduct calls are implemented, which keeps the test about the component's
 * behaviour rather than about ethers.
 */
function makeReadContract({ exists = true, status = IN_TRANSIT, scans = 0 } = {}) {
  return {
    verifyProduct: vi.fn().mockResolvedValue(
      exists
        ? [true, 'A genuine blockchain record exists for this ID.']
        : [false, 'No blockchain record found for this ID. This product may be counterfeit.']
    ),
    getProduct: vi.fn().mockResolvedValue({
      productId: 'MED-2026-001',
      name: 'Paracetamol 500mg',
      batchNumber: 'BATCH-77A9',
      manufacturer: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
      currentOwner: '0x90F79bf6EB2c4f870365E785982E1f101E93b906',
      status,
      manufacturedDate: 1760000000n
    }),
    getProductHistory: vi.fn().mockResolvedValue([
      { actor: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8', status: 0n, timestamp: 1760000000n }
    ]),
    getScanCount: vi.fn().mockResolvedValue(BigInt(scans))
  };
}

function renderAt(path, props) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/verify/:productId?" element={<VerifyProduct {...props} />} />
      </Routes>
    </MemoryRouter>
  );
}

describe('VerifyProduct', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('verifies automatically from a scanned QR URL, with no wallet', async () => {
    const readContract = makeReadContract();

    // Note: no `contract` prop at all - this is the wallet-free path a shopper hits.
    renderAt('/verify/MED-2026-001', { readContract });

    await waitFor(() => {
      expect(screen.getByText(/A genuine blockchain record exists/i)).toBeInTheDocument();
    });

    expect(screen.getByText('Paracetamol 500mg')).toBeInTheDocument();
    expect(screen.getByText('BATCH-77A9')).toBeInTheDocument();
    expect(readContract.verifyProduct).toHaveBeenCalledWith('MED-2026-001');
  });

  it('shows the counterfeit message for an unregistered ID', async () => {
    const readContract = makeReadContract({ exists: false });
    renderAt('/verify/FAKE-999', { readContract });

    await waitFor(() => {
      expect(screen.getByText(/may be counterfeit/i)).toBeInTheDocument();
    });

    // No details should leak through for a product that does not exist.
    expect(screen.queryByText('Paracetamol 500mg')).not.toBeInTheDocument();
    expect(readContract.getProduct).not.toHaveBeenCalled();
  });

  it('always shows the honest-claim disclaimer alongside a successful result', async () => {
    renderAt('/verify/MED-2026-001', { readContract: makeReadContract() });

    await waitFor(() => {
      expect(screen.getByText(/What this does and does not prove/i)).toBeInTheDocument();
    });

    // The wording must never claim the physical item is genuine. The sentence is
    // split across an <em>, so match on the container's full text content.
    const disclaimer = screen.getByText(/What this does and does not prove/i).closest('div');
    expect(disclaimer.textContent).toMatch(/does .*not.* prove the physical item you are holding/i);
    expect(disclaimer.textContent).toMatch(/a printed code can be copied/i);
  });

  it('flags a possible cloned label when a sold product keeps being scanned', async () => {
    renderAt('/verify/MED-2026-001', {
      readContract: makeReadContract({ status: SOLD, scans: 8 })
    });

    await waitFor(() => {
      expect(screen.getByText(/Possible cloned label/i)).toBeInTheDocument();
    });

    expect(screen.getByText(/already marked Sold/i)).toBeInTheDocument();
  });

  it('does not flag a product with normal scan activity', async () => {
    renderAt('/verify/MED-2026-001', {
      readContract: makeReadContract({ status: IN_TRANSIT, scans: 2 })
    });

    await waitFor(() => {
      expect(screen.getByText(/A genuine blockchain record exists/i)).toBeInTheDocument();
    });

    expect(screen.queryByText(/Possible cloned label/i)).not.toBeInTheDocument();
  });

  it('does not flag a sold product scanned only a few times', async () => {
    // Boundary: the after-sale threshold is 5, so 5 scans must stay quiet.
    renderAt('/verify/MED-2026-001', {
      readContract: makeReadContract({ status: SOLD, scans: 5 })
    });

    await waitFor(() => {
      expect(screen.getByText(/A genuine blockchain record exists/i)).toBeInTheDocument();
    });

    expect(screen.queryByText(/Possible cloned label/i)).not.toBeInTheDocument();
  });

  it('verifies the new ID when the route changes while mounted', async () => {
    // Regression test: useState initial values only apply on mount, so an earlier
    // version kept verifying the first ID after navigating to a second one.
    //
    // This must be a real in-app navigation. Re-rendering a MemoryRouter with
    // different initialEntries does nothing - those are read once on mount - and
    // a fresh render would remount the component, which is exactly the case that
    // never had the bug.
    const user = userEvent.setup();
    const readContract = makeReadContract();

    render(
      <MemoryRouter initialEntries={['/verify/MED-2026-001']}>
        <Link to="/verify/MED-2026-002">go to second</Link>
        <Routes>
          <Route
            path="/verify/:productId?"
            element={<VerifyProduct readContract={readContract} />}
          />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => expect(readContract.verifyProduct).toHaveBeenCalledWith('MED-2026-001'));

    await user.click(screen.getByRole('link', { name: /go to second/i }));

    await waitFor(() => expect(readContract.verifyProduct).toHaveBeenCalledWith('MED-2026-002'));

    // And the input reflects the new ID rather than the stale one.
    expect(screen.getByLabelText(/Product ID/i)).toHaveValue('MED-2026-002');
  });

  it('offers scan recording only when a wallet is connected', async () => {
    const readContract = makeReadContract();

    const { unmount } = renderAt('/verify/MED-2026-001', { readContract });
    await waitFor(() => expect(screen.getByText('Paracetamol 500mg')).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: /Record this scan/i })).not.toBeInTheDocument();
    expect(screen.getByText(/Connect a wallet to contribute/i)).toBeInTheDocument();
    unmount();

    const contract = { recordScan: vi.fn().mockResolvedValue({ wait: vi.fn() }) };
    renderAt('/verify/MED-2026-001', { readContract, contract });
    await waitFor(() => expect(screen.getByText('Paracetamol 500mg')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: /Record this scan/i })).toBeInTheDocument();
  });

  it('records a scan and refreshes the count', async () => {
    const user = userEvent.setup();
    const readContract = makeReadContract({ scans: 2 });
    const contract = { recordScan: vi.fn().mockResolvedValue({ wait: vi.fn().mockResolvedValue({}) }) };

    renderAt('/verify/MED-2026-001', { readContract, contract });
    await waitFor(() => expect(screen.getByText('Paracetamol 500mg')).toBeInTheDocument());

    readContract.getScanCount.mockResolvedValue(3n);
    await user.click(screen.getByRole('button', { name: /Record this scan/i }));

    await waitFor(() => {
      expect(contract.recordScan).toHaveBeenCalledWith('MED-2026-001');
    });
    await waitFor(() => expect(screen.getByText('3')).toBeInTheDocument());
  });

  it('waits rather than erroring when the contract is not ready yet', async () => {
    // readContract is null for a moment on first paint while the provider is built.
    renderAt('/verify/MED-2026-001', { readContract: null });

    expect(screen.getByRole('heading', { name: /Verify Product/i })).toBeInTheDocument();
    expect(screen.queryByText(/counterfeit/i)).not.toBeInTheDocument();
  });

  it('surfaces a contract error without rendering stale product data', async () => {
    const readContract = makeReadContract();
    readContract.getProduct.mockRejectedValue(new Error('network unreachable'));

    renderAt('/verify/MED-2026-001', { readContract });

    await waitFor(() => {
      expect(screen.getByText(/network unreachable/i)).toBeInTheDocument();
    });
    expect(screen.queryByText('Paracetamol 500mg')).not.toBeInTheDocument();
  });
});
