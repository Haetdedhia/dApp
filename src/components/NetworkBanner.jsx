import './NetworkBanner.css';

/**
 * NetworkBanner - warns when MetaMask is pointed at a different chain than the
 * one the contract was deployed to.
 *
 * Without this, a wallet on the wrong network produces calls to an address that
 * holds no code, and ethers returns confusing decode errors rather than saying
 * "wrong network". It is the most common way a live demo falls over.
 */
function NetworkBanner({ expectedNetwork, expectedChainId, currentChainId, onSwitch }) {
  return (
    <div className="network-banner" role="alert">
      <span className="network-banner-text">
        Wrong network. Your wallet is on chain <strong>{currentChainId}</strong>, but this
        app is deployed to <strong>{expectedNetwork}</strong> (chain {expectedChainId}).
      </span>
      <button type="button" className="network-banner-btn" onClick={onSwitch}>
        Switch Network
      </button>
    </div>
  );
}

export default NetworkBanner;
