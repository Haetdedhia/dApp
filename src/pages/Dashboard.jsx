import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import deployment from '../contracts/contract-address.json';
import './Dashboard.css';

const STATUS_LABELS = ['Manufactured', 'DistributorReceived', 'RetailerReceived', 'Sold'];

/**
 * Dashboard - lists every product ever registered.
 *
 * DESIGN NOTE: the product list is rebuilt from ProductCreated event LOGS rather
 * than from an on-chain array. The alternative would be a `string[] productIds`
 * in the contract with a getter, but pushing to that array would add storage
 * cost to every single registration (roughly 20k gas for the slot, more for a
 * long string). Logs are far cheaper to write and completely free to read, and
 * nothing here needs to be queried by another contract. Paying for on-chain
 * enumeration would buy us nothing.
 *
 * This only works because the contract emits `productIdPlain` alongside the
 * indexed `productId`. An indexed string is stored in the log topic as a keccak
 * hash, so the indexed copy alone cannot be read back.
 */
function Dashboard({ readContract }) {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');

  const loadProducts = useCallback(async () => {
    if (!readContract) return;

    try {
      setLoading(true);
      setError('');

      // Start from the deployment block. Scanning from genesis is wasteful
      // locally and some public RPC providers reject wide ranges outright.
      const fromBlock = deployment.deploymentBlock ?? 0;
      const events = await readContract.queryFilter(
        readContract.filters.ProductCreated(),
        fromBlock,
        'latest'
      );

      // The log gives us registration-time data only. Current status and owner
      // have to come from a state read, since they change after creation.
      const rows = await Promise.all(
        events.map(async (event) => {
          const id = event.args.productIdPlain;
          try {
            const product = await readContract.getProduct(id);
            return {
              productId: id,
              name: product.name,
              batchNumber: product.batchNumber,
              manufacturer: product.manufacturer,
              currentOwner: product.currentOwner,
              status: STATUS_LABELS[Number(product.status)],
              createdAt: new Date(Number(event.args.timestamp) * 1000).toLocaleString()
            };
          } catch (err) {
            console.error(`Could not load product ${id}:`, err);
            return null;
          }
        })
      );

      setProducts(rows.filter(Boolean).reverse()); // newest first
    } catch (err) {
      console.error(err);
      setError(`Could not load products: ${err.reason || err.message}`);
    } finally {
      setLoading(false);
    }
  }, [readContract]);

  useEffect(() => {
    loadProducts();
  }, [loadProducts]);

  const visible =
    statusFilter === 'All' ? products : products.filter((p) => p.status === statusFilter);

  const shorten = (addr) => `${addr.substring(0, 6)}...${addr.substring(addr.length - 4)}`;

  return (
    <div className="dashboard-container">
      <div className="dashboard-card">
        <div className="dashboard-header">
          <div>
            <h2>Product Registry</h2>
            <p className="subtitle">
              Every product on the ledger, rebuilt from on-chain event logs.
            </p>
          </div>
          <button type="button" className="refresh-btn" onClick={loadProducts} disabled={loading}>
            {loading ? 'Loading...' : 'Refresh'}
          </button>
        </div>

        <div className="dashboard-filters">
          {['All', ...STATUS_LABELS].map((label) => (
            <button
              key={label}
              type="button"
              className={`filter-chip ${statusFilter === label ? 'active' : ''}`}
              onClick={() => setStatusFilter(label)}
            >
              {label}
              {label !== 'All' && (
                <span className="filter-count">
                  {products.filter((p) => p.status === label).length}
                </span>
              )}
            </button>
          ))}
        </div>

        {error && <div className="status-box error">{error}</div>}

        {!loading && !error && products.length === 0 && (
          <div className="status-box info">
            No products registered yet. A Manufacturer can add one from the Create Product page.
          </div>
        )}

        {visible.length > 0 && (
          <div className="table-wrapper">
            <table className="product-table">
              <thead>
                <tr>
                  <th>Product ID</th>
                  <th>Name</th>
                  <th>Batch</th>
                  <th>Status</th>
                  <th>Current Owner</th>
                  <th>Registered</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {visible.map((product) => (
                  <tr key={product.productId}>
                    <td className="mono">{product.productId}</td>
                    <td>{product.name}</td>
                    <td>{product.batchNumber}</td>
                    <td>
                      <span className={`status-pill status-${product.status.toLowerCase()}`}>
                        {product.status}
                      </span>
                    </td>
                    <td className="mono" title={product.currentOwner}>
                      {shorten(product.currentOwner)}
                    </td>
                    <td>{product.createdAt}</td>
                    <td>
                      <Link className="row-link" to={`/verify/${product.productId}`}>
                        Verify
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

export default Dashboard;
