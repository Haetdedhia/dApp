import { Package } from 'lucide-react';
import deployment from '../contracts/contract-address.json';
import './Footer.css';

function Footer() {
  return (
    <footer className="footer">
      <div className="footer-inner">
        <div className="footer-brand">
          <Package size={17} strokeWidth={1.8} aria-hidden="true" />
          <span>Provenance — supply chain verification on Ethereum</span>
        </div>
        {/* Reads the deployment the frontend was actually built against, so the
            footer can never claim a network the app is not pointed at. */}
        <div className="footer-network">
          <span className="footer-dot" aria-hidden="true" />
          <span className="mono">
            {deployment.network} · chain {deployment.chainId}
          </span>
        </div>
      </div>
    </footer>
  );
}

export default Footer;
