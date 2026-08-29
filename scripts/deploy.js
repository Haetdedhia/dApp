const hre = require("hardhat");

async function main() {
  console.log("Deploying SupplyChain contract...");

  const SupplyChain = await hre.ethers.getContractFactory("SupplyChain");
  const supplyChain = await SupplyChain.deploy();

  await supplyChain.waitForDeployment();

  const address = await supplyChain.getAddress();

  console.log("SupplyChain deployed to:", address);

  // Save the contract address for the frontend
  const fs = require("fs");
  const contractsDir = __dirname + "/../src/contracts";

  if (!fs.existsSync(contractsDir)) {
    fs.mkdirSync(contractsDir, { recursive: true });
  }

  fs.writeFileSync(
    contractsDir + "/contract-address.json",
    JSON.stringify({ SupplyChain: address }, undefined, 2)
  );

  // Copy the ABI
  const SupplyChainArtifact = await hre.artifacts.readArtifact("SupplyChain");

  fs.writeFileSync(
    contractsDir + "/SupplyChain.json",
    JSON.stringify(SupplyChainArtifact, null, 2)
  );

  console.log("Contract artifacts saved to src/contracts/");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
