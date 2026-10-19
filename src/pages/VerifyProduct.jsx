import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { TriangleAlert } from 'lucide-react';
import QrScanner from '../components/QrScanner';
import './VerifyProduct.css';

const STATUS_LABELS = ['Manufactured', 'DistributorReceived', 'RetailerReceived', 'Sold'];

/**
 * Clone-detection heuristics.
 *
 * These are deliberately crude. A genuine item is checked a handful of times as it
 * moves along one route; a cloned label is the same ID printed many times, so the
 * scans pile up far beyond what one physical object would attract. Scanning activity
 * after an item is already Sold is the stronger signal of the two, because the
 * genuine article has left the chain.
 *
 * A production system would weigh geography, timing and velocity rather than a flat
 * count. Thresholds live here, not in the contract, so they can be tuned without a
 * redeploy - the contract's job is to record the observations, not to judge them.
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
 * a supply chain participant, and will almost never have MetaMask installed.
 * Every call this page makes is a `view`, so no wallet and no gas are needed.
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
   * This matters: the ID can arrive from three places (the route, the text box,
   * or the camera) and reading it from state meant a route change could verify
   * the previous product. Passing it in removes that whole class of bug.
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
        setStatusMessage('Verifying against the blockchain...');
        setStatusKind('info');

        const [exists, message] = await readContract.verifyProduct(id);

        if (requestId !== activeRequest.current) return; // superseded

        if (!exists) {
          setStatusMessage(message);
          setStatusKind('error');
          setProductData(null);
          setHistory([]);
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
          manufacturedDate: new Date(Number(product.manufacturedDate) * 1000).toLocaleString()
        });

        setHistory(
          productHistory.map((entry, idx) => ({
            index: idx,
            actor: entry.actor,
            status: STATUS_LABELS[Number(entry.status)],
            timestamp: new Date(Number(entry.timestamp) * 1000).toLocaleString()
          }))
        );

        // Phrased as a claim about the RECORD, not the physical product. See the
        // disclaimer rendered below the details, and docs/LIMITATIONS.md.
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
   * handleRecordScan - contributes this check to the on-chain scan tally.
   *
   * Costs gas, so it is optional and only offered to users with a wallet. In
   * production this would be a retailer's POS terminal or a brand's verified
   * scanning app, not a shopper tapping a button.
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

  const anomaly = productData && scanCount !== null
    ? assessScanAnomaly(productData.status, scanCount)
    : null;

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

  return (
    <div className="verify-container">
      <div className="verify-card">
        <h2>Verify Product</h2>
        <p className="subtitle">
          Scan a QR code or enter a Product ID. No wallet required.
        </p>

        <form onSubmit={handleSubmit} className="verify-form">
          <div className="form-group">
            <label htmlFor="productId">Product ID</label>
            <input
              type="text"
              id="productId"
              placeholder="Enter Product ID (e.g., MED-2026-001)"
              value={productId}
              onChange={(e) => setProductId(e.target.value)}
              required
            />
          </div>

          <div className="verify-actions">
            <button type="submit" className="submit-btn" disabled={loading}>
              {loading ? 'Verifying...' : 'Verify Product'}
            </button>
            <button
              type="button"
              className="scan-btn"
              onClick={() => setScannerOpen((open) => !open)}
            >
              {scannerOpen ? 'Close Camera' : 'Scan with Camera'}
            </button>
          </div>
        </form>

        {/* Mounted only on demand, so the camera permission prompt never
            appears just from visiting the page. */}
        {scannerOpen && (
          <QrScanner onScan={handleScan} onClose={() => setScannerOpen(false)} />
        )}

        {statusMessage && <div className={`status-box ${statusKind}`}>{statusMessage}</div>}

        {/* The honest caveat. A matching record proves the ID was registered by an
            authorised manufacturer. It cannot prove the object in your hand is the
            one that record describes - QR codes are copyable. */}
        {productData && (
          <div className="verify-disclaimer">
            <strong>What this does and does not prove.</strong> A record for this ID was
            registered on-chain by an authorised manufacturer and has not been altered
            since. It does <em>not</em> prove the physical item you are holding is that
            product &mdash; a printed code can be copied. Treat this as one signal
            alongside packaging, price and seller.
          </div>
        )}

        {anomaly && (
          <div className="scan-anomaly" role="alert">
            <TriangleAlert className="scan-anomaly-icon" size={18} strokeWidth={2} aria-hidden="true" />
            <span>
              <strong>Possible cloned label.</strong> {anomaly}
            </span>
          </div>
        )}

        {productData && (
          <div className="product-details">
            <h3>Product Details</h3>
            <div className="details-grid">
              <div className="detail-item">
                <span className="label">Product ID:</span>
                <span className="value">{productData.productId}</span>
              </div>
              <div className="detail-item">
                <span className="label">Product Name:</span>
                <span className="value">{productData.name}</span>
              </div>
              <div className="detail-item">
                <span className="label">Batch Number:</span>
                <span className="value">{productData.batchNumber}</span>
              </div>
              <div className="detail-item">
                <span className="label">Manufacturer:</span>
                <span className="value address">{productData.manufacturer}</span>
              </div>
              <div className="detail-item">
                <span className="label">Current Owner:</span>
                <span className="value address">{productData.currentOwner}</span>
              </div>
              <div className="detail-item">
                <span className="label">Current Status:</span>
                <span className={`value status-${productData.status.toLowerCase()}`}>
                  {productData.status}
                </span>
              </div>
              <div className="detail-item">
                <span className="label">Manufactured Date:</span>
                <span className="value">{productData.manufacturedDate}</span>
              </div>
              <div className="detail-item">
                <span className="label">Recorded Scans:</span>
                <span className="value">{scanCount ?? '—'}</span>
              </div>
            </div>

            <div className="scan-record">
              {contract ? (
                <>
                  <button
                    type="button"
                    className="record-scan-btn"
                    onClick={handleRecordScan}
                    disabled={recording}
                  >
                    {recording ? 'Recording...' : 'Record this scan on-chain'}
                  </button>
                  <p className="scan-record-hint">
                    Adds a data point used to spot copied labels. Costs gas.
                  </p>
                </>
              ) : (
                <p className="scan-record-hint">
                  Connect a wallet to contribute this check to the product&apos;s scan
                  history, which helps detect copied labels.
                </p>
              )}
            </div>
          </div>
        )}

        {history.length > 0 && (
          <div className="product-history">
            <h3>Supply Chain History</h3>
            <div className="timeline">
              {history.map((entry) => (
                <div key={entry.index} className="timeline-item">
                  <div className="timeline-marker"></div>
                  <div className="timeline-content">
                    {/* Stage class drives the colour, so the timeline reads
                        amber -> blue -> purple -> green as custody advances. */}
                    <span className={`status-badge status-${entry.status.toLowerCase()}`}>
                      {entry.status}
                    </span>
                    <p className="actor">{entry.actor}</p>
                    <p className="timestamp">{entry.timestamp}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default VerifyProduct;
