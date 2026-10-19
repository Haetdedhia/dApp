const hre = require("hardhat");

/**
 * Seeds a freshly deployed contract with roles and sample products so a live
 * demo starts from a populated state instead of an empty registry.
 *
 * Run AFTER deploy.js, against the same node:
 *   npx hardhat run scripts/seed.js --network localhost
 *
 * Uses the default Hardhat signers, so accounts #1/#2/#3 become the
 * Manufacturer / Distributor / Retailer. Import their private keys into
 * MetaMask (printed by `npx hardhat node`) to act as each role.
 */
async function main() {
  const deployment = require("../src/contracts/contract-address.json");
  const [owner, manufacturer, distributor, retailer] = await hre.ethers.getSigners();

  const supplyChain = await hre.ethers.getContractAt("SupplyChain", deployment.SupplyChain);

  console.log("Seeding", deployment.SupplyChain, "on", deployment.network);
  console.log("");

  console.log("Assigning roles...");
  await (await supplyChain.connect(owner).assignRole(manufacturer.address, 1)).wait();
  await (await supplyChain.connect(owner).assignRole(distributor.address, 2)).wait();
  await (await supplyChain.connect(owner).assignRole(retailer.address, 3)).wait();
  console.log(`  Manufacturer : ${manufacturer.address}`);
  console.log(`  Distributor  : ${distributor.address}`);
  console.log(`  Retailer     : ${retailer.address}`);
  console.log("");

  // Three products, each left at a different stage, so the dashboard shows a
  // spread of statuses and the verify timeline has something to display.
  const samples = [
    { id: "MED-2026-001", name: "Paracetamol 500mg", batch: "BATCH-77A9", stage: 3 },
    { id: "MED-2026-002", name: "Amoxicillin 250mg", batch: "BATCH-77B2", stage: 2 },
    { id: "MED-2026-003", name: "Insulin Glargine", batch: "BATCH-77C5", stage: 1 },
    { id: "MED-2026-004", name: "Ibuprofen 400mg", batch: "BATCH-77D8", stage: 0 }
  ];

  for (const sample of samples) {
    await (
      await supplyChain.connect(manufacturer).createProduct(sample.id, sample.name, sample.batch)
    ).wait();

    if (sample.stage >= 1) {
      await (
        await supplyChain.connect(manufacturer).transferToDistributor(sample.id, distributor.address)
      ).wait();
    }
    if (sample.stage >= 2) {
      await (
        await supplyChain.connect(distributor).transferToRetailer(sample.id, retailer.address)
      ).wait();
    }
    if (sample.stage >= 3) {
      await (await supplyChain.connect(retailer).markAsSold(sample.id)).wait();
    }

    const labels = ["Manufactured", "DistributorReceived", "RetailerReceived", "Sold"];
    console.log(`  ${sample.id.padEnd(14)} ${labels[sample.stage]}`);
  }

  // Simulate a cloned label: MED-2026-001 is already Sold, yet its code keeps being
  // checked. That pattern is what the verify page flags as a possible copy.
  console.log("");
  console.log("Simulating cloned-label scan activity on MED-2026-001...");
  const scanners = await hre.ethers.getSigners();
  for (let i = 0; i < 8; i++) {
    await (await supplyChain.connect(scanners[i % scanners.length]).recordScan("MED-2026-001")).wait();
  }
  console.log(`  scan count: ${await supplyChain.getScanCount("MED-2026-001")}`);

  console.log("");
  console.log("Seed complete. Demo paths:");
  console.log("  /verify/MED-2026-001  genuine record + CLONE WARNING (sold but still scanned)");
  console.log("  /verify/MED-2026-003  genuine record, mid-chain, no warning");
  console.log("  /verify/FAKE-999      counterfeit path");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
