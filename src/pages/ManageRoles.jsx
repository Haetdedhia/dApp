import { useState } from 'react';
import './ManageRoles.css';

function ManageRoles({ contract, account }) {
  const [targetAddress, setTargetAddress] = useState('');
  const [selectedRole, setSelectedRole] = useState(1);
  const [loading, setLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');

  const handleAssignRole = async (e) => {
    e.preventDefault();
    if (!contract) {
      setStatusMessage('Please connect your wallet first.');
      return;
    }

    try {
      setLoading(true);
      setStatusMessage('Sending blockchain transaction...');
      const tx = await contract.assignRole(targetAddress, selectedRole);
      setStatusMessage('Transaction submitted. Assigning role...');
      await tx.wait();
      setStatusMessage(`Successfully assigned role to ${targetAddress}`);
      setTargetAddress('');
    } catch (error) {
      console.error(error);
      setStatusMessage(`Error: ${error.reason || error.message || 'Transaction failed'}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="roles-container">
      <div className="roles-card">
        <h2>Manage User Roles</h2>
        <p className="subtitle">Only the Contract Owner can assign roles.</p>
        <form onSubmit={handleAssignRole} className="roles-form">
          <div className="form-group">
            <label htmlFor="address">Ethereum Address</label>
            <input type="text" id="address" placeholder="0x..." value={targetAddress} onChange={(e) => setTargetAddress(e.target.value)} required />
          </div>
          <div className="form-group">
            <label htmlFor="role">Role</label>
            <select id="role" value={selectedRole} onChange={(e) => setSelectedRole(Number(e.target.value))}>
              <option value={1}>Manufacturer</option>
              <option value={2}>Distributor</option>
              <option value={3}>Retailer</option>
            </select>
          </div>
          <button type="submit" className="submit-btn" disabled={loading}>
            {loading ? 'Assigning...' : 'Assign Role'}
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

export default ManageRoles;
