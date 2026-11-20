import { useState } from 'react';
import { ethers } from 'ethers';
import { Zap, ArrowRight } from 'lucide-react';
import TxStatus from '../components/TxStatus';
import useTransaction from '../lib/useTransaction';
import { STAGES } from '../lib/stages';
import './CreateProduct.css';
import './TransferProduct.css';

/**
 * Role determines which contract call this page makes, so the screen states
 * plainly what is about to happen rather than offering a generic "Transfer".
 *
 * Keyed by the contract's Role enum: 1 Manufacturer, 2 Distributor, 3 Retailer.
 */
const ACTIONS = {
  1: {
    verb: 'Send to distributor',
    from: STAGES[0],
    to: STAGES[1],
    needsRecipient: true,
    recipientLabel: 'Distributor address',
    summary: 'Hands the product to a distributor and advances it to Distributor received.'
  },
  2: {
    verb: 'Send to retailer',
    from: STAGES[1],
    to: STAGES[2],
    needsRecipient: true,
    recipientLabel: 'Retailer address',
    summary: 'Hands the product to a retailer and advances it to Retailer received.'
  },
  3: {
    verb: 'Mark as sold',
    from: STAGES[2],
    to: STAGES[3],
    needsRecipient: false,
    summary:
      'Closes the lifecycle. You stay on record as the seller, because the consumer has no on-chain address.'
  }
};

function TransferProduct({ contract, userRole }) {
  const [productId, setProductId] = useState('');
  const [recipientAddress, setRecipientAddress] = useState('');
  const [validationError, setValidationError] = useState('');

  const tx = useTransaction();
  const action = ACTIONS[userRole];

  const handleTransfer = async (e) => {
    e.preventDefault();
    if (!contract || !action) return;

    setValidationError('');

    if (action.needsRecipient && !ethers.isAddress(recipientAddress)) {
      setValidationError('That is not a valid Ethereum address.');
      return;
    }

    const ok = await tx.run(() => {
      if (userRole === 1) return contract.transferToDistributor(productId, recipientAddress);
      if (userRole === 2) return contract.transferToRetailer(productId, recipientAddress);
      return contract.markAsSold(productId);
    });

    if (ok) {
      setProductId('');
      setRecipientAddress('');
    }
  };

  if (!action) {
    return (
      <div className="form-page">
        <div className="form-shell">
          <div className="gate">
            <h1>No transfer rights</h1>
            <p>
              Moving a product requires the Manufacturer, Distributor or Retailer role. The
              contract enforces this regardless of what the interface shows.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const FromIcon = action.from.icon;
  const ToIcon = action.to.icon;

  return (
    <div className="form-page">
      <div className="form-shell">
        <header className="form-head">
          <h1>{action.verb}</h1>
          <p>{action.summary}</p>
        </header>

        {/* Shows the exact state change this role is about to cause, so nobody
            has to infer it from the button label. */}
        <div className="transition-preview">
          <span
            className="transition-node"
            style={{ '--stage': action.from.color, '--stage-rgb': action.from.rgb }}
          >
            <FromIcon size={15} strokeWidth={2} aria-hidden="true" />
            {action.from.label}
          </span>
          <ArrowRight size={16} strokeWidth={2} aria-hidden="true" className="transition-arrow" />
          <span
            className="transition-node"
            style={{ '--stage': action.to.color, '--stage-rgb': action.to.rgb }}
          >
            <ToIcon size={15} strokeWidth={2} aria-hidden="true" />
            {action.to.label}
          </span>
        </div>

        <form onSubmit={handleTransfer} className="form-card">
          <div className="form-group">
            <label htmlFor="productId" className="field-label">
              Product ID
            </label>
            <input
              type="text"
              id="productId"
              className="input input-mono"
              placeholder="MED-2026-001"
              value={productId}
              onChange={(e) => setProductId(e.target.value)}
              required
            />
          </div>

          {action.needsRecipient && (
            <div className="form-group">
              <label htmlFor="recipient" className="field-label">
                {action.recipientLabel}
              </label>
              <input
                type="text"
                id="recipient"
                className="input input-mono"
                placeholder="0x…"
                value={recipientAddress}
                onChange={(e) => setRecipientAddress(e.target.value)}
                required
              />
              <p className="field-hint">
                Must already hold the {action.to.label.replace(' received', '')} role, or the
                transaction reverts.
              </p>
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
              <span>Costs gas · roughly 70,000 units</span>
            </div>
            <button type="submit" className="btn btn-primary" disabled={tx.busy}>
              {tx.busy ? (
                <>
                  <span className="spinner" aria-hidden="true" />
                  {tx.status === 'signing' ? 'Confirm in wallet' : 'Submitting'}
                </>
              ) : (
                action.verb
              )}
            </button>
          </div>

          <TxStatus
            status={tx.status}
            hash={tx.hash}
            error={tx.error}
            successMessage={`${action.to.label} recorded`}
          />
        </form>
      </div>
    </div>
  );
}

export default TransferProduct;
