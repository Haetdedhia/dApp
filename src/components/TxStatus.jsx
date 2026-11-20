import { Check, TriangleAlert } from 'lucide-react';
import './TxStatus.css';

/**
 * Renders the state of an in-flight transaction from useTransaction().
 *
 * role="status" rather than "alert" for the non-error states, so a screen
 * reader announces progress politely instead of interrupting.
 */
function TxStatus({ status, hash, error, successMessage }) {
  if (status === 'idle') return null;

  if (status === 'signing') {
    return (
      <div className="tx tx-pending" role="status">
        <span className="spinner" aria-hidden="true" />
        <div>
          <p className="tx-title">Confirm in your wallet</p>
          <p className="tx-body">Approve the transaction to continue.</p>
        </div>
      </div>
    );
  }

  if (status === 'pending') {
    return (
      <div className="tx tx-pending" role="status">
        <span className="spinner" aria-hidden="true" />
        <div>
          <p className="tx-title">Waiting for confirmation</p>
          <p className="tx-body">
            Submitted to the network. This usually takes a few seconds.
            {hash && <span className="tx-hash mono">{hash}</span>}
          </p>
        </div>
      </div>
    );
  }

  if (status === 'success') {
    return (
      <div className="tx tx-success" role="status">
        <Check size={18} strokeWidth={2.6} aria-hidden="true" />
        <div>
          <p className="tx-title">{successMessage || 'Confirmed'}</p>
          {hash && <p className="tx-hash mono">{hash}</p>}
        </div>
      </div>
    );
  }

  return (
    <div className="tx tx-error" role="alert">
      <TriangleAlert size={18} strokeWidth={2.2} aria-hidden="true" />
      <div>
        <p className="tx-title">Transaction did not go through</p>
        <p className="tx-body">{error}</p>
      </div>
    </div>
  );
}

export default TxStatus;
