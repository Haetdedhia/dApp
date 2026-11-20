import { useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { QrCode, Download, Zap } from 'lucide-react';
import TxStatus from '../components/TxStatus';
import useTransaction from '../lib/useTransaction';
import './CreateProduct.css';

/**
 * CreateProduct - lets an authorised Manufacturer register a new item.
 *
 * Form on the left, live QR panel on the right. The QR is the most useful
 * artifact this screen produces, so it gets permanent space rather than
 * appearing below the fold after submission.
 */
function CreateProduct({ contract, userRole }) {
  const [productId, setProductId] = useState('');
  const [name, setName] = useState('');
  const [batchNumber, setBatchNumber] = useState('');

  const [verifyUrl, setVerifyUrl] = useState('');
  const [savedProductId, setSavedProductId] = useState('');

  const tx = useTransaction();

  const handleCreateProduct = async (e) => {
    e.preventDefault();
    if (!contract) return;

    const ok = await tx.run(() => contract.createProduct(productId, name, batchNumber));
    if (!ok) return;

    setVerifyUrl(`${window.location.origin}/verify/${productId}`);
    setSavedProductId(productId);

    setProductId('');
    setName('');
    setBatchNumber('');
  };

  /**
   * handleDownloadQR - serialises the rendered SVG into a canvas and triggers a
   * PNG download. Reading the DOM node directly avoids the CORS/taint problems
   * that come with converting an <img>-wrapped SVG.
   */
  const handleDownloadQR = () => {
    const svg = document.getElementById('product-qr-code');
    if (!svg) return;

    const svgData = new XMLSerializer().serializeToString(svg);
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const img = new Image();

    img.onload = () => {
      canvas.width = 512;
      canvas.height = 512;
      ctx.fillStyle = '#ffffff'; // QR readers need a light quiet zone
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, 512, 512);

      const downloadLink = document.createElement('a');
      downloadLink.download = `QR-${savedProductId || 'product'}.png`;
      downloadLink.href = canvas.toDataURL('image/png');
      downloadLink.click();
    };

    img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgData)));
  };

  if (userRole !== 1) {
    return (
      <div className="form-page">
        <div className="form-shell">
          <div className="gate">
            <h1>Manufacturers only</h1>
            <p>
              Registering a product is restricted to wallets holding the Manufacturer role. The
              contract enforces this regardless of what the interface shows.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="form-page">
      <div className="form-shell form-shell-wide">
        <header className="form-head">
          <h1>Register a product</h1>
          <p>Creates the on-chain record and issues a QR code for the label.</p>
        </header>

        <div className="form-split">
          <form onSubmit={handleCreateProduct} className="form-card">
            <div className="form-group">
              <label htmlFor="productId" className="field-label">
                Product ID
              </label>
              <input
                type="text"
                id="productId"
                className="input input-mono"
                placeholder="MED-2026-005"
                value={productId}
                onChange={(e) => setProductId(e.target.value)}
                required
              />
              <p className="field-hint">
                Unique across the whole registry. This is what the QR code encodes.
              </p>
            </div>

            <div className="form-group">
              <label htmlFor="name" className="field-label">
                Product name
              </label>
              <input
                type="text"
                id="name"
                className="input"
                placeholder="Paracetamol 500 mg"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>

            <div className="form-group">
              <label htmlFor="batchNumber" className="field-label">
                Batch / lot number
              </label>
              <input
                type="text"
                id="batchNumber"
                className="input input-mono"
                placeholder="BATCH-77E1"
                value={batchNumber}
                onChange={(e) => setBatchNumber(e.target.value)}
                required
              />
            </div>

            <div className="form-footer">
              <div className="gas-note">
                <Zap size={14} strokeWidth={2} aria-hidden="true" />
                <span>Costs gas · roughly 168,000 units</span>
              </div>
              <button type="submit" className="btn btn-primary" disabled={tx.busy}>
                {tx.busy ? (
                  <>
                    <span className="spinner" aria-hidden="true" />
                    {tx.status === 'signing' ? 'Confirm in wallet' : 'Registering'}
                  </>
                ) : (
                  'Register product'
                )}
              </button>
            </div>

            <TxStatus
              status={tx.status}
              hash={tx.hash}
              error={tx.error}
              successMessage={`Registered ${savedProductId}`}
            />
          </form>

          <aside className="qr-panel">
            <h2>Label QR code</h2>
            <p className="qr-sub">
              {verifyUrl ? 'Print this on the product label.' : 'Appears once the product is registered.'}
            </p>

            {verifyUrl ? (
              <>
                <div className="qr-frame">
                  <QRCodeSVG
                    id="product-qr-code"
                    value={verifyUrl}
                    size={240}
                    level="H"
                    includeMargin
                  />
                </div>
                <p className="qr-url mono">{verifyUrl}</p>
                {verifyUrl.includes('localhost') && (
                  <p className="qr-warning">
                    This points at <strong>localhost</strong>, which a phone cannot reach. To scan
                    from a phone on the same Wi-Fi, reopen the app using the Network address Vite
                    printed, then register again.
                  </p>
                )}
                <button type="button" className="btn btn-secondary qr-download" onClick={handleDownloadQR}>
                  <Download size={15} strokeWidth={2} aria-hidden="true" />
                  Download PNG
                </button>
              </>
            ) : (
              <>
                <div className="qr-frame qr-empty">
                  <QrCode size={38} strokeWidth={1.6} aria-hidden="true" />
                  <p>Fill in the fields and register to generate a scannable code.</p>
                </div>
                <button type="button" className="btn btn-secondary qr-download" disabled>
                  <Download size={15} strokeWidth={2} aria-hidden="true" />
                  Download PNG
                </button>
              </>
            )}
          </aside>
        </div>
      </div>
    </div>
  );
}

export default CreateProduct;
