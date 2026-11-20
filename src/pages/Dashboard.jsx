import { useState, useEffect, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { RefreshCw, Search, ArrowUpRight, TriangleAlert, ArrowLeft } from 'lucide-react';
import deployment from '../contracts/contract-address.json';
import { STAGES, STATUS_LABELS, getStage, shortenAddress } from '../lib/stages';
import useCountUp from '../lib/useCountUp';
import './Dashboard.css';

/**
 * Dashboard - the product registry.
 *
 * DESIGN NOTE: the product list is rebuilt from ProductCreated event LOGS rather
 * than from an on-chain array. The alternative would be a `string[] productIds`
 * in the contract with a getter, but pushing to that array would add storage
 * cost to every single registration (roughly 20k gas for the slot, more for a
 * long string). Logs are far cheaper to write and completely free to read, and
 * nothing here needs to be queried by another contract.
 *
 * This only works because the contract emits `productIdPlain` alongside the
 * indexed `productId`. An indexed string is stored in the log topic as a keccak
 * hash, so the indexed copy alone cannot be read back.
 *
 * LAYOUT: master-detail. The list selects, the panel inspects. Below 900px the
 * two panes become a drill-down, because side-by-side at phone width gives both
 * panes too little room to be useful.
 */
function Dashboard({ readContract }) {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState(null);
  const [detailOpenOnMobile, setDetailOpenOnMobile] = useState(false);

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

      // The log gives registration-time data only. Current status, holder,
      // history and scan count all change after creation, so they come from
      // state reads.
      const rows = await Promise.all(
        events.map(async (event) => {
          const id = event.args.productIdPlain;
          try {
            const [product, history, scans] = await Promise.all([
              readContract.getProduct(id),
              readContract.getProductHistory(id),
              readContract.getScanCount(id)
            ]);

            return {
              productId: id,
              name: product.name,
              batchNumber: product.batchNumber,
              manufacturer: product.manufacturer,
              currentOwner: product.currentOwner,
              statusIndex: Number(product.status),
              status: STATUS_LABELS[Number(product.status)],
              scanCount: Number(scans),
              createdAt: new Date(Number(event.args.timestamp) * 1000),
              history: history.map((entry, idx) => ({
                index: idx,
                actor: entry.actor,
                statusIndex: Number(entry.status),
                timestamp: new Date(Number(entry.timestamp) * 1000)
              }))
            };
          } catch (err) {
            console.error(`Could not load product ${id}:`, err);
            return null;
          }
        })
      );

      const loaded = rows.filter(Boolean).reverse(); // newest first
      setProducts(loaded);
      setSelectedId((current) =>
        current && loaded.some((p) => p.productId === current)
          ? current
          : (loaded[0]?.productId ?? null)
      );
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

  const stats = useMemo(() => {
    const byStage = STAGES.map(
      (_, idx) => products.filter((p) => p.statusIndex === idx).length
    );
    return {
      total: products.length,
      inTransit: byStage[1] + byStage[2],
      complete: byStage[3],
      scans: products.reduce((sum, p) => sum + p.scanCount, 0),
      flagged: products.filter((p) => p.statusIndex === 3 && p.scanCount > 5).length,
      byStage
    };
  }, [products]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return products;
    return products.filter(
      (p) =>
        p.productId.toLowerCase().includes(q) ||
        p.name.toLowerCase().includes(q) ||
        p.batchNumber.toLowerCase().includes(q)
    );
  }, [products, query]);

  const selected = products.find((p) => p.productId === selectedId) ?? null;

  const handleSelect = (productId) => {
    setSelectedId(productId);
    setDetailOpenOnMobile(true);
  };

  // Count-ups animate from zero on arrival; they settle instantly under
  // prefers-reduced-motion.
  const totalDisplay = useCountUp(stats.total, loading);
  const transitDisplay = useCountUp(stats.inTransit, loading);
  const completeDisplay = useCountUp(stats.complete, loading);
  const scansDisplay = useCountUp(stats.scans, loading);

  return (
    <div className="registry-page">
      <div className="registry-shell">
        <header className="registry-head">
          <div>
            <h1>Product registry</h1>
            <p>Rebuilt from on-chain event logs. No off-chain index.</p>
          </div>
          <button
            type="button"
            className="btn btn-secondary registry-refresh"
            onClick={loadProducts}
            disabled={loading}
          >
            <RefreshCw size={15} strokeWidth={2} aria-hidden="true" />
            {loading ? 'Loading' : 'Refresh'}
          </button>
        </header>

        <div className="kpi-strip">
          <div className="kpi kpi-primary">
            <div className="kpi-label">Products registered</div>
            <div className="kpi-value mono">{totalDisplay}</div>
          </div>
          <div className="kpi">
            <div className="kpi-label">In transit</div>
            <div className="kpi-value mono">{transitDisplay}</div>
          </div>
          <div className="kpi">
            <div className="kpi-label">Lifecycle complete</div>
            <div className="kpi-value mono">{completeDisplay}</div>
          </div>
          <div className="kpi">
            <div className="kpi-label">Verification checks</div>
            <div className="kpi-value-row">
              <span className="kpi-value mono">{scansDisplay}</span>
              {stats.flagged > 0 && (
                <span className="kpi-flag">
                  {stats.flagged} flagged
                </span>
              )}
            </div>
          </div>
        </div>

        {products.length > 0 && (
          <section className="stage-bar-card" aria-label="Stage distribution">
            <div className="stage-bar-head">
              <h2>Stage distribution</h2>
              <span className="mono stage-bar-total">{stats.total} products</span>
            </div>
            <div className="stage-bar">
              {STAGES.map((stage, idx) => {
                const count = stats.byStage[idx];
                if (count === 0) return null;
                return (
                  <span
                    key={stage.contractName}
                    className="stage-bar-seg"
                    style={{ flex: count, background: stage.color }}
                  />
                );
              })}
            </div>
            <div className="stage-legend">
              {STAGES.map((stage, idx) => (
                <span key={stage.contractName} className="stage-legend-item">
                  <span className="stage-dot" style={{ background: stage.color }} />
                  {stage.shortLabel} <strong>{stats.byStage[idx]}</strong>
                </span>
              ))}
            </div>
          </section>
        )}

        {error && (
          <div className="alert alert-warning" role="alert">
            <TriangleAlert size={19} strokeWidth={2} aria-hidden="true" />
            <div>
              <h3>Could not load the registry</h3>
              <p>{error}</p>
            </div>
          </div>
        )}

        {loading && (
          <div className="registry-skeleton" aria-busy="true">
            <span className="sr-only">Loading the registry…</span>
            <div className="skeleton" style={{ height: 340, borderRadius: 'var(--r-xl)' }} />
            <div className="skeleton" style={{ height: 340, borderRadius: 'var(--r-xl)' }} />
          </div>
        )}

        {!loading && !error && products.length === 0 && (
          <div className="empty-state">
            <h2>No products registered yet</h2>
            <p>
              A manufacturer can add the first one from the{' '}
              <Link to="/create">Register</Link> page.
            </p>
          </div>
        )}

        {!loading && products.length > 0 && (
          <div className={`registry-split ${detailOpenOnMobile ? 'detail-open' : ''}`}>
            <div className="registry-list-pane">
              <div className="registry-search">
                <Search size={16} strokeWidth={2} aria-hidden="true" />
                <label htmlFor="registry-q" className="sr-only">
                  Search products
                </label>
                <input
                  id="registry-q"
                  type="text"
                  className="input"
                  placeholder="Search ID, name or batch"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </div>

              {visible.length === 0 ? (
                <p className="registry-no-match">
                  No products match &ldquo;{query}&rdquo;.
                </p>
              ) : (
                <ul className="registry-list" aria-label="Products">
                  {visible.map((product) => {
                    const stage = getStage(product.statusIndex);
                    const StageIcon = stage.icon;
                    const isActive = product.productId === selectedId;

                    return (
                      <li key={product.productId}>
                        <button
                          type="button"
                          className={`registry-row ${isActive ? 'active' : ''}`}
                          aria-current={isActive ? 'true' : undefined}
                          onClick={() => handleSelect(product.productId)}
                        >
                          <div className="registry-row-top">
                            <span className="mono registry-row-id">{product.productId}</span>
                            <span
                              className="chip chip-sm"
                              style={{ '--chip': stage.color, '--chip-rgb': stage.rgb }}
                            >
                              <StageIcon size={11} strokeWidth={2.4} aria-hidden="true" />
                              {stage.shortLabel}
                            </span>
                          </div>
                          <div className="registry-row-name">{product.name}</div>
                          <div className="registry-row-foot">
                            <span className="mono">{product.batchNumber}</span>
                            <span>{product.createdAt.toLocaleDateString()}</span>
                          </div>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            {selected && (
              <div className="registry-detail-pane">
                <button
                  type="button"
                  className="btn btn-secondary registry-back"
                  onClick={() => setDetailOpenOnMobile(false)}
                >
                  <ArrowLeft size={15} strokeWidth={2} aria-hidden="true" />
                  All products
                </button>

                <div className="registry-detail-head">
                  <div>
                    <div className="mono registry-detail-id">{selected.productId}</div>
                    <h2>{selected.name}</h2>
                  </div>
                  <Link to={`/verify/${selected.productId}`} className="btn btn-primary registry-public">
                    Public page
                    <ArrowUpRight size={15} strokeWidth={2.4} aria-hidden="true" />
                  </Link>
                </div>

                <div className="registry-detail-grid">
                  <div className="detail-block">
                    <div className="detail-label">Batch</div>
                    <div className="detail-value mono">{selected.batchNumber}</div>
                  </div>
                  <div className="detail-block">
                    <div className="detail-label">Registered</div>
                    <div className="detail-value">{selected.createdAt.toLocaleDateString()}</div>
                  </div>
                  <div className="detail-block">
                    <div className="detail-label">Checks</div>
                    <div
                      className="detail-value"
                      style={{
                        color:
                          selected.statusIndex === 3 && selected.scanCount > 5
                            ? 'var(--warning)'
                            : undefined
                      }}
                    >
                      {selected.scanCount}
                    </div>
                  </div>
                </div>

                <h3 className="registry-detail-sub">Chain of custody</h3>
                <ol className="timeline timeline-compact">
                  {selected.history.map((entry, idx) => {
                    const stage = getStage(entry.statusIndex);
                    const isLast = idx === selected.history.length - 1;
                    return (
                      <li
                        key={entry.index}
                        className="timeline-item"
                        style={{
                          '--stage': stage.color,
                          '--stage-rgb': stage.rgb,
                          '--delay': `${idx * 70}ms`
                        }}
                      >
                        <div className="timeline-rail">
                          <span className="timeline-dot" />
                          {!isLast && <span className="timeline-line" />}
                        </div>
                        <div className="timeline-content">
                          <div className="timeline-row">
                            <span className="timeline-stage">{stage.label}</span>
                            <span className="mono timeline-time" title={entry.actor}>
                              {shortenAddress(entry.actor)} ·{' '}
                              {entry.timestamp.toLocaleTimeString()}
                            </span>
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ol>

                {selected.statusIndex === 3 && selected.scanCount > 5 && (
                  <div className="alert alert-warning" role="alert">
                    <TriangleAlert size={17} strokeWidth={2} aria-hidden="true" />
                    <div>
                      <p>
                        Sold, yet checked {selected.scanCount} times since. Consistent with a copied
                        label.
                      </p>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default Dashboard;
