import { useState } from 'react';
import './TransferProduct.css';

function TransferProduct({ contract, account, userRole }) {
  const [productId, setProductId] = useState('');
  const [recipientAddress, setRecipientAddress] = useState('');
  const [loading, setLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');

  const handleTransfer = async (e) => {
    e.preventDefault();
    if (!contract) {
      setStatusMessage('Please connect your wallet first.');
      return;
    }

    try {
      setLoading(true);
      setStatusMessage('Sending blockchain transaction...');

      if (userRole === 1) {
        // Manufacturer transferring to Distributor
        const tx = await contract.transferToDistributor(productId, recipientAddress);
        await tx.wait();
        setStatusMessage('Product transferred to Distributor');
      } else if (userRole === 2) {
        // Distributor transferring to Retailer
        const tx = await contract.transferToRetailer(productId, recipientAddress);
        await tx.wait();
        setStatusMessage('Product transferred to Retailer');
      } else if (userRole === 3) {
        // Retailer marking as sold
        const tx = await contract.markAsSold(productId);
        await tx.wait();
        setStatusMessage('Product marked as Sold');
      }

      setProductId('');
      setRecipientAddress('');
    } catch (error) {
      console.error(error);
      setStatusMessage(`Error: ${error.reason || error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const getRoleAction = () => {
    if (userRole === 1) return 'Transfer to Distributor';
    if (userRole === 2) return 'Transfer to Retailer';
    if (userRole === 3) return 'Mark as Sold';
    return 'Invalid Role';
  };

  if (!userRole || userRole === 0) {
    return (
      <div className="transfer-container">
        <div className="transfer-card error-card">
          <h2>Access Denied</h2>
          <p>Only Manufacturers, Distributors, and Retailers can transfer products.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="transfer-container">
      <div className="transfer-card">
        <h2>Transfer Product</h2>
        <p className="subtitle">Move products through the supply chain.</p>
        <form onSubmit={handleTransfer} className="transfer-form">
          <div className="form-group">
            <label htmlFor="productId">Product ID</label>
            <input type="text" id="productId" placeholder="Enter Product ID" value={productId} onChange={(e) => setProductId(e.target.value)} required />
          </div>
          {userRole !== 3 && (
            <div className="form-group">
              <label htmlFor="recipient">Recipient Address</label>
              <input type="text" id="recipient" placeholder="0x..." value={recipientAddress} onChange={(e) => setRecipientAddress(e.target.value)} required />
            </div>
          )}
          <button type="submit" className="submit-btn" disabled={loading}>
            {loading ? 'Processing...' : getRoleAction()}
          </button>
        </form>
        {statusMessage && (
          <div className={`status-box ${statusMessage.startsWith('Error') ? 'error' : 'success'}`}>
            {statusMessage}
          </div>
        )}
      </div>
    </div>
  );
}

export default TransferProduct;
