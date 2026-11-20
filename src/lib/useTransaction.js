import { useState, useCallback } from 'react';

/**
 * Drives the four states a write transaction passes through.
 *
 * Sepolia writes take 2-15 seconds, during which the only previous feedback was
 * a disabled button. That is a missing-feedback bug, not a polish gap: the user
 * cannot tell whether the wallet popup failed, the transaction is mining, or
 * nothing happened at all.
 *
 *   idle      - nothing in flight
 *   signing   - waiting for the user to approve in their wallet
 *   pending   - submitted, waiting to be mined (hash is available here)
 *   success   - mined
 *   error     - rejected or reverted
 *
 * `run` takes a function returning the ethers transaction response, so callers
 * stay declarative:
 *
 *   run(() => contract.createProduct(id, name, batch))
 */
export default function useTransaction() {
  const [status, setStatus] = useState('idle');
  const [hash, setHash] = useState(null);
  const [error, setError] = useState('');

  const reset = useCallback(() => {
    setStatus('idle');
    setHash(null);
    setError('');
  }, []);

  const run = useCallback(async (send) => {
    setStatus('signing');
    setError('');
    setHash(null);

    try {
      const tx = await send();
      setHash(tx.hash);
      setStatus('pending');

      await tx.wait();
      setStatus('success');
      return true;
    } catch (err) {
      console.error(err);
      // ethers v6 surfaces a user rejection as ACTION_REJECTED. Treat it as a
      // cancellation rather than a failure, because nothing went wrong.
      const rejected = err.code === 'ACTION_REJECTED';
      setError(
        rejected
          ? 'Transaction cancelled in your wallet.'
          : err.reason || err.shortMessage || err.message || 'Transaction failed'
      );
      setStatus('error');
      return false;
    }
  }, []);

  return { status, hash, error, run, reset, busy: status === 'signing' || status === 'pending' };
}
