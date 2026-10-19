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
      ).to.be.revertedWithCustomError(supplyChain, "UnauthorizedRole");
    });

    it("should prevent duplicate product registrations", async function () {
      await supplyChain.connect(manufacturer).createProduct(productId, name, batchNumber);
      await expect(
        supplyChain.connect(manufacturer).createProduct(productId, name, batchNumber)
      ).to.be.revertedWithCustomError(supplyChain, "ProductAlreadyExists");
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
      expect(msg).to.equal("A genuine blockchain record exists for this ID.");

      let [nonExists, fakeMsg] = await supplyChain.verifyProduct("FAKE-ID");
      expect(nonExists).to.be.false;
      expect(fakeMsg).to.equal("No blockchain record found for this ID. This product may be counterfeit.");
    });
  });

  describe("Event Payloads", function () {
    // Asserting that an event merely fired proves very little. These check the
    // argument values, which is what any off-chain consumer actually depends on.
    const productId = "PROD-700";

    it("should emit ProductCreated with correct arguments", async function () {
      const tx = supplyChain.connect(manufacturer).createProduct(productId, "Payload Item", "BATCH-P");
      await expect(tx)
        .to.emit(supplyChain, "ProductCreated")
        .withArgs(
          (hashed) => hashed.hash === ethers.id(productId), // indexed string arrives hashed
          productId,
          "Payload Item",
          manufacturer.address,
          (ts) => ts > 0n
        );
    });

    it("should emit ProductTransferred with correct from/to and status", async function () {
      await supplyChain.connect(manufacturer).createProduct(productId, "Payload Item", "BATCH-P");

      await expect(
        supplyChain.connect(manufacturer).transferToDistributor(productId, distributor.address)
      )
        .to.emit(supplyChain, "ProductTransferred")
        .withArgs(
          (hashed) => hashed.hash === ethers.id(productId),
          productId,
          manufacturer.address,
          distributor.address,
          1n,
          (ts) => ts > 0n
        );
    });

    it("should emit RoleAssigned with the account and role", async function () {
      await expect(supplyChain.assignRole(customer.address, 2))
        .to.emit(supplyChain, "RoleAssigned")
        .withArgs(customer.address, 2n);
    });
  });

  describe("Scan Tracking and Clone Detection", function () {
    const productId = "PROD-800";

    beforeEach(async function () {
      await supplyChain.connect(manufacturer).createProduct(productId, "Scanned Item", "BATCH-SC");
    });

    it("should start every product at zero scans", async function () {
      expect(await supplyChain.getScanCount(productId)).to.equal(0n);
    });

    it("should increment the scan count and emit ProductScanned", async function () {
      await expect(supplyChain.connect(customer).recordScan(productId))
        .to.emit(supplyChain, "ProductScanned")
        .withArgs(
          (hashed) => hashed.hash === ethers.id(productId),
          productId,
          customer.address,
          1n,
          (ts) => ts > 0n
        );

      expect(await supplyChain.getScanCount(productId)).to.equal(1n);
    });

    it("should let anyone record a scan, including addresses with no role", async function () {
      expect(await supplyChain.getRole(customer.address)).to.equal(0n);
      await supplyChain.connect(customer).recordScan(productId);
      await supplyChain.connect(customer).recordScan(productId);
      await supplyChain.connect(retailer).recordScan(productId);

      // Clone detection is worth less if only insiders can contribute observations.
      expect(await supplyChain.getScanCount(productId)).to.equal(3n);
    });

    it("should reject scans of products that do not exist", async function () {
      await expect(supplyChain.connect(customer).recordScan("GHOST")).to.be.revertedWithCustomError(
        supplyChain,
        "ProductNotFound"
      );
    });

    it("should keep scan counts independent per product", async function () {
      await supplyChain.connect(manufacturer).createProduct("PROD-801", "Other", "BATCH-SC");
      await supplyChain.connect(customer).recordScan(productId);

      expect(await supplyChain.getScanCount(productId)).to.equal(1n);
      expect(await supplyChain.getScanCount("PROD-801")).to.equal(0n);
    });

    it("should still allow scans after a product is sold, which is the clone signal", async function () {
      await supplyChain.connect(manufacturer).transferToDistributor(productId, distributor.address);
      await supplyChain.connect(distributor).transferToRetailer(productId, retailer.address);
      await supplyChain.connect(retailer).markAsSold(productId);

      // Heavy scanning of an already-sold item is exactly what a cloned label looks
      // like, so recording must remain possible after sale.
      await supplyChain.connect(customer).recordScan(productId);
      expect(await supplyChain.getScanCount(productId)).to.equal(1n);
    });
  });

  describe("Emergency Pause", function () {
    const productId = "PROD-900";

    it("should block pipeline writes while paused", async function () {
      await supplyChain.pause();

      await expect(
        supplyChain.connect(manufacturer).createProduct(productId, "Paused Item", "BATCH-X")
      ).to.be.revertedWithCustomError(supplyChain, "EnforcedPause");
    });

    it("should keep read paths open while paused", async function () {
      await supplyChain.connect(manufacturer).createProduct(productId, "Paused Item", "BATCH-X");
      await supplyChain.pause();

      // Pausing must never be usable to hide information from consumers.
      const [exists] = await supplyChain.verifyProduct(productId);
      expect(exists).to.be.true;

      const product = await supplyChain.getProduct(productId);
      expect(product.name).to.equal("Paused Item");

      const history = await supplyChain.getProductHistory(productId);
      expect(history.length).to.equal(1);
    });

    it("should resume normal operation after unpausing", async function () {
      await supplyChain.pause();
      await supplyChain.unpause();

      await supplyChain.connect(manufacturer).createProduct(productId, "Paused Item", "BATCH-X");
      const product = await supplyChain.getProduct(productId);
      expect(product.name).to.equal("Paused Item");
    });

    it("should restrict pausing to the owner", async function () {
      await expect(
        supplyChain.connect(manufacturer).pause()
      ).to.be.revertedWithCustomError(supplyChain, "OwnableUnauthorizedAccount");
    });

    it("should block transfers mid-pipeline while paused", async function () {
      await supplyChain.connect(manufacturer).createProduct(productId, "Paused Item", "BATCH-X");
      await supplyChain.pause();

      await expect(
        supplyChain.connect(manufacturer).transferToDistributor(productId, distributor.address)
      ).to.be.revertedWithCustomError(supplyChain, "EnforcedPause");
    });
  });

  describe("Input Validation", function () {
    it("should reject an empty product ID", async function () {
      await expect(
        supplyChain.connect(manufacturer).createProduct("", "Some Name", "BATCH-001")
      ).to.be.revertedWithCustomError(supplyChain, "EmptyProductId");
    });

    it("should reject an empty product name", async function () {
      await expect(
        supplyChain.connect(manufacturer).createProduct("PROD-200", "", "BATCH-001")
      ).to.be.revertedWithCustomError(supplyChain, "EmptyProductName");
    });

    it("should reject assigning a role to the zero address", async function () {
      await expect(
        supplyChain.assignRole(ethers.ZeroAddress, 1)
      ).to.be.revertedWithCustomError(supplyChain, "ZeroAddress");
    });

    it("should reject queries for products that do not exist", async function () {
      await expect(supplyChain.getProduct("NOPE")).to.be.revertedWithCustomError(supplyChain, "ProductNotFound");
      await expect(supplyChain.getProductHistory("NOPE")).to.be.revertedWithCustomError(supplyChain, "ProductNotFound");
    });
  });

  describe("Transfer Guards", function () {
    const productId = "PROD-300";

    beforeEach(async function () {
      await supplyChain.connect(manufacturer).createProduct(productId, "Guarded Item", "BATCH-G");
    });

    it("should reject a transfer to a recipient without the Distributor role", async function () {
      await expect(
        supplyChain.connect(manufacturer).transferToDistributor(productId, customer.address)
      ).to.be.revertedWithCustomError(supplyChain, "RecipientWrongRole");
    });

    it("should reject a transfer to a recipient without the Retailer role", async function () {
      await supplyChain.connect(manufacturer).transferToDistributor(productId, distributor.address);
      await expect(
        supplyChain.connect(distributor).transferToRetailer(productId, customer.address)
      ).to.be.revertedWithCustomError(supplyChain, "RecipientWrongRole");
    });

    it("should prevent the same product being sent to a distributor twice", async function () {
      await supplyChain.connect(manufacturer).transferToDistributor(productId, distributor.address);
      await expect(
        supplyChain.connect(manufacturer).transferToDistributor(productId, distributor.address)
      ).to.be.revertedWithCustomError(supplyChain, "UnexpectedStatus");
    });

    it("should prevent a retailer who lacks custody from marking a product sold", async function () {
      // Product is still with the manufacturer, so the retailer holds no custody.
      await expect(
        supplyChain.connect(retailer).markAsSold(productId)
      ).to.be.revertedWithCustomError(supplyChain, "NotCurrentOwner");
    });

    it("should prevent a distributor transferring a product they do not hold", async function () {
      const otherDistributor = customer;
      await supplyChain.assignRole(otherDistributor.address, 2);
      await supplyChain.connect(manufacturer).transferToDistributor(productId, distributor.address);

      await expect(
        supplyChain.connect(otherDistributor).transferToRetailer(productId, retailer.address)
      ).to.be.revertedWithCustomError(supplyChain, "NotCurrentOwner");
    });
  });

  describe("History Trail", function () {
    const productId = "PROD-400";

    it("should record every lifecycle step in order with the correct actors", async function () {
      await supplyChain.connect(manufacturer).createProduct(productId, "Traced Item", "BATCH-T");
      await supplyChain.connect(manufacturer).transferToDistributor(productId, distributor.address);
      await supplyChain.connect(distributor).transferToRetailer(productId, retailer.address);
      await supplyChain.connect(retailer).markAsSold(productId);

      const history = await supplyChain.getProductHistory(productId);
      expect(history.length).to.equal(4);

      expect(history[0].status).to.equal(0n);
      expect(history[0].actor).to.equal(manufacturer.address);
      expect(history[1].status).to.equal(1n);
      expect(history[1].actor).to.equal(distributor.address);
      expect(history[2].status).to.equal(2n);
      expect(history[2].actor).to.equal(retailer.address);
      expect(history[3].status).to.equal(3n);
      expect(history[3].actor).to.equal(retailer.address);

      // Timestamps must be non-decreasing across the trail.
      for (let i = 1; i < history.length; i++) {
        expect(history[i].timestamp).to.be.gte(history[i - 1].timestamp);
      }
    });

    it("should keep the retailer as owner of record after a sale", async function () {
      await supplyChain.connect(manufacturer).createProduct(productId, "Traced Item", "BATCH-T");
      await supplyChain.connect(manufacturer).transferToDistributor(productId, distributor.address);
      await supplyChain.connect(distributor).transferToRetailer(productId, retailer.address);
      await supplyChain.connect(retailer).markAsSold(productId);

      const product = await supplyChain.getProduct(productId);
      expect(product.status).to.equal(3n);
      expect(product.currentOwner).to.equal(retailer.address);
    });
  });

  describe("Event Log Readability", function () {
    // Regression test: productId is declared `string indexed`, so its topic is a
    // keccak hash. The plain copy in the log data is what makes the frontend
    // dashboard possible. If someone removes it, this test fails.
    it("should expose a readable product ID in ProductCreated logs", async function () {
      await supplyChain.connect(manufacturer).createProduct("PROD-500", "Readable", "BATCH-R");

      const events = await supplyChain.queryFilter(supplyChain.filters.ProductCreated());
      expect(events.length).to.equal(1);
      expect(events[0].args.productIdPlain).to.equal("PROD-500");
      expect(events[0].args.name).to.equal("Readable");
    });

    it("should let every registered product be enumerated from logs", async function () {
      await supplyChain.connect(manufacturer).createProduct("PROD-A", "Alpha", "B1");
      await supplyChain.connect(manufacturer).createProduct("PROD-B", "Beta", "B2");

      const events = await supplyChain.queryFilter(supplyChain.filters.ProductCreated());
      const ids = events.map((e) => e.args.productIdPlain);
      expect(ids).to.have.members(["PROD-A", "PROD-B"]);
    });
  });

  describe("Admin Custody Recovery", function () {
    const productId = "PROD-600";
    let replacementDistributor;

    beforeEach(async function () {
      replacementDistributor = customer;
      await supplyChain.connect(manufacturer).createProduct(productId, "Stuck Item", "BATCH-S");
      await supplyChain.connect(manufacturer).transferToDistributor(productId, distributor.address);
    });

    it("should demonstrate the deadlock that recovery exists to solve", async function () {
      // Owner revokes the distributor's role while they are holding the product.
      await supplyChain.assignRole(distributor.address, 0);

      // The holder can no longer move it on, because onlyRole now fails.
      await expect(
        supplyChain.connect(distributor).transferToRetailer(productId, retailer.address)
      ).to.be.revertedWithCustomError(supplyChain, "UnauthorizedRole");
    });

    it("should let the owner reassign custody out of a stuck state", async function () {
      await supplyChain.assignRole(distributor.address, 0);
      await supplyChain.assignRole(replacementDistributor.address, 2);

      await expect(
        supplyChain.adminReassignCustody(productId, replacementDistributor.address, 1)
      ).to.emit(supplyChain, "CustodyReassigned");

      const product = await supplyChain.getProduct(productId);
      expect(product.currentOwner).to.equal(replacementDistributor.address);
      expect(product.status).to.equal(1n);

      // The pipeline is unblocked: the replacement can complete the handover.
      await supplyChain.connect(replacementDistributor).transferToRetailer(productId, retailer.address);
      const after = await supplyChain.getProduct(productId);
      expect(after.currentOwner).to.equal(retailer.address);
    });

    it("should restrict custody reassignment to the owner", async function () {
      await expect(
        supplyChain.connect(distributor).adminReassignCustody(productId, distributor.address, 1)
      ).to.be.revertedWithCustomError(supplyChain, "OwnableUnauthorizedAccount");
    });

    it("should reject a replacement whose role does not match the target status", async function () {
      // retailer holds Role.Retailer, which is inconsistent with DistributorReceived.
      await expect(
        supplyChain.adminReassignCustody(productId, retailer.address, 1)
      ).to.be.revertedWithCustomError(supplyChain, "RecipientWrongRole");
    });

    it("should reject reassignment to the zero address", async function () {
      await expect(
        supplyChain.adminReassignCustody(productId, ethers.ZeroAddress, 1)
      ).to.be.revertedWithCustomError(supplyChain, "ZeroAddress");
    });

    it("should refuse to reopen a completed lifecycle", async function () {
      await supplyChain.connect(distributor).transferToRetailer(productId, retailer.address);
      await supplyChain.connect(retailer).markAsSold(productId);

      await expect(
        supplyChain.adminReassignCustody(productId, distributor.address, 1)
      ).to.be.revertedWithCustomError(supplyChain, "LifecycleComplete");
    });

    it("should allow rollback to Manufactured with a manufacturer recipient", async function () {
      // Covers the Status.Manufactured branch: a shipment rejected by the distributor
      // has to be able to go back to the factory.
      await expect(
        supplyChain.adminReassignCustody(productId, manufacturer.address, 0)
      ).to.emit(supplyChain, "CustodyReassigned");

      const product = await supplyChain.getProduct(productId);
      expect(product.status).to.equal(0n);
      expect(product.currentOwner).to.equal(manufacturer.address);
    });

    it("should reject rollback to Manufactured with a non-manufacturer recipient", async function () {
      await expect(
        supplyChain.adminReassignCustody(productId, retailer.address, 0)
      ).to.be.revertedWithCustomError(supplyChain, "RecipientWrongRole");
    });

    it("should allow forward reassignment to RetailerReceived with a retailer", async function () {
      // Covers the else branch (Status.RetailerReceived).
      await expect(
        supplyChain.adminReassignCustody(productId, retailer.address, 2)
      ).to.emit(supplyChain, "CustodyReassigned");

      const product = await supplyChain.getProduct(productId);
      expect(product.status).to.equal(2n);
      expect(product.currentOwner).to.equal(retailer.address);

      // And the retailer can then complete the lifecycle normally.
      await supplyChain.connect(retailer).markAsSold(productId);
      expect((await supplyChain.getProduct(productId)).status).to.equal(3n);
    });

    it("should reject reassignment to RetailerReceived with a non-retailer", async function () {
      await expect(
        supplyChain.adminReassignCustody(productId, manufacturer.address, 2)
      ).to.be.revertedWithCustomError(supplyChain, "RecipientWrongRole");
    });

    it("should append a history entry for every administrative reassignment", async function () {
      const before = await supplyChain.getProductHistory(productId);
      await supplyChain.adminReassignCustody(productId, manufacturer.address, 0);
      const after = await supplyChain.getProductHistory(productId);

      // Interventions must be visible in the audit trail, not silent.
      expect(after.length).to.equal(before.length + 1);
      expect(after[after.length - 1].actor).to.equal(manufacturer.address);
      expect(after[after.length - 1].status).to.equal(0n);
    });

    it("should reject reassignment of an unknown product", async function () {
      await expect(
        supplyChain.adminReassignCustody("GHOST", distributor.address, 1)
      ).to.be.revertedWithCustomError(supplyChain, "ProductNotFound");
    });
  });
});
