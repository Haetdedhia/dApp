import { useState } from 'react';
import { ethers } from 'ethers';
import './ManageRoles.css';

const ROLE_OPTIONS = [
  { value: 1, label: 'Manufacturer' },
  { value: 2, label: 'Distributor' },
  { value: 3, label: 'Retailer' },
  // The contract supports Role.None (0), so expose it. Without this there is no
  // way to take a role away from an address through the UI.
  { value: 0, label: 'None (revoke access)' }
];

function ManageRoles({ contract, account, isOwner }) {
  const [targetAddress, setTargetAddress] = useState('');
  const [selectedRole, setSelectedRole] = useState(1);
  const [loading, setLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [lookupAddress, setLookupAddress] = useState('');
  const [lookupResult, setLookupResult] = useState('');

  const handleAssignRole = async (e) => {
    e.preventDefault();
    if (!contract) {
      setStatusMessage('Please connect your wallet first.');
      return;
    }

    if (!ethers.isAddress(targetAddress)) {
      setStatusMessage('Error: that is not a valid Ethereum address.');
      return;
    }

    try {
      setLoading(true);
      setStatusMessage('Sending blockchain transaction...');

      const tx = await contract.assignRole(targetAddress, selectedRole);
      setStatusMessage('Transaction submitted. Waiting for confirmation...');
      await tx.wait();

      const roleLabel = ROLE_OPTIONS.find((r) => r.value === selectedRole)?.label ?? selectedRole;
      setStatusMessage(`Set ${targetAddress} to ${roleLabel}.`);
      setTargetAddress('');
    } catch (error) {
      console.error(error);
      setStatusMessage(`Error: ${error.reason || error.message || 'Transaction failed'}`);
    } finally {
      setLoading(false);
    }
  };

  const handleLookup = async (e) => {
    e.preventDefault();
    if (!contract) return;

    if (!ethers.isAddress(lookupAddress)) {
      setLookupResult('That is not a valid Ethereum address.');
      return;
    }

    try {
      const role = await contract.getRole(lookupAddress);
      const names = ['None', 'Manufacturer', 'Distributor', 'Retailer'];
      setLookupResult(`${lookupAddress} currently holds: ${names[Number(role)]}`);
    } catch (error) {
      console.error(error);
      setLookupResult(`Lookup failed: ${error.reason || error.message}`);
    }
  };

  // Gate the whole page. The contract rejects non-owners anyway, but letting
  // someone fill in a form that can only ever revert is poor UX.
  if (!account) {
    return (
      <div className="roles-container">
        <div className="roles-card error-card">
          <h2>Wallet Required</h2>
          <p>Connect the wallet that deployed this contract to manage roles.</p>
        </div>
      </div>
    );
  }

  if (!isOwner) {
    return (
      <div className="roles-container">
        <div className="roles-card error-card">
          <h2>Access Denied</h2>
          <p>Only the contract owner (the deploying account) can assign roles.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="roles-container">
      <div className="roles-card">
        <h2>Manage User Roles</h2>
        <p className="subtitle">You are connected as the contract owner.</p>

        <form onSubmit={handleAssignRole} className="roles-form">
          <div className="form-group">
            <label htmlFor="address">Ethereum Address</label>
            <input
              type="text"
              id="address"
              placeholder="0x..."
              value={targetAddress}
              onChange={(e) => setTargetAddress(e.target.value)}
              required
            />
          </div>
          <div className="form-group">
            <label htmlFor="role">Role</label>
            <select
              id="role"
              value={selectedRole}
              onChange={(e) => setSelectedRole(Number(e.target.value))}
            >
              {ROLE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          {selectedRole === 0 && (
            <div className="status-box info">
              Revoking a role from an address that currently holds a product will freeze
              that product. Use the owner recovery function to reassign custody if that
              happens.
            </div>
          )}

          <button type="submit" className="submit-btn" disabled={loading}>
            {loading ? 'Assigning...' : 'Assign Role'}
          </button>
        </form>

        {statusMessage && (
          <div className={`status-box ${statusMessage.startsWith('Error') ? 'error' : 'success'}`}>
            {statusMessage}
          </div>
        )}

        <div className="roles-divider" />

        <h3>Check an Address</h3>
        <form onSubmit={handleLookup} className="roles-form">
          <div className="form-group">
            <label htmlFor="lookup">Ethereum Address</label>
            <input
              type="text"
              id="lookup"
              placeholder="0x..."
              value={lookupAddress}
              onChange={(e) => setLookupAddress(e.target.value)}
              required
            />
          </div>
          <button type="submit" className="submit-btn secondary">
            Look Up Role
          </button>
        </form>

        {lookupResult && <div className="status-box info">{lookupResult}</div>}
      </div>
    </div>
  );
}

export default ManageRoles;
