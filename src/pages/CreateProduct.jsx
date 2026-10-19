import { useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import './CreateProduct.css';

/**
 * CreateProduct Page Component
 * Allows authorized Manufacturers to register new items onto the supply chain contract ledger.
 * Renders a dynamic form, triggers blockchain writes, and generates high-resolution QR codes
 * corresponding to verification endpoints for downstream scanning.
 *
 * @param {Object} props
 * @param {ethers.Contract} props.contract - Configured Ethers contract target instance
 * @param {string} props.account - Connected wallet hex address of user
 * @param {number} props.userRole - Indexed role indicator of current wallet context (1 = Manufacturer)
 */
function CreateProduct({ contract, account, userRole }) {
  // --- FORM STATE HOOKS ---
  const [productId, setProductId] = useState('');
  const [name, setName] = useState('');
  const [batchNumber, setBatchNumber] = useState('');
  // Loading status control representing pending web3 transactions
  const [loading, setLoading] = useState(false);
  // Status feedback styling content showing action completion or network failures
  const [statusMessage, setStatusMessage] = useState('');

  // --- QR CODE UTILITIES ---
  // verifyUrl: string indicating the exact subpage endpoint for verify queries (e.g. /verify/MED-101)
  const [verifyUrl, setVerifyUrl] = useState('');
  // cached product identifier used during QR image extraction download naming
  const [savedProductId, setSavedProductId] = useState('');

  /**
   * handleCreateProduct - Handles submission of the registration form.
   * Performs safety checks, fires the contract state-modifying createProduct transaction,
   * awaits block confirmation, and renders success QR generation parameters.
   */
  const handleCreateProduct = async (e) => {
    e.preventDefault();
    if (!contract) {
      setStatusMessage('Please connect your wallet first.');
      return;
    }
    // Hard authorization verification check block (Manufacturer role validation required)
    if (userRole !== 1) {
      setStatusMessage('Unauthorized: Only Manufacturers can create products.');
      return;
    }

    try {
      setLoading(true);
      setStatusMessage('Sending blockchain transaction...');

      // Call createProduct() on Smart Contract. Returns transaction receipt context.
      const tx = await contract.createProduct(productId, name, batchNumber);
      setStatusMessage('Transaction submitted. Awaiting confirmation...');

      // Wait for the transaction to be mined in a block by Ethereum miners
      await tx.wait();

      setStatusMessage(`Product "${name}" successfully registered under ID: ${productId}`);
      // Build routing parameter URL pointing to the decentralized lookup page
      setVerifyUrl(`${window.location.origin}/verify/${productId}`);
      setSavedProductId(productId);

      // Reset form variables
      setProductId('');
      setName('');
      setBatchNumber('');
    } catch (error) {
      console.error(error);
      // Fallback details logic parses errors returned from ethers RPC
      setStatusMessage(`Error: ${error.reason || error.message || 'Transaction failed'}`);
    } finally {
      setLoading(false);
    }
  };

  /**
   * handleDownloadQR - Custom browser canvas serialization bypass tool.
   * Resolves CORS profile errors caused by canvas blob conversion failures in React
   * by reading the DOM SVG node directly, serializing to base64, drawing into a virtual canvas,
   * and initiating a file download trigger.
   */
  const handleDownloadQR = () => {
    // Locate the QRCodeSVG node in DOM tree
    const svg = document.getElementById('product-qr-code');
    if (!svg) return;

    // Serialize XML elements to string content
    const svgData = new XMLSerializer().serializeToString(svg);
    // Instantiate offscreen canvas node
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const img = new Image();

    // Trigger canvas draw and stream transfer when image wrapper load fires
    img.onload = () => {
      canvas.width = 256;
      canvas.height = 256;
      ctx.fillStyle = '#ffffff'; // White background fills outline parameters
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, 256, 256);

      // Extract image content from canvas elements as a data-URI PNG stream
      const pngFile = canvas.toDataURL('image/png');
      const downloadLink = document.createElement('a');
      downloadLink.download = `QR-${savedProductId || 'product'}.png`;
      downloadLink.href = pngFile;

      // Trigger user side download
      downloadLink.click();
    };

    // Encode source SVG bytes onto Image loader parameters
    img.src = 'data:image/svg+xml;base64,' + btoa(svgData);
  };

  // --- ACCESS CONTROL SPLIT RENDER ---
  // Renders access denied window early if user does not hold Manufacturer permissions
  if (userRole !== 1) {
    return (
      <div className="create-container">
        <div className="create-card error-card">
          <h2>Access Denied</h2>
          <p>This action is reserved exclusively for registered Manufacturers.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="create-container">
      <div className="create-card">
        <h2>Register New Product</h2>
        <p className="subtitle">Create a verified digital twin on the blockchain.</p>
        <form onSubmit={handleCreateProduct} className="create-form">
          <div className="form-group">
            <label htmlFor="productId">Product ID / SKU</label>
            <input type="text" id="productId" placeholder="e.g. MED-2026-001" value={productId} onChange={(e) => setProductId(e.target.value)} required />
          </div>
          <div className="form-group">
            <label htmlFor="name">Product Name</label>
            <input type="text" id="name" placeholder="e.g. Premium Antibiotics Batch A" value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div className="form-group">
            <label htmlFor="batchNumber">Batch Number</label>
            <input type="text" id="batchNumber" placeholder="e.g. BATCH-77A9" value={batchNumber} onChange={(e) => setBatchNumber(e.target.value)} required />
          </div>
          <button type="submit" className="submit-btn" disabled={loading}>
            {loading ? 'Registering...' : 'Register Product'}
          </button>
        </form>

        {/* Status messages rendering */}
        {statusMessage && (
          <div className={`status-box ${statusMessage.startsWith('Error') ? 'error' : 'success'}`}>
            {statusMessage}
          </div>
        )}

        {/* Render QR component and download button once verifyUrl targets exist */}
        {verifyUrl && (
          <div className="qr-box">
            <h3>QR Code Generated</h3>
            <div className="qr-image-wrapper">
              <QRCodeSVG
                id="product-qr-code"
                value={verifyUrl}
                size={256}
                level="H" // High error correction configuration handles physical wrapper scratches
                includeMargin={true}
              />
            </div>
            <p className="qr-info">Scan to verify authenticity on the blockchain.</p>
            <p className="qr-url">{verifyUrl}</p>
            {verifyUrl.includes('localhost') && (
              <p className="qr-warning">
                This QR points at <strong>localhost</strong>, which a phone cannot reach.
                To scan it from a phone on the same Wi-Fi, reopen this app using the
                Network address Vite printed in the terminal (e.g. http://192.168.x.x:5173)
                and register the product again.
              </p>
            )}
            <button className="download-btn" onClick={handleDownloadQR}>
              Download QR Code
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default CreateProduct;
