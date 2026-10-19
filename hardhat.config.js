require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config();

// Sepolia settings come from .env (never committed). See .env.example.
// Both are optional: the local Hardhat workflow runs without them.
const SEPOLIA_RPC_URL = process.env.SEPOLIA_RPC_URL || "";
const PRIVATE_KEY = process.env.PRIVATE_KEY || "";

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: "0.8.20",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200
      }
    }
  },
  networks: {
    hardhat: {
      chainId: 1337
    },
    localhost: {
      url: "http://127.0.0.1:8545",
      chainId: 1337
    },
    // Only usable once .env is populated; harmless otherwise.
    sepolia: {
      url: SEPOLIA_RPC_URL,
      accounts: PRIVATE_KEY ? [PRIVATE_KEY] : [],
      chainId: 11155111
    }
  },
  // Ships with @nomicfoundation/hardhat-toolbox, just needs enabling.
  // Prints a per-function gas table after `npx hardhat test`.
  gasReporter: {
    enabled: true,
    currency: "USD",
    showMethodSig: true
  },
  paths: {
    sources: "./contracts",
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts"
  }
};
