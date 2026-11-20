import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { TriangleAlert, Check, ScanLine, Eye, Clock } from 'lucide-react';
import QrScanner from '../components/QrScanner';
import { STAGES, STATUS_LABELS, getStage } from '../lib/stages';
import './VerifyProduct.css';

/**
 * Clone-detection heuristics.
 *
 * Deliberately crude. A genuine item is checked a handful of times as it moves
 * along one route; a cloned label is the same ID printed many times, so checks
 * pile up far beyond what one physical object attracts. Activity after an item
 * is already Sold is the stronger of the two signals, because the genuine
 * article has left the chain by then.
 *
 * Thresholds live here rather than in the contract so they can be tuned without
 * a redeploy — the contract's job is to record observations, not judge them.
 */
const SCAN_LIMIT_AFTER_SALE = 5;
const SCAN_LIMIT_IN_TRANSIT = 20;

function assessScanAnomaly(status, scanCount) {
  if (status === 'Sold' && scanCount > SCAN_LIMIT_AFTER_SALE) {
    return `This item was already marked Sold, yet its code has been checked ${scanCount} times. That pattern is consistent with a copied label.`;
  }
  if (scanCount > SCAN_LIMIT_IN_TRANSIT) {
    return `This code has been checked ${scanCount} times, which is unusually high for a single item. The label may have been copied.`;
  }
  return null;
}

/**
 * VerifyProduct - the public, consumer-facing page.
 *
 * Takes `readContract` (a wallet-free JsonRpcProvider instance) rather than the
 * signer-bound contract, because the person scanning a QR code is a shopper, not
 * a supply chain participant, and will rarely have MetaMask installed. Every
 * call this page makes is a `view`, so no wallet and no gas are needed.
 *
 * `contract` is optional and only enables recording a scan, which costs gas.
 */
function VerifyProduct({ readContract, contract }) {
  const { productId: routeProductId } = useParams();

  const [productId, setProductId] = useState(routeProductId || '');
  const [productData, setProductData] = useState(null);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [statusKind, setStatusKind] = useState('info');
  const [scannerOpen, setScannerOpen] = useState(false);
  const [scanCount, setScanCount] = useState(null);
  const [recording, setRecording] = useState(false);

  // Guards against a late-returning lookup overwriting a newer one.
  const activeRequest = useRef(0);

  /**
   * verify - takes the ID as an argument rather than reading component state.
   *
   * The ID can arrive from three places (the route, the text box, or the camera)
   * and reading it from state meant a route change could verify the previous
   * product. Passing it in removes that whole class of bug.
   */
  const verify = useCallback(
    async (idToVerify) => {
      const id = (idToVerify || '').trim();
      if (!id) return;

      if (!readContract) {
        setStatusMessage('Still connecting to the blockchain. Please try again in a moment.');
        setStatusKind('info');
        return;
      }

      const requestId = ++activeRequest.current;

      try {
        setLoading(true);
        setStatusMessage('');
        setProductData(null);
        setHistory([]);

        const [exists, message] = await readContract.verifyProduct(id);

        if (requestId !== activeRequest.current) return; // superseded

        if (!exists) {
          setStatusMessage(message);
          setStatusKind('error');
          setScanCount(null);
          return;
        }

        const product = await readContract.getProduct(id);
        const productHistory = await readContract.getProductHistory(id);
        const scans = await readContract.getScanCount(id);

        if (requestId !== activeRequest.current) return; // superseded

        setScanCount(Number(scans));

        setProductData({
          productId: product.productId,
          name: product.name,
          batchNumber: product.batchNumber,
          manufacturer: product.manufacturer,
          currentOwner: product.currentOwner,
          status: STATUS_LABELS[Number(product.status)],
          statusIndex: Number(product.status),
          manufacturedDate: new Date(Number(product.manufacturedDate) * 1000).toLocaleString()
        });

        setHistory(
          productHistory.map((entry, idx) => ({
            index: idx,
            actor: entry.actor,
            statusIndex: Number(entry.status),
            status: STATUS_LABELS[Number(entry.status)],
            timestamp: new Date(Number(entry.timestamp) * 1000).toLocaleString()
          }))
        );

        // Phrased as a claim about the RECORD, not the physical product.
        setStatusMessage(message);
        setStatusKind('success');
      } catch (error) {
        if (requestId !== activeRequest.current) return;
        console.error(error);
        setStatusMessage(`Error: ${error.reason || error.message || 'Lookup failed'}`);
        setStatusKind('error');
        setProductData(null);
        setHistory([]);
        setScanCount(null);
      } finally {
        if (requestId === activeRequest.current) setLoading(false);
      }
    },
    [readContract]
  );

  // Keep the input in sync when the route changes. A useState initial value only
  // applies on mount, so without this, navigating /verify/A -> /verify/B would
  // leave the old ID in state and verify the wrong product.
  useEffect(() => {
    if (routeProductId) setProductId(routeProductId);
  }, [routeProductId]);

  // Auto-verify when arriving via a scanned QR link, and retry once the
  // read-only contract finishes initialising.
  useEffect(() => {
    if (routeProductId && readContract) verify(routeProductId);
  }, [routeProductId, readContract, verify]);

  const handleSubmit = (e) => {
    e.preventDefault();
    verify(productId);
  };

  /**
   * handleRecordScan - contributes this check to the on-chain tally.
   *
   * Costs gas, so it is optional and only offered to users with a wallet. In
   * production the caller would be a retailer's POS terminal or a brand's
   * verified scanning app, not a shopper tapping a button.
   */
  const handleRecordScan = async () => {
    if (!contract || !productData) return;

    try {
      setRecording(true);
      const tx = await contract.recordScan(productData.productId);
      await tx.wait();

      const updated = await readContract.getScanCount(productData.productId);
      setScanCount(Number(updated));
    } catch (error) {
      console.error(error);
      setStatusMessage(`Error: ${error.reason || error.message || 'Could not record scan'}`);
      setStatusKind('error');
    } finally {
      setRecording(false);
    }
  };

  /**
   * handleScan - a scanned QR encodes a full URL like https://host/verify/MED-001,
   * but a user could also point the camera at a bare ID. Handle both.
   */
  const handleScan = (decodedText) => {
    setScannerOpen(false);

    let scannedId = decodedText.trim();
    try {
      const url = new URL(decodedText);
      const parts = url.pathname.split('/').filter(Boolean);
      const verifyIndex = parts.indexOf('verify');
      if (verifyIndex !== -1 && parts[verifyIndex + 1]) {
        scannedId = decodeURIComponent(parts[verifyIndex + 1]);
      }
    } catch {
      // Not a URL, so treat the decoded text as the raw product ID.
    }

    setProductId(scannedId);
    verify(scannedId);
  };

  const anomaly =
    productData && scanCount !== null ? assessScanAnomaly(productData.status, scanCount) : null;

  const stage = productData ? getStage(productData.statusIndex) : null;
  const StageIcon = stage?.icon;
  const notFound = statusKind === 'error' && !productData && statusMessage;

  return (
    <div className="verify-page">
      <div className="verify-shell">
        <header className="verify-head">
          <h1>Verify Product</h1>
          <p>Enter the ID printed on the label, or scan the code.</p>
        </header>

        <form onSubmit={handleSubmit} className="verify-search">
          <label htmlFor="productId" className="sr-only">
            Product ID
          </label>
          <input
            type="text"
            id="productId"
            className="input input-mono verify-input"
            placeholder="Enter a product ID, e.g. MED-2026-001"
            value={productId}
            onChange={(e) => setProductId(e.target.value)}
            required
          />
          <button type="submit" className="btn btn-primary" disabled={loading}>
            {loading ? (
              <>
                <span className="spinner" aria-hidden="true" />
                Checking
              </>
            ) : (
              'Verify'
            )}
          </button>
          <button
            type="button"
            className="btn btn-secondary verify-scan-btn"
            aria-label={scannerOpen ? 'Close camera scanner' : 'Scan QR code with camera'}
            onClick={() => setScannerOpen((open) => !open)}
          >
            <ScanLine size={18} strokeWidth={1.9} aria-hidden="true" />
          </button>
        </form>

        <p className="verify-subnote">Reading the chain is free and needs no wallet.</p>

        {/* Mounted only on demand, so the camera permission prompt never appears
            just from visiting the page. */}
        {scannerOpen && <QrScanner onScan={handleScan} onClose={() => setScannerOpen(false)} />}

        {loading && (
          <div className="verify-skeleton" aria-live="polite" aria-busy="true">
            <span className="sr-only">Checking the blockchain…</span>
            <div className="skeleton" style={{ height: 180, borderRadius: 'var(--r-2xl)' }} />
            <div className="skeleton" style={{ height: 220, borderRadius: 'var(--r-xl)' }} />
          </div>
        )}

        {notFound && !loading && (
          <section className="verdict verdict-absent" aria-live="polite">
            <div className="verdict-eyebrow">
              <TriangleAlert size={17} strokeWidth={2.4} aria-hidden="true" />
              <span>No record</span>
            </div>
            <p className="verdict-word mono">NOT FOUND</p>
            <p className="verdict-body">{statusMessage}</p>
          </section>
        )}

        {productData && !loading && (
          <>
            <section className="verdict verdict-present" aria-live="polite">
              <div className="verdict-eyebrow">
                <Check size={17} strokeWidth={2.6} aria-hidden="true" />
                <span>Record found</span>
              </div>

              <p className="verdict-word mono">VERIFIED</p>

              {/* The contract owns this wording, deliberately. verifyProduct's
                  return string is phrased as a claim about the RECORD, and
                  restating it here would let the two drift apart. */}
              <p className="verdict-body">{statusMessage}</p>

              <div className="verdict-chips">
                <span className="chip" style={{ '--chip': stage.color, '--chip-rgb': stage.rgb }}>
                  <StageIcon size={13} strokeWidth={2.4} aria-hidden="true" />
                  {stage.label}
                </span>
                <span
                  className="chip"
                  style={{
                    '--chip': anomaly ? 'var(--warning)' : 'var(--text-secondary)',
                    '--chip-rgb': anomaly ? '245, 165, 36' : '167, 176, 186'
                  }}
                >
                  <Eye size={13} strokeWidth={2.2} aria-hidden="true" />
                  {scanCount} {scanCount === 1 ? 'check' : 'checks'} recorded
                </span>
                <span
                  className="chip"
                  style={{ '--chip': 'var(--text-secondary)', '--chip-rgb': '167, 176, 186' }}
                >
                  <Clock size={13} strokeWidth={2.2} aria-hidden="true" />
                  {history.length} custody {history.length === 1 ? 'event' : 'events'}
                </span>
              </div>
            </section>

            {anomaly && (
              <div className="alert alert-warning" role="alert">
                <TriangleAlert size={19} strokeWidth={2} aria-hidden="true" />
                <div>
                  <h3>Possible cloned label</h3>
                  <p>{anomaly}</p>
                </div>
              </div>
            )}

            <section className="detail-card">
              <h2 className="detail-title">{productData.name}</h2>

              <div className="detail-grid">
                <div className="detail-block">
                  <div className="detail-label">Product ID</div>
                  <div className="detail-value mono">{productData.productId}</div>
                </div>
                <div className="detail-block">
                  <div className="detail-label">Batch / lot</div>
                  <div className="detail-value mono">{productData.batchNumber}</div>
                </div>
                <div className="detail-block">
                  <div className="detail-label">Registered by</div>
                  <div className="detail-value detail-address mono">{productData.manufacturer}</div>
                </div>
                <div className="detail-block">
                  <div className="detail-label">Current holder</div>
                  <div className="detail-value detail-address mono">{productData.currentOwner}</div>
                </div>
                <div className="detail-block">
                  <div className="detail-label">Manufactured on</div>
                  <div className="detail-value">{productData.manufacturedDate}</div>
                </div>
                <div className="detail-block">
                  <div className="detail-label">Recorded checks</div>
                  <div className="detail-value" style={{ color: anomaly ? 'var(--warning)' : undefined }}>
                    {scanCount}
                  </div>
                </div>
              </div>

              <div className="scan-record">
                {contract ? (
                  <>
                    <button
                      type="button"
                      className="btn btn-secondary scan-record-btn"
                      onClick={handleRecordScan}
                      disabled={recording}
                    >
                      {recording ? (
                        <>
                          <span className="spinner" aria-hidden="true" />
                          Waiting for confirmation
                        </>
                      ) : (
                        'Record this scan on-chain'
                      )}
                    </button>
                    <p className="field-hint">
                      Adds a data point used to spot copied labels. Costs gas.
                    </p>
                  </>
                ) : (
                  <p className="field-hint">
                    Connect a wallet to contribute this check to the product&apos;s scan history,
                    which helps detect copied labels.
                  </p>
                )}
              </div>
            </section>

            {/* The honest caveat. A matching record proves the ID was registered by
                an authorised manufacturer. It cannot prove the object in your hand
                is the one that record describes — QR codes are copyable. */}
            <div className="disclaimer">
              <h3>What this does and does not prove</h3>
              <p>
                A record for this ID was registered on-chain by an authorised manufacturer and has
                not been altered since. It does <strong>not</strong> prove the physical item you are
                holding is that product &mdash; a printed code can be copied. Treat this as one
                signal alongside packaging, price and seller.
              </p>
            </div>

            {history.length > 0 && (
              <section className="custody">
                <div className="custody-head">
                  <h2>Chain of custody</h2>
                  <span className="mono custody-count">
                    {history.length} {history.length === 1 ? 'event' : 'events'}
                  </span>
                </div>

                <ol className="timeline">
                  {history.map((entry, idx) => {
                    const entryStage = getStage(entry.statusIndex);
                    const EntryIcon = entryStage.icon;
                    const isLast = idx === history.length - 1;

                    return (
                      <li
                        key={entry.index}
                        className="timeline-item"
                        style={{
                          '--stage': entryStage.color,
                          '--stage-rgb': entryStage.rgb,
                          // Each step enters just after the one above it, so the
                          // trail reads as drawing downward rather than appearing.
                          '--delay': `${160 + idx * 90}ms`
                        }}
                      >
                        <div className="timeline-rail">
                          <span className="timeline-marker">
                            <EntryIcon size={13} strokeWidth={2.2} aria-hidden="true" />
                          </span>
                          {!isLast && <span className="timeline-line" />}
                        </div>
                        <div className="timeline-content">
                          <div className="timeline-row">
                            <span className="timeline-stage">{entryStage.label}</span>
                            <span className="mono timeline-time">{entry.timestamp}</span>
                          </div>
                          <div className="mono timeline-actor" title={entry.actor}>
                            {entry.actor}
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ol>
              </section>
            )}
          </>
        )}

        {statusKind === 'info' && statusMessage && !loading && (
          <div className="alert alert-info" role="status">
            <p>{statusMessage}</p>
          </div>
        )}
      </div>
    </div>
  );
}

export default VerifyProduct;
