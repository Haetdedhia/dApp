import { useState } from 'react';
import { ethers } from 'ethers';
import { Zap, Search } from 'lucide-react';
import TxStatus from '../components/TxStatus';
import useTransaction from '../lib/useTransaction';
import './CreateProduct.css';
import './ManageRoles.css';

const ROLE_OPTIONS = [
  { value: 1, label: 'Manufacturer' },
  { value: 2, label: 'Distributor' },
  { value: 3, label: 'Retailer' },
  // The contract supports Role.None (0), so expose it. Without this there is no
  // way to take a role away from an address through the UI.
  { value: 0, label: 'None — revoke access' }
];

const ROLE_NAMES = ['None', 'Manufacturer', 'Distributor', 'Retailer'];

function ManageRoles({ contract, account, isOwner }) {
  const [targetAddress, setTargetAddress] = useState('');
  const [selectedRole, setSelectedRole] = useState(1);
  const [validationError, setValidationError] = useState('');

  const [lookupAddress, setLookupAddress] = useState('');
  const [lookupResult, setLookupResult] = useState(null);
  const [lookupError, setLookupError] = useState('');

  const tx = useTransaction();

  const handleAssignRole = async (e) => {
    e.preventDefault();
    if (!contract) return;

    setValidationError('');

    if (!ethers.isAddress(targetAddress)) {
      setValidationError('That is not a valid Ethereum address.');
      return;
    }

    const ok = await tx.run(() => contract.assignRole(targetAddress, selectedRole));
    if (ok) setTargetAddress('');
  };

  const handleLookup = async (e) => {
    e.preventDefault();
    if (!contract) return;

    setLookupError('');
    setLookupResult(null);

    if (!ethers.isAddress(lookupAddress)) {
      setLookupError('That is not a valid Ethereum address.');
      return;
    }

    try {
      const role = await contract.getRole(lookupAddress);
      setLookupResult({ address: lookupAddress, role: ROLE_NAMES[Number(role)] });
    } catch (error) {
      console.error(error);
      setLookupError(`Lookup failed: ${error.reason || error.message}`);
    }
  };

  // Gate the whole page. The contract rejects non-owners anyway, but letting
  // someone fill in a form that can only ever revert is poor UX.
  if (!account) {
    return (
      <div className="form-page">
        <div className="form-shell">
          <div className="gate">
            <h1>Wallet required</h1>
            <p>Connect the wallet that deployed this contract to manage roles.</p>
          </div>
        </div>
      </div>
    );
  }

  if (!isOwner) {
    return (
      <div className="form-page">
        <div className="form-shell">
          <div className="gate">
            <h1>Owner only</h1>
            <p>
              Only the contract owner — the account that deployed it — can assign or revoke roles.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const selectedLabel = ROLE_OPTIONS.find((r) => r.value === selectedRole)?.label ?? '';

  return (
    <div className="form-page">
      <div className="form-shell">
        <header className="form-head">
          <h1>Manage roles</h1>
          <p>You are connected as the contract owner.</p>
        </header>

        <form onSubmit={handleAssignRole} className="form-card">
          <div className="form-group">
            <label htmlFor="address" className="field-label">
              Ethereum address
            </label>
            <input
              type="text"
              id="address"
              className="input input-mono"
              placeholder="0x…"
              value={targetAddress}
              onChange={(e) => setTargetAddress(e.target.value)}
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="role" className="field-label">
              Role
            </label>
            <select
              id="role"
              className="input"
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
            <div className="alert alert-warning" role="status">
              <div>
                <h3>Revoking can strand a product</h3>
                <p>
                  If this address currently holds a product, revoking its role freezes that product
                  — every pipeline function needs both the role and custody. Use the owner recovery
                  function to reassign custody if that happens.
                </p>
              </div>
            </div>
          )}

          {validationError && (
            <p className="field-error" role="alert">
              {validationError}
            </p>
          )}

          <div className="form-footer">
            <div className="gas-note">
              <Zap size={14} strokeWidth={2} aria-hidden="true" />
              <span>Costs gas · roughly 48,000 units</span>
            </div>
            <button type="submit" className="btn btn-primary" disabled={tx.busy}>
              {tx.busy ? (
                <>
                  <span className="spinner" aria-hidden="true" />
                  {tx.status === 'signing' ? 'Confirm in wallet' : 'Assigning'}
                </>
              ) : (
                'Assign role'
              )}
            </button>
          </div>

          <TxStatus
            status={tx.status}
            hash={tx.hash}
            error={tx.error}
            successMessage={`Set to ${selectedLabel}`}
          />
        </form>

        <div className="lookup-card">
          <h2>Check an address</h2>
          <form onSubmit={handleLookup} className="lookup-form">
            <label htmlFor="lookup" className="sr-only">
              Ethereum address to look up
            </label>
            <div className="lookup-row">
              <input
                type="text"
                id="lookup"
                className="input input-mono"
                placeholder="0x…"
                value={lookupAddress}
                onChange={(e) => setLookupAddress(e.target.value)}
                required
              />
              <button type="submit" className="btn btn-secondary lookup-btn">
                <Search size={15} strokeWidth={2} aria-hidden="true" />
                Look up
              </button>
            </div>
          </form>

          {lookupError && (
            <p className="field-error lookup-result" role="alert">
              {lookupError}
            </p>
          )}

          {lookupResult && (
            <div className="lookup-result" role="status">
              <span className="mono lookup-address">{lookupResult.address}</span>
              <span className={`lookup-role role-${lookupResult.role.toLowerCase()}`}>
                {lookupResult.role}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default ManageRoles;
