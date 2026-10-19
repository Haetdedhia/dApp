const { expect } = require("chai");
const { ethers } = require("hardhat");

/**
 * Micro-benchmark backing docs/GAS-ANALYSIS.md.
 *
 * Measures the cost of keying a record by `string` versus `bytes32`, holding
 * everything else constant. Prints a table rather than asserting a specific number,
 * because exact gas depends on the compiler version and optimiser settings - the
 * point is the magnitude of the difference, not an exact figure to regress against.
 */
describe("Gas: string vs bytes32 identifiers", function () {
  const SAMPLE_ID = "MED-2026-001";
  const SAMPLE_NAME = "Paracetamol 500mg";

  it("measures the cost of each identifier type", async function () {
    const StringStore = await ethers.getContractFactory("StringIdStore");
    const stringStore = await StringStore.deploy();
    await stringStore.waitForDeployment();

    const BytesStore = await ethers.getContractFactory("Bytes32IdStore");
    const bytesStore = await BytesStore.deploy();
    await bytesStore.waitForDeployment();

    const stringTx = await stringStore.store(SAMPLE_ID, SAMPLE_NAME);
    const stringReceipt = await stringTx.wait();

    // A readable ID maps onto bytes32 cleanly while it is 31 bytes or shorter,
    // which covers any realistic SKU. Longer IDs would need keccak256 instead,
    // at the cost of no longer being readable on-chain.
    const bytesId = ethers.encodeBytes32String(SAMPLE_ID);
    const bytesTx = await bytesStore.store(bytesId, SAMPLE_NAME);
    const bytesReceipt = await bytesTx.wait();

    const stringGas = Number(stringReceipt.gasUsed);
    const bytesGas = Number(bytesReceipt.gasUsed);
    const saved = stringGas - bytesGas;
    const pct = ((saved / stringGas) * 100).toFixed(1);

    console.log("");
    console.log("      Identifier type      store() gas");
    console.log("      ------------------   -----------");
    console.log(`      string               ${stringGas}`);
    console.log(`      bytes32              ${bytesGas}`);
    console.log(`      saving               ${saved} (${pct}%)`);
    console.log("");

    // Directional assertion only: bytes32 must not be more expensive.
    expect(bytesGas).to.be.lessThan(stringGas);
  });

  it("measures deployment size for each", async function () {
    const stringArtifact = await hre.artifacts.readArtifact("StringIdStore");
    const bytesArtifact = await hre.artifacts.readArtifact("Bytes32IdStore");

    const stringSize = (stringArtifact.deployedBytecode.length - 2) / 2;
    const bytesSize = (bytesArtifact.deployedBytecode.length - 2) / 2;

    console.log("");
    console.log("      Identifier type      deployed bytecode");
    console.log("      ------------------   -----------------");
    console.log(`      string               ${stringSize} bytes`);
    console.log(`      bytes32              ${bytesSize} bytes`);
    console.log("");

    expect(bytesSize).to.be.lessThan(stringSize);
  });
});
