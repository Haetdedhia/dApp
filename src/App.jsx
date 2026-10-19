import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { useState, useEffect, useCallback } from 'react';
import { ethers } from 'ethers';
import Navbar from './components/Navbar';
import NetworkBanner from './components/NetworkBanner';
import Home from './pages/Home';
import CreateProduct from './pages/CreateProduct';
import TransferProduct from './pages/TransferProduct';
import VerifyProduct from './pages/VerifyProduct';
import ManageRoles from './pages/ManageRoles';
import Dashboard from './pages/Dashboard';
import deployment from './contracts/contract-address.json';
import SupplyChainArtifact from './contracts/SupplyChain.json';
import './App.css';

/**
 * App - Root component of the Decentralized Supply Chain tracker dApp.
 *
 * Holds TWO contract instances, and the distinction matters:
 *
 *   readContract - backed by a plain JsonRpcProvider straight to the chain's RPC
 *                  endpoint. Built on mount, needs no wallet and no user action.
 *                  Used for every `view` call (verifyProduct, getProduct,
 *                  getProductHistory) and for event queries.
 *
 *   contract     - backed by the MetaMask signer. Only exists once the user
 *                  connects. Used for everything that costs gas.
 *
 * The split is what lets a consumer scan a QR code on a phone with no wallet
 * installed and still verify a product, which is the whole point of the app.
 */
function App() {
  // --- WALLET STATE (write path) ---
  const [account, setAccount] = useState(null);
  const [contract, setContract] = useState(null);
  const [userRole, setUserRole] = useState(null);
  const [isOwner, setIsOwner] = useState(false);
  const [walletChainId, setWalletChainId] = useState(null);

  // --- READ-ONLY STATE (public path, no wallet required) ---
  const [readContract, setReadContract] = useState(null);

  // The chain this build's contract address actually lives on.
  const expectedChainId = deployment.chainId;

  /**
   * Build the wallet-free contract instance as soon as the app mounts.
   * This is deliberately independent of MetaMask.
   */
  useEffect(() => {
    try {
      const rpcProvider = new ethers.JsonRpcProvider(deployment.rpcUrl);
      setReadContract(
        new ethers.Contract(deployment.SupplyChain, SupplyChainArtifact.abi, rpcProvider)
      );
    } catch (error) {
      console.error('Could not create read-only provider:', error);
    }
  }, []);

  /**
   * connectWallet - user-initiated MetaMask connection for write operations.
   */
  const connectWallet = useCallback(async () => {
    if (!window.ethereum) {
      alert('MetaMask is not installed. You can still verify products without it.');
      return;
    }

    try {
      const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
      const browserProvider = new ethers.BrowserProvider(window.ethereum);
      const walletSigner = await browserProvider.getSigner();

      const network = await browserProvider.getNetwork();
      const currentChainId = Number(network.chainId);
      setWalletChainId(currentChainId);

      const writeContract = new ethers.Contract(
        deployment.SupplyChain,
        SupplyChainArtifact.abi,
        walletSigner
      );

      setAccount(accounts[0]);
      setContract(writeContract);

      // Only query on-chain state if the wallet is actually on the right chain,
      // otherwise these calls hit an address that holds nothing on that chain.
      if (currentChainId === expectedChainId) {
        const role = await writeContract.getRole(accounts[0]);
        setUserRole(Number(role));

        const ownerAddress = await writeContract.owner();
        setIsOwner(ownerAddress.toLowerCase() === accounts[0].toLowerCase());
      } else {
        setUserRole(null);
        setIsOwner(false);
      }
    } catch (error) {
      console.error('Error connecting wallet:', error);
      alert('Failed to connect wallet');
    }
  }, [expectedChainId]);

  // Silent reconnect if the user already authorised this site previously.
  useEffect(() => {
    const checkExisting = async () => {
      if (!window.ethereum) return;
      try {
        const accounts = await window.ethereum.request({ method: 'eth_accounts' });
        if (accounts.length > 0) await connectWallet();
      } catch (error) {
        console.error('Error checking wallet connection:', error);
      }
    };
    checkExisting();
  }, [connectWallet]);

  // --- METAMASK EVENT LISTENERS ---
  useEffect(() => {
    if (!window.ethereum) return;

    const handleAccounts = (accounts) => {
      if (accounts.length > 0) {
        connectWallet();
      } else {
        setAccount(null);
        setUserRole(null);
        setIsOwner(false);
        setContract(null);
      }
    };

    const handleChain = () => window.location.reload();

    window.ethereum.on('accountsChanged', handleAccounts);
    window.ethereum.on('chainChanged', handleChain);

    return () => {
      window.ethereum.removeListener('accountsChanged', handleAccounts);
      window.ethereum.removeListener('chainChanged', handleChain);
    };
  }, [connectWallet]);

  /**
   * switchNetwork - asks MetaMask to move to the chain the contract is deployed on.
   * If the chain is unknown to MetaMask (error 4902, typical for a local Hardhat
   * node that has never been added) it offers to add it first.
   */
  const switchNetwork = async () => {
    if (!window.ethereum) return;
    const hexChainId = '0x' + expectedChainId.toString(16);

    try {
      await window.ethereum.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: hexChainId }]
      });
      return;
    } catch (switchError) {
      if (switchError.code !== 4902) {
        console.error('Could not switch network:', switchError);
        return;
      }
    }

    // 4902 means MetaMask does not know this chain yet, so offer to add it.
    try {
      await window.ethereum.request({
        method: 'wallet_addEthereumChain',
        params: [
          {
            chainId: hexChainId,
            chainName: `Supply Chain Network (${deployment.network})`,
            rpcUrls: [deployment.rpcUrl],
            nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 }
          }
        ]
      });
    } catch (addError) {
      console.error('Could not add network:', addError);
    }
  };

  const getRoleName = (role) => {
    const roles = ['None', 'Manufacturer', 'Distributor', 'Retailer'];
    return roles[role] ?? 'Unknown';
  };

  // Only warn when a wallet is actually connected. A visitor with no wallet is
  // a supported case, not an error.
  const wrongNetwork =
    account !== null && walletChainId !== null && walletChainId !== expectedChainId;

  return (
    <Router>
      <div className="app">
        <Navbar
          account={account}
          userRole={userRole}
          isOwner={isOwner}
          getRoleName={getRoleName}
          connectWallet={connectWallet}
        />

        {wrongNetwork && (
          <NetworkBanner
            expectedNetwork={deployment.network}
            expectedChainId={expectedChainId}
            currentChainId={walletChainId}
            onSwitch={switchNetwork}
          />
        )}

        <main className="main-content">
          <Routes>
            <Route path="/" element={<Home />} />

            <Route
              path="/create"
              element={<CreateProduct contract={contract} account={account} userRole={userRole} />}
            />

            <Route
              path="/transfer"
              element={<TransferProduct contract={contract} account={account} userRole={userRole} />}
            />

            {/* Public route. readContract makes it work with no wallet at all;
                the signer contract is optional and only enables recording a scan. */}
            <Route
              path="/verify/:productId?"
              element={<VerifyProduct readContract={readContract} contract={contract} />}
            />

            {/* Public route, also wallet-free - builds its list from event logs. */}
            <Route path="/dashboard" element={<Dashboard readContract={readContract} />} />

            <Route
              path="/roles"
              element={<ManageRoles contract={contract} account={account} isOwner={isOwner} />}
            />
          </Routes>
        </main>
      </div>
    </Router>
  );
}

export default App;
