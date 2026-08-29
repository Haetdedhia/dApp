import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import './VerifyProduct.css';

function VerifyProduct({ contract }) {
  const { productId: routeProductId } = useParams();
  const [productId, setProductId] = useState(routeProductId || '');
  const [productData, setProductData] = useState(null);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');

  const handleVerify = async (e) => {
    e.preventDefault();
    if (!contract) {
      setStatusMessage('Contract not available');
      return;
    }

    try {
      setLoading(true);
      setStatusMessage('Verifying product...');

      const result = await contract.verifyProduct(productId);
      if (!result.exists) {
        setStatusMessage(result.message);
        setProductData(null);
        setHistory([]);
        return;
      }

      const product = await contract.getProduct(productId);
      const productHistory = await contract.getProductHistory(productId);

      setProductData({
        productId: product.productId,
        name: product.name,
        batchNumber: product.batchNumber,
        manufacturer: product.manufacturer,
        currentOwner: product.currentOwner,
        status: ['Manufactured', 'DistributorReceived', 'RetailerReceived', 'Sold'][product.status],
        manufacturedDate: new Date(Number(product.manufacturedDate) * 1000).toLocaleString()
      });

      const historyFormatted = productHistory.map((entry, idx) => ({
        index: idx,
        actor: entry.actor,
        status: ['Manufactured', 'DistributorReceived', 'RetailerReceived', 'Sold'][entry.status],
        timestamp: new Date(Number(entry.timestamp) * 1000).toLocaleString()
      }));
      setHistory(historyFormatted);
      setStatusMessage('Product verified successfully!');
    } catch (error) {
      console.error(error);
      setStatusMessage(`Error: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (routeProductId) {
      handleVerify({ preventDefault: () => {} });
    }
  }, [routeProductId, contract]);

  return (
    <div className="verify-container">
      <div className="verify-card">
        <h2>Verify Product</h2>
        <p className="subtitle">Scan a QR code or enter a Product ID to verify authenticity.</p>

        <form onSubmit={handleVerify} className="verify-form">
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
          <button type="submit" className="submit-btn" disabled={loading}>
            {loading ? 'Verifying...' : 'Verify Product'}
          </button>
        </form>

        {statusMessage && (
          <div className={`status-box ${statusMessage.includes('successfully') || statusMessage.includes('verified') ? 'success' : statusMessage.includes('not found') ? 'error' : 'info'}`}>
            {statusMessage}
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
                <span className={`value status-${productData.status.toLowerCase()}`}>{productData.status}</span>
              </div>
              <div className="detail-item">
                <span className="label">Manufactured Date:</span>
                <span className="value">{productData.manufacturedDate}</span>
              </div>
            </div>
          </div>
        )}

        {history.length > 0 && (
          <div className="product-history">
            <h3>Supply Chain History</h3>
            <div className="timeline">
              {history.map((entry, idx) => (
                <div key={idx} className="timeline-item">
                  <div className="timeline-marker"></div>
                  <div className="timeline-content">
                    <span className="status-badge">{entry.status}</span>
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
