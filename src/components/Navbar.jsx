import { useState } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { Package } from 'lucide-react';
import './Navbar.css';

function Navbar({ account, userRole, isOwner, getRoleName, connectWallet }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const closeMenu = () => setMenuOpen(false);

  const canTransfer = userRole === 1 || userRole === 2 || userRole === 3;

  return (
    <nav className="navbar">
      <div className="navbar-brand">
        <Link to="/" className="navbar-logo" onClick={closeMenu}>
          {/* aria-hidden: the adjacent text already names the link, so announcing
              the icon too would just repeat it to a screen reader. */}
          <Package size={18} strokeWidth={1.75} aria-hidden="true" />
          <span>Supply Chain dApp</span>
        </Link>
      </div>

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
        <ul className="navbar-menu">
          <li>
            <NavLink to="/" onClick={closeMenu}>
              Home
            </NavLink>
          </li>
          <li>
            <NavLink to="/verify" onClick={closeMenu}>
              Verify
            </NavLink>
          </li>
          <li>
            <NavLink to="/dashboard" onClick={closeMenu}>
              Registry
            </NavLink>
          </li>
          {userRole === 1 && (
            <li>
              <NavLink to="/create" onClick={closeMenu}>
                Create Product
              </NavLink>
            </li>
          )}
          {canTransfer && (
            <li>
              <NavLink to="/transfer" onClick={closeMenu}>
                Transfer
              </NavLink>
            </li>
          )}
          {/* Only the contract owner can assign roles, so only show the link to
              them. The contract still enforces this; hiding it just avoids
              sending everyone else down a dead end. */}
          {isOwner && (
            <li>
              <NavLink to="/roles" onClick={closeMenu}>
                Manage Roles
              </NavLink>
            </li>
          )}
        </ul>

        <div className="navbar-actions">
          {account ? (
            <div className="account-details">
              <span className="user-role-badge">
                {isOwner ? 'Owner' : getRoleName(userRole)}
              </span>
              <span className="account-address" title={account}>
                {account.substring(0, 6)}...{account.substring(account.length - 4)}
              </span>
            </div>
          ) : (
            <button className="connect-btn" onClick={connectWallet}>
              Connect Wallet
            </button>
          )}
        </div>
      </div>
    </nav>
  );
}

export default Navbar;
