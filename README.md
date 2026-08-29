# Decentralized Supply-Chain Tracker

This is a Web3-enabled decentralized supply-chain tracker application that keeps record of products moving from manufacturers through distributors and retailers to final consumers. It helps detect counterfeits using secure smart contract verifications.

## 🚀 Architecture Workflow

**React + Vite** (Vite Dev Server) -> **ethers.js** -> **MetaMask** -> **Solidity** -> **Local Hardhat Network**

### 📦 Key Features
1. **Product Twin Registration**: Only Manufacturers can register new products, generating a unique blockchain record + QR code URL.
2. **Chain of Custody Tracking**: Verified transfers:
   - **Manufactured** (Created by Manufacturer)
   - **DistributorReceived** (Transferred to Distributor)
   - **RetailerReceived** (Transferred to Retailer)
   - **Sold** (Marked as Sold by Retailer)
3. **QR Verification**: Customers scan generated product QR codes (`/verify/PRODUCT-ID`) to fetch full chain-of-custody tracking data.
4. **Counterfeit Detection**: If verification finds no matching transaction record block, it displays: *"No verified blockchain record found. Product may be counterfeit."*

---

## 🛠️ Step-by-Step Run Instructions

Follow these instructions to run the project locally.

### 1. Smart Contract Compilation & Node Startup
Open a terminal in the project directory and run:
```bash
npm install
npx hardhat node
```

### 2. Deploy Smart Contract
In a separate terminal, deploy the solidity contract to your local hardhat blockchain:
```bash
npx hardhat run scripts/deploy.js --network localhost
```

*Note: This script will deploy the contract & automatically write configuration files (Contract Address and `SupplyChain.json` ABI) to `src/contracts/` for Vite frontend compilation.*

### 3. Smart Contract Unit Tests
To verify all rule-sets and permissions (e.g. retailers cannot create products, only owners assign roles, correct status transitions):
```bash
npx hardhat test
```

### 4. Run Vite Frontend
Start the local frontend server:
```bash
npm run dev
```

Open `http://localhost:5173` to interact with the app.

---

## 👥 Roles Setup Guide

To perform transactions:
1. Connect MetaMask to Hardhat Local network (`HTTP://127.0.0.1:8545` with chain ID `1337`).
2. The account which deployed the contract is the Owner.
3. Use the **Manage Roles** page using the Owner wallet and assign role addresses:
   - **1** for Manufacturer
   - **2** for Distributor
   - **3** for Retailer
4. Switch MetaMask accounts to test respective restricted operations.
