import { useState } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { Package } from 'lucide-react';
import './Navbar.css';

const ROLE_LABEL = ['None', 'Manufacturer', 'Distributor', 'Retailer'];

function shortenAddress(address) {
  return `${address.substring(0, 6)}…${address.substring(address.length - 4)}`;
}

function Navbar({ account, userRole, isOwner, connectWallet }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const closeMenu = () => setMenuOpen(false);

  const canTransfer = userRole === 1 || userRole === 2 || userRole === 3;

  // Owner outranks any assigned role in the chip, since it is the more
  // consequential permission.
  const roleLabel = isOwner ? 'Owner' : ROLE_LABEL[userRole] ?? 'Unknown';
  const hasRole = isOwner || (userRole !== null && userRole > 0);

  return (
    <header className="navbar">
      <div className="navbar-inner">
        <Link to="/" className="navbar-logo" onClick={closeMenu}>
          <Package size={20} strokeWidth={1.8} aria-hidden="true" />
          <span>Provenance</span>
        </Link>

        <button
          type="button"
          className="navbar-toggle"
          aria-label="Toggle navigation"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((open) => !open)}
        >
          <span />
          <span />
          <span />
        </button>

        <div className={`navbar-collapse ${menuOpen ? 'open' : ''}`}>
          <nav className="navbar-menu" aria-label="Main">
            <NavLink to="/verify" onClick={closeMenu}>
              Verify
            </NavLink>
            <NavLink to="/registry" onClick={closeMenu}>
              Registry
            </NavLink>
            {userRole === 1 && (
              <NavLink to="/create" onClick={closeMenu}>
                Register
              </NavLink>
            )}
            {canTransfer && (
              <NavLink to="/transfer" onClick={closeMenu}>
                Transfer
              </NavLink>
            )}
            {/* The contract rejects non-owners anyway; hiding the link just
                avoids sending everyone else down a dead end. */}
            {isOwner && (
              <NavLink to="/roles" onClick={closeMenu}>
                Roles
              </NavLink>
            )}
          </nav>

          <div className="navbar-actions">
            {account ? (
              <div className="wallet-chip">
                {hasRole && (
                  <span className={`role-badge role-${roleLabel.toLowerCase()}`}>{roleLabel}</span>
                )}
                <span className="wallet-address mono" title={account}>
                  {shortenAddress(account)}
                </span>
              </div>
            ) : (
              <button type="button" className="btn btn-secondary navbar-connect" onClick={connectWallet}>
                Connect wallet
              </button>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}

export default Navbar;
