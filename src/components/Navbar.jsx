import { Link } from 'react-router-dom';
import './Navbar.css';

function Navbar({ account, userRole, getRoleName, connectWallet }) {
  return (
    <nav className="navbar">
      <div className="navbar-brand">
        <Link to="/" className="navbar-logo">📦 Supply Chain dApp</Link>
      </div>
      <ul className="navbar-menu">
        <li><Link to="/">Home</Link></li>
        {userRole === 1 && <li><Link to="/create">Create Product</Link></li>}
        {(userRole === 1 || userRole === 2 || userRole === 3) && (
          <li><Link to="/transfer">Transfer</Link></li>
        )}
        <li><Link to="/verify">Verify Product</Link></li>
        <li><Link to="/roles">Manage Roles</Link></li>
      </ul>
      <div className="navbar-actions">
        {account ? (
          <div className="account-details">
            <span className="user-role-badge">Role: {getRoleName(userRole)}</span>
            <span className="account-address">
              {account.substring(0, 6)}...{account.substring(account.length - 4)}
            </span>
          </div>
        ) : (
          <button className="connect-btn" onClick={connectWallet}>Connect Wallet</button>
        )}
      </div>
    </nav>
  );
}

export default Navbar;
