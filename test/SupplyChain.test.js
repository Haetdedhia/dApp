const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("SupplyChain", function () {
  let SupplyChain;
  let supplyChain;
  let owner;
  let manufacturer;
  let distributor;
  let retailer;
  let customer;

  beforeEach(async function () {
    [owner, manufacturer, distributor, retailer, customer] = await ethers.getSigners();

    SupplyChain = await ethers.getContractFactory("SupplyChain");
    supplyChain = await SupplyChain.deploy();
    await supplyChain.waitForDeployment();

    // Assign roles
    await supplyChain.assignRole(manufacturer.address, 1); // Manufacturer
    await supplyChain.assignRole(distributor.address, 2);  // Distributor
    await supplyChain.assignRole(retailer.address, 3);     // Retailer
  });

  describe("Role Assignment", function () {
    it("should assign roles correctly", async function () {
      expect(await supplyChain.getRole(manufacturer.address)).to.equal(1);
      expect(await supplyChain.getRole(distributor.address)).to.equal(2);
      expect(await supplyChain.getRole(retailer.address)).to.equal(3);
      expect(await supplyChain.getRole(customer.address)).to.equal(0); // None
    });

    it("should restrict role assignment to owner", async function () {
      await expect(
        supplyChain.connect(manufacturer).assignRole(customer.address, 1)
      ).to.be.revertedWithCustomError(supplyChain, "OwnableUnauthorizedAccount");
    });
  });

  describe("Product Management Flow", function () {
    const productId = "PROD-101";
    const name = "Generic Drug Alpha";
    const batchNumber = "BATCH-001";

    it("should allow a manufacturer to create a product", async function () {
      await expect(supplyChain.connect(manufacturer).createProduct(productId, name, batchNumber))
        .to.emit(supplyChain, "ProductCreated");

      const product = await supplyChain.getProduct(productId);
      expect(product.productId).to.equal(productId);
      expect(product.name).to.equal(name);
      expect(product.batchNumber).to.equal(batchNumber);
      expect(product.manufacturer).to.equal(manufacturer.address);
      expect(product.currentOwner).to.equal(manufacturer.address);
      expect(product.status).to.equal(0n); // Manufactured
    });

    it("should prevent non-manufacturers from creating products", async function () {
      await expect(
        supplyChain.connect(distributor).createProduct(productId, name, batchNumber)
      ).to.be.revertedWith("Unauthorized: Invalid role");
    });

    it("should prevent duplicate product registrations", async function () {
      await supplyChain.connect(manufacturer).createProduct(productId, name, batchNumber);
      await expect(
        supplyChain.connect(manufacturer).createProduct(productId, name, batchNumber)
      ).to.be.revertedWith("Product already exists");
    });

    it("should track transfer from Manufacturer to Distributor", async function () {
      await supplyChain.connect(manufacturer).createProduct(productId, name, batchNumber);
      await expect(supplyChain.connect(manufacturer).transferToDistributor(productId, distributor.address))
        .to.emit(supplyChain, "ProductTransferred");

      const product = await supplyChain.getProduct(productId);
      expect(product.currentOwner).to.equal(distributor.address);
      expect(product.status).to.equal(1n);
    });

    it("should track transfer from Distributor to Retailer", async function () {
      await supplyChain.connect(manufacturer).createProduct(productId, name, batchNumber);
      await supplyChain.connect(manufacturer).transferToDistributor(productId, distributor.address);
      await expect(supplyChain.connect(distributor).transferToRetailer(productId, retailer.address))
        .to.emit(supplyChain, "ProductTransferred");

      const product = await supplyChain.getProduct(productId);
      expect(product.currentOwner).to.equal(retailer.address);
      expect(product.status).to.equal(2n);
    });

    it("should allow retailer to mark product as sold", async function () {
      await supplyChain.connect(manufacturer).createProduct(productId, name, batchNumber);
      await supplyChain.connect(manufacturer).transferToDistributor(productId, distributor.address);
      await supplyChain.connect(distributor).transferToRetailer(productId, retailer.address);
      await expect(supplyChain.connect(retailer).markAsSold(productId))
        .to.emit(supplyChain, "ProductTransferred");

      const product = await supplyChain.getProduct(productId);
      expect(product.status).to.equal(3n);
    });

    it("should verify products and detect counterfeits", async function () {
      await supplyChain.connect(manufacturer).createProduct(productId, name, batchNumber);

      let [exists, msg] = await supplyChain.verifyProduct(productId);
      expect(exists).to.be.true;
      expect(msg).to.equal("Product verified on blockchain");

      let [nonExists, fakeMsg] = await supplyChain.verifyProduct("FAKE-ID");
      expect(nonExists).to.be.false;
      expect(fakeMsg).to.equal("No verified blockchain record found. Product may be counterfeit.");
    });
  });
});
