import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import Navbar from './components/Navbar';
import Home from './pages/Home';
import CreateProduct from './pages/CreateProduct';
import TransferProduct from './pages/TransferProduct';
import VerifyProduct from './pages/VerifyProduct';
import ManageRoles from './pages/ManageRoles';
import './App.css';

/**
 * App - Root component of the Decentralized Supply Chain tracker dApp.
 * Responsible for wallet connection handshake (via ethers.js and browser window.ethereum injector),
 * caching contract references, tracking connected Ethereum accounts, fetching user roles,
 * and routing layout targets through React Router.
 */
function App() {
  // --- STATE VARIABLES ---
  // account: hexadecimal string representing the active wallet address of the connected user
  const [account, setAccount] = useState(null);
  // provider: ethers.js abstraction of the browser's Ethereum RPC network node hook (Metamask)
  const [provider, setProvider] = useState(null);
  // signer: ethers.js representation of the private key owner used to authorize transactions
  const [signer, setSigner] = useState(null);
  // contract: ethers.Contract reference target used to map smart contract functions to local JS methods
  const [contract, setContract] = useState(null);
  // userRole: number value (0-3) caching on-chain permission structure mapping
  const [userRole, setUserRole] = useState(null);

  // Attempt silent connection checking on initial application load (checks if dApp is pre-authorized)
  useEffect(() => {
    checkWalletConnection();
  }, []);

  /**
   * checkWalletConnection - Checks if the user's browser has an Ethereum wallet injected
   * and if the user has already approved connections to this site.
   */
  const checkWalletConnection = async () => {
    if (window.ethereum) {
      try {
        const accounts = await window.ethereum.request({
          method: 'eth_accounts'
        });

        // If at least one account is already unlocked and connected, trigger full hook configuration
        if (accounts.length > 0) {
          await connectWallet();
        }
      } catch (error) {
        console.error("Error checking wallet connection:", error);
      }
    }
  };

  /**
   * connectWallet - Primary user-initiated interactive connection flow.
   * Calls window.ethereum API to request access to the browser wallet (e.g. MetaMask).
   * Instantiates ethers.js providers, signers, dynamically imports build-time addresses,
   * constructs the contract helper, and updates state wrappers.
   */
  const connectWallet = async () => {
    try {
      if (!window.ethereum) {
        alert("Please install MetaMask!");
        return;
      }

      // Request user authorization to fetch account address information
      const accounts = await window.ethereum.request({
        method: 'eth_requestAccounts'
      });

      // BrowserProvider wraps standard EIP-1193 window.ethereum provider object
      const provider = new ethers.BrowserProvider(window.ethereum);
      // Retrieve signer for write-level smart contract interaction signatures
      const signer = await provider.getSigner();

      // Dynamic import prevents build failures if deployment artifacts aren't created yet
      const contractAddress = (await import('./contracts/contract-address.json')).SupplyChain;
      const contractABI = (await import('./contracts/SupplyChain.json')).abi;

      // Instantiate Ethers Contract abstraction to map transactions
      const contract = new ethers.Contract(contractAddress, contractABI, signer);

      setAccount(accounts[0]);
      setProvider(provider);
      setSigner(signer);
      setContract(contract);

      // Access the contract on-chain state to look up caller's current role registry index
      const role = await contract.getRole(accounts[0]);
      setUserRole(Number(role));

      console.log("Connected:", accounts[0]);
    } catch (error) {
      console.error("Error connecting wallet:", error);
      alert("Failed to connect wallet");
    }
  };

  // --- METAMASK EVENT AUDIT LISTENERS ---
  // Registers listeners to handle wallet context swaps (different account, chain changes)
  useEffect(() => {
    if (window.ethereum) {
      const handleAccounts = (accounts) => {
        if (accounts.length > 0) {
          // Re-trigger wallet logic to update signer context and role mappings
          connectWallet();
        } else {
          // User manually locked/disconnected all accounts
          setAccount(null);
          setUserRole(null);
        }
      };

      // Handle account change events
      window.ethereum.on('accountsChanged', handleAccounts);
      // Hard refresh page on block network fork chain changes (prevents cache mismatch)
      window.ethereum.on('chainChanged', () => window.location.reload());

      // Clean up event listeners on component unmount
      return () => {
        window.ethereum.removeListener('accountsChanged', handleAccounts);
      };
    }
  }, []);

  /**
   * getRoleName - Maps integer role index to key-value string
   * @param {number} role - Role code retrieved from smart contract (0-3)
   * @returns {string} Human-readable role identifier
   */
  const getRoleName = (role) => {
    const roles = ['None', 'Manufacturer', 'Distributor', 'Retailer'];
    return roles[role] || 'Unknown';
  };

  return (
    <Router>
      <div className="app">
        {/* Navigation header with profile, status, and network hooks */}
        <Navbar
          account={account}
          userRole={userRole}
          getRoleName={getRoleName}
          connectWallet={connectWallet}
        />
        <main className="main-content">
          <Routes>
            <Route path="/" element={<Home />} />

            {/* Create Product path - Restricted to Manufacturer permission */}
            <Route
              path="/create"
              element={
                <CreateProduct
                  contract={contract}
                  account={account}
                  userRole={userRole}
                />
              }
            />

            {/* Transfer Product path - Workflow splits actions based on active roles */}
            <Route
              path="/transfer"
              element={
                <TransferProduct
                  contract={contract}
                  account={account}
                  userRole={userRole}
                />
              }
            />

            {/* Verify Product path - Consumer search lookup (optional query URL param) */}
            <Route
              path="/verify/:productId?"
              element={
                <VerifyProduct
                  contract={contract}
                />
              }
            />

            {/* Manage Roles path - Administrator-only command terminal */}
            <Route
              path="/roles"
              element={
                <ManageRoles
                  contract={contract}
                  account={account}
                />
              }
            />
          </Routes>
        </main>
      </div>
    </Router>
  );
}

export default App;
