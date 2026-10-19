const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

/**
 * Deploys SupplyChain and writes the address + ABI into src/contracts/ so the
 * Vite frontend can import them. Also records which network the deployment
 * targets, which the frontend uses to build a read-only provider (so consumers
 * can verify products without a wallet) and to warn on a chain mismatch.
 */
async function main() {
  const network = await hre.ethers.provider.getNetwork();
  const chainId = Number(network.chainId);

  console.log(`Deploying SupplyChain to ${hre.network.name} (chainId ${chainId})...`);

  const SupplyChain = await hre.ethers.getContractFactory("SupplyChain");
  const supplyChain = await SupplyChain.deploy();
  await supplyChain.waitForDeployment();

  const address = await supplyChain.getAddress();
  const deployTx = supplyChain.deploymentTransaction();

  console.log("SupplyChain deployed to:", address);

  const contractsDir = path.join(__dirname, "..", "src", "contracts");
  if (!fs.existsSync(contractsDir)) {
    fs.mkdirSync(contractsDir, { recursive: true });
  }

  // A public RPC URL the browser can reach without MetaMask. For localhost this
  // is the Hardhat node; for a testnet it is whatever .env points at.
  const rpcUrl =
    hre.network.name === "localhost" || hre.network.name === "hardhat"
      ? "http://127.0.0.1:8545"
      : hre.network.config.url;

  fs.writeFileSync(
    path.join(contractsDir, "contract-address.json"),
    JSON.stringify(
      {
        SupplyChain: address,
        network: hre.network.name,
        chainId,
        rpcUrl,
        // Block the deployment landed in. Event queries start here instead of
        // block 0, which matters on a testnet where scanning from genesis is
        // slow and some RPC providers cap the range.
        deploymentBlock: deployTx ? deployTx.blockNumber : 0
      },
      undefined,
      2
    )
  );

  const artifact = await hre.artifacts.readArtifact("SupplyChain");
  fs.writeFileSync(
    path.join(contractsDir, "SupplyChain.json"),
    JSON.stringify(artifact, null, 2)
  );

  console.log("Contract artifacts saved to src/contracts/");
  console.log(`  network: ${hre.network.name}  chainId: ${chainId}  rpc: ${rpcUrl}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
