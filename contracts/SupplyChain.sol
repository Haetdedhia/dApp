// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";

/**
 * @title Decentralized Supply Chain Tracker
 * @notice Keeps record of products moving from manufacturers through distributors and retailers to final consumers.
 *
 * @dev Inherits Ownable for role administration and Pausable for emergency response.
 *
 *      ON PAUSABLE: the contract is immutable once deployed, so a bug found in
 *      production cannot be patched. Pausing is the only available containment: it
 *      freezes every state-changing pipeline function while leaving all read paths
 *      open, so consumers can still verify products they already own while the
 *      problem is investigated.
 *
 *      The trade-off is that the owner can unilaterally halt the entire supply chain.
 *      That is a real centralisation risk, accepted deliberately and recorded in
 *      docs/THREAT-MODEL.md. Reads are intentionally never pausable, so a compromised
 *      or careless owner cannot blind consumers.
 */
contract SupplyChain is Ownable, Pausable {

    // Status states reflecting each point in the physical supply chain dispatch lifecycle
    enum Status {
        Manufactured,          // 0: Registered on-chain by the Manufacturer
        DistributorReceived,   // 1: Accepted & verified by the designated Distributor
        RetailerReceived,      // 2: Received in inventory by the designated Retailer
        Sold                   // 3: Purchased by and dispatched to the final consumer
    }

    // Authorization roles for restricted state-change transactions
    enum Role {
        None,                  // 0: Standard user / public consumer (read-only verification query permissions)
        Manufacturer,          // 1: Can register new items & hand off to Distributors
        Distributor,           // 2: Can accept shipments from Manufacturers & hand off to Retailers
        Retailer               // 3: Can accept shipments from Distributors & tag status as Sold
    }

    /**
     * @notice Core product record stored immutably on the blockchain.
     * @dev Each product is uniquely identified by productId and tracked through its full lifecycle.
     */
    /**
     * @dev FIELD ORDER IS DELIBERATE - see docs/GAS-ANALYSIS.md.
     *
     *      The EVM charges per 32-byte storage slot, so fields are ordered to let the
     *      compiler pack several into one slot:
     *
     *        slot n   : manufacturer (20) + status (1) + exists (1)  = 22 of 32 bytes
     *        slot n+1 : currentOwner (20) + manufacturedDate (8)     = 28 of 32 bytes
     *
     *      Written naively - addresses separated by a uint256 - the same data occupies
     *      four slots instead of two, costing an extra ~40,000 gas on every single
     *      registration.
     *
     *      `manufacturedDate` is uint64 rather than uint256 so it fits alongside an
     *      address. uint64 seconds overflows in the year 584,942,417,355, which is a
     *      risk we are prepared to accept.
     *
     *      There is deliberately NO `productId` field: the ID is already the mapping
     *      key, and storing it again cost a second copy of the whole string for nothing.
     *      getProduct echoes back the caller's argument instead.
     */
    struct Product {
        string name;                // Human-readable product name
        string batchNumber;         // Batch/lot identifier for traceability grouping
        address manufacturer;       // Original creator address (never changes)  ─┐ packed
        Status status;              // Current lifecycle stage                    │
        bool exists;                // Registration marker (prevents false lookups)┘
        address currentOwner;       // Current custody holder                    ─┐ packed
        uint64 manufacturedDate;    // Unix timestamp of product creation         ┘
    }

    /**
     * @notice Audit log entry recording each state change event.
     * @dev Enables complete provenance tracking from manufacture through final sale.
     */
    /**
     * @dev Packed into a SINGLE storage slot: actor (20) + status (1) + timestamp (8)
     *      = 29 of 32 bytes. With a uint256 timestamp this needed two slots, so every
     *      lifecycle step cost an extra ~20,000 gas. Four steps per product, so the
     *      saving compounds across the whole registry.
     */
    struct HistoryEntry {
        address actor;              // Address of entity performing the action
        Status status;              // Status achieved after this transaction
        uint64 timestamp;           // Unix timestamp when change occurred
    }

    // ===== STATE MAPPINGS: Core data persistence structures =====

    /// @notice Primary registry mapping productId strings to Product records
    mapping(string => Product) public products;

    /// @notice Audit trail mapping productId to chronological HistoryEntry array
    mapping(string => HistoryEntry[]) public productHistory;

    /// @notice Role assignment mapping addresses to their authorization level
    mapping(address => Role) public roles;

    /// @notice Count of recorded verification scans per product, used for clone detection
    /// @dev See recordScan for why this is tracked separately from the free `view` lookup.
    mapping(string => uint256) public scanCount;

    // ===== CUSTOM ERRORS =====

    /**
     * @dev Custom errors replace `require` strings throughout this contract.
     *
     *      A revert string is stored in the deployed bytecode as raw UTF-8 and ABI-encoded
     *      at revert time; a custom error is a 4-byte selector plus its arguments. That
     *      saves deployment size and execution gas on every failing call, and - more
     *      useful in practice - lets the revert carry typed data. "Unauthorized: Invalid
     *      role" tells a caller nothing; UnauthorizedRole(Manufacturer, Distributor) tells
     *      them exactly what was required and what they had.
     *
     *      Available since Solidity 0.8.4. See docs/GAS-ANALYSIS.md for measurements.
     */

    /// @notice Caller does not hold the role this function requires
    error UnauthorizedRole(Role required, Role actual);

    /// @notice No product is registered under this ID
    error ProductNotFound(string productId);

    /// @notice A product is already registered under this ID
    error ProductAlreadyExists(string productId);

    /// @notice Product ID was an empty string
    error EmptyProductId();

    /// @notice Product name was an empty string
    error EmptyProductName();

    /// @notice An address argument was the zero address
    error ZeroAddress();

    /// @notice Caller is not the manufacturer that originally registered this product
    error NotTheManufacturer();

    /// @notice Caller does not currently hold custody of this product
    error NotCurrentOwner(address currentOwner, address caller);

    /// @notice Product is not in the lifecycle stage this operation requires
    error UnexpectedStatus(Status expected, Status actual);

    /// @notice Intended recipient does not hold the role this transfer requires
    error RecipientWrongRole(Role required, Role actual);

    /// @notice Product has already been sold and its lifecycle cannot be reopened
    error LifecycleComplete(string productId);

    // ===== EVENTS: Audit logs and frontend listener triggers =====

    /**
     * @notice Emitted when a Manufacturer logs a new product batch onto the ledger
     * @dev Note the productId appears twice, and this is deliberate.
     *      Solidity stores an `indexed` dynamic type (string, bytes, array) in the log
     *      topic as its keccak256 HASH, not its value. An off-chain listener reading
     *      `productId` therefore receives a 32-byte hash it cannot reverse, which makes
     *      enumerating products from logs impossible.
     *      - `productId` (indexed) stays so callers can filter for an ID they already know.
     *      - `productIdPlain` (not indexed) sits in the log data, where the full readable
     *        string survives, so the frontend dashboard can list every product.
     */
    event ProductCreated(
        string indexed productId,
        string productIdPlain,
        string name,
        address indexed manufacturer,
        uint256 timestamp
    );

    /// @notice Emitted on any state transition or change of custody ownership
    /// @dev See ProductCreated for why productId is emitted both indexed and plain.
    event ProductTransferred(
        string indexed productId,
        string productIdPlain,
        address indexed from,
        address indexed to,
        Status newStatus,
        uint256 timestamp
    );

    /// @notice Emitted when the contract owner modifies role authorizations
    event RoleAssigned(address indexed account, Role role);

    /**
     * @notice Emitted each time a verification scan is recorded against a product
     * @dev Lets an off-chain monitor spot cloned labels by their scan pattern -
     *      geographic spread, frequency, or activity after the item was marked Sold.
     */
    event ProductScanned(
        string indexed productId,
        string productIdPlain,
        address indexed scanner,
        uint256 newScanCount,
        uint256 timestamp
    );

    /**
     * @notice Emitted when the owner force-moves a product out of a stuck state
     * @dev See adminReassignCustody for the deadlock this recovers from.
     */
    event CustodyReassigned(
        string indexed productId,
        string productIdPlain,
        address indexed previousOwner,
        address indexed newOwner,
        Status newStatus,
        uint256 timestamp
    );

    /**
     * @notice Constructor sets the deployer address as the initial contract owner
     * @dev Passes the deployer address to the OpenZeppelin Ownable base constructor
     */
    constructor() Ownable(msg.sender) {}

    // ===== MODIFIERS: Transaction pre-condition enforcement =====

    /**
     * @dev Ensures that msg.sender has the exact role required to execute the function
     * @param _role The Role enum value required (Manufacturer, Distributor, or Retailer)
     */
    modifier onlyRole(Role _role) {
        if (roles[msg.sender] != _role) revert UnauthorizedRole(_role, roles[msg.sender]);
        _;
    }

    /**
     * @dev Ensures that a product with the given ID has already been registered on-chain
     * @param _productId Unique identifier string for the target item
     */
    modifier productExists(string calldata _productId) {
        if (!products[_productId].exists) revert ProductNotFound(_productId);
        _;
    }

    // ===== ROLE MANAGEMENT (Admin Controls) =====

    /**
     * @notice Assigns a specialized supply chain role to an address
     * @dev Restricted to the contract deployer (owner) only. Overrides prior choices.
     * @param _account Wallet address of target supply chain actor
     * @param _role Target role enumeration value
     */
    function assignRole(address _account, Role _role) external onlyOwner {
        if (_account == address(0)) revert ZeroAddress();
        roles[_account] = _role;
        emit RoleAssigned(_account, _role);
    }

    /**
     * @notice Retrieves the role currently assigned to a specific address
     * @param _account Wallet address to query
     * @return The Role enum value (0: None, 1: Manufacturer, 2: Distributor, 3: Retailer)
     */
    function getRole(address _account) external view returns (Role) {
        return roles[_account];
    }

    // ===== SUPPLY CHAIN PIPELINE FLOWS (State Machine) =====

    /**
     * @notice Creates (registers) a new product entry in the ledger
     * @dev Only users with Role.Manufacturer can call this. Writes to products & history array.
     * @param _productId Unique scan ID (e.g., UUID or GTIN string)
     * @param _name Simple retail/manufacturing item name
     * @param _batchNumber Grouping identifier for product batching
     */
    function createProduct(
        string calldata _productId,
        string calldata _name,
        string calldata _batchNumber
    ) external onlyRole(Role.Manufacturer) whenNotPaused {
        // Pre-validation checks for state and parameter safety
        if (products[_productId].exists) revert ProductAlreadyExists(_productId);
        if (bytes(_productId).length == 0) revert EmptyProductId();
        if (bytes(_name).length == 0) revert EmptyProductName();

        Product memory newProduct = Product({
            name: _name,
            batchNumber: _batchNumber,
            manufacturer: msg.sender,
            status: Status.Manufactured,
            exists: true,
            currentOwner: msg.sender,
            manufacturedDate: uint64(block.timestamp)
        });

        // Store primary product details in persistent mapping
        products[_productId] = newProduct;

        // Append initial creation event to tracking history (Manufactured status)
        productHistory[_productId].push(
            HistoryEntry({
                actor: msg.sender,
                status: Status.Manufactured,
                timestamp: uint64(block.timestamp)
            })
        );

        emit ProductCreated(_productId, _productId, _name, msg.sender, block.timestamp);
    }

    /**
     * @notice Performs first custody transfer from Manufacturer to authorized Distributor
     * @dev Restricts caller to the original constructor-authorized Manufacturer role.
     * @param _productId Registry product key
     * @param _distributor Target address of the recipient, which must have Role.Distributor
     */
    function transferToDistributor(string calldata _productId, address _distributor)
        external
        onlyRole(Role.Manufacturer)
        productExists(_productId)
        whenNotPaused
    {
        Product storage product = products[_productId];

        // Safety assertions: Only original manufacturer can transfer, and state must be fresh
        if (product.manufacturer != msg.sender) revert NotTheManufacturer();
        if (product.status != Status.Manufactured) revert UnexpectedStatus(Status.Manufactured, product.status);
        if (roles[_distributor] != Role.Distributor) revert RecipientWrongRole(Role.Distributor, roles[_distributor]);

        // Update ownership and status state
        product.currentOwner = _distributor;
        product.status = Status.DistributorReceived;

        // Record audit entry for custody change
        productHistory[_productId].push(
            HistoryEntry({
                actor: _distributor,
                status: Status.DistributorReceived,
                timestamp: uint64(block.timestamp)
            })
        );

        emit ProductTransferred(
            _productId,
            _productId,
            msg.sender,
            _distributor,
            Status.DistributorReceived,
            block.timestamp
        );
    }

    /**
     * @notice Transfer custody from Distributor to authorized Retailer
     * @dev Restricts caller to current owner holding Role.Distributor.
     * @param _productId Registry product key
     * @param _retailer Target address of retail storefront, must have Role.Retailer
     */
    function transferToRetailer(string calldata _productId, address _retailer)
        external
        onlyRole(Role.Distributor)
        productExists(_productId)
        whenNotPaused
    {
        Product storage product = products[_productId];

        // Safety assertions: caller must be current active owner, status must show Distributor receipt
        if (product.currentOwner != msg.sender) revert NotCurrentOwner(product.currentOwner, msg.sender);
        if (product.status != Status.DistributorReceived) revert UnexpectedStatus(Status.DistributorReceived, product.status);
        if (roles[_retailer] != Role.Retailer) revert RecipientWrongRole(Role.Retailer, roles[_retailer]);

        // Update ownership and status state
        product.currentOwner = _retailer;
        product.status = Status.RetailerReceived;

        // Record history log
        productHistory[_productId].push(
            HistoryEntry({
                actor: _retailer,
                status: Status.RetailerReceived,
                timestamp: uint64(block.timestamp)
            })
        );

        emit ProductTransferred(
            _productId,
            _productId,
            msg.sender,
            _retailer,
            Status.RetailerReceived,
            block.timestamp
        );
    }

    /**
     * @notice Finalizes product status marking it as Sold to consumer
     * @dev Only the Retailer holding current custody can finalize this transaction.
     * @param _productId Registry product key
     */
    function markAsSold(string calldata _productId)
        external
        onlyRole(Role.Retailer)
        productExists(_productId)
        whenNotPaused
    {
        Product storage product = products[_productId];

        // Safety assertions: caller must have custody, product must be at retail status
        if (product.currentOwner != msg.sender) revert NotCurrentOwner(product.currentOwner, msg.sender);
        if (product.status != Status.RetailerReceived) revert UnexpectedStatus(Status.RetailerReceived, product.status);

        // A sale is a STATUS change, not a custody change. The consumer is off-chain
        // and has no address, so currentOwner deliberately stays with the retailer as
        // the final on-chain custodian of record — this preserves accountability for
        // who sold the item. The event below reflects that same meaning rather than
        // claiming a transfer to address(0) that never happens in state.
        product.status = Status.Sold;

        // Record final history entry
        productHistory[_productId].push(
            HistoryEntry({
                actor: msg.sender,
                status: Status.Sold,
                timestamp: uint64(block.timestamp)
            })
        );

        emit ProductTransferred(
            _productId,
            _productId,
            msg.sender,
            msg.sender,
            Status.Sold,
            block.timestamp
        );
    }

    // ===== EMERGENCY CONTROLS =====

    /**
     * @notice Halts all state-changing supply chain operations
     * @dev Read paths (verifyProduct, getProduct, getProductHistory) stay open by
     *      design, so pausing cannot be used to hide information from consumers.
     */
    function pause() external onlyOwner {
        _pause();
    }

    /// @notice Resumes normal operation after a pause
    function unpause() external onlyOwner {
        _unpause();
    }

    // ===== ADMINISTRATIVE RECOVERY =====

    /**
     * @notice Owner-only escape hatch that moves a product out of a stuck state
     * @dev WHY THIS EXISTS: every pipeline function is gated on an exact role match
     *      (see the onlyRole modifier). If the owner reassigns or clears the role of an
     *      address that is currently holding a product, that address can no longer call
     *      the onward transfer, and no other role can either because each function also
     *      requires the caller to be the current owner. The product would be deadlocked
     *      on-chain permanently.
     *
     *      TRADE-OFF: this reintroduces a point of centralisation. The owner can move any
     *      product at any time. That is a deliberate choice — the alternative is permanent
     *      loss of goods — and it is made auditable by the CustodyReassigned event, which
     *      is distinct from ProductTransferred so that an administrative intervention can
     *      never be mistaken for a normal supply chain movement.
     *
     * @param _productId Registry product key
     * @param _newOwner Address that should take custody; must hold the role matching _newStatus
     * @param _newStatus Status to move the product to
     */
    function adminReassignCustody(
        string calldata _productId,
        address _newOwner,
        Status _newStatus
    ) external onlyOwner productExists(_productId) {
        if (_newOwner == address(0)) revert ZeroAddress();

        Product storage product = products[_productId];
        if (product.status == Status.Sold) revert LifecycleComplete(_productId);

        // The replacement custodian must hold the role that the target status implies,
        // otherwise this would just move the deadlock somewhere else.
        if (_newStatus == Status.Manufactured) {
            if (roles[_newOwner] != Role.Manufacturer) revert RecipientWrongRole(Role.Manufacturer, roles[_newOwner]);
        } else if (_newStatus == Status.DistributorReceived) {
            if (roles[_newOwner] != Role.Distributor) revert RecipientWrongRole(Role.Distributor, roles[_newOwner]);
        } else {
            if (roles[_newOwner] != Role.Retailer) revert RecipientWrongRole(Role.Retailer, roles[_newOwner]);
        }

        address previousOwner = product.currentOwner;
        product.currentOwner = _newOwner;
        product.status = _newStatus;

        productHistory[_productId].push(
            HistoryEntry({
                actor: _newOwner,
                status: _newStatus,
                timestamp: uint64(block.timestamp)
            })
        );

        emit CustodyReassigned(
            _productId,
            _productId,
            previousOwner,
            _newOwner,
            _newStatus,
            block.timestamp
        );
    }

    // ===== QUERY AND VERIFICATION READ-ONLY VIEWS =====

    /**
     * @notice Retrieves the full record parameters of a product
     * @param _productId Product scan query filter
     * @return productId Unique scan code
     * @return name Product item name
     * @return batchNumber Lot number
     * @return manufacturer Initial factory owner
     * @return currentOwner Active structural owner
     * @return status Active pipeline status enum
     * @return manufacturedDate Creation unix time
     */
    function getProduct(string calldata _productId)
        external
        view
        productExists(_productId)
        returns (
            string memory productId,
            string memory name,
            string memory batchNumber,
            address manufacturer,
            address currentOwner,
            Status status,
            uint256 manufacturedDate
        )
    {
        Product memory product = products[_productId];
        return (
            // Echoed back from the argument rather than read from storage: the ID is
            // already the mapping key, so storing a second copy would have cost a
            // whole extra string write on every registration for no new information.
            _productId,
            product.name,
            product.batchNumber,
            product.manufacturer,
            product.currentOwner,
            product.status,
            product.manufacturedDate
        );
    }

    /**
     * @notice Returns the array history of custody and state updates for a product ID
     * @param _productId Product scan query filter
     * @return Array of HistoryEntry structures containing chronological audits
     */
    function getProductHistory(string calldata _productId)
        external
        view
        productExists(_productId)
        returns (HistoryEntry[] memory)
    {
        return productHistory[_productId];
    }

    /**
     * @notice Consumer-facing check for whether a registered record exists for an ID
     *
     * @dev IMPORTANT - READ THE WORDING CAREFULLY.
     *      This function answers exactly one question: "does a record with this ID
     *      exist on this chain?" It does NOT and CANNOT answer "is the physical object
     *      in the customer's hand genuine?"
     *
     *      A QR code is a number printed on a box. A counterfeiter who photographs a
     *      genuine label and reprints it 10,000 times produces 10,000 fakes that all
     *      return `true` here, because the record they point at is real. This is the
     *      oracle problem: a blockchain can attest to records, never to physical goods.
     *
     *      The returned messages are therefore deliberately phrased as claims about the
     *      RECORD, not about the product. Overclaiming here would mislead exactly the
     *      people the feature is meant to protect. See docs/LIMITATIONS.md.
     *
     * @param _productId Product code scanned by buyer
     * @return exists Boolean showing whether the ID exists in registry
     * @return message Human-readable statement about the record
     */
    function verifyProduct(string calldata _productId)
        external
        view
        returns (bool exists, string memory message)
    {
        if (products[_productId].exists) {
            return (true, "A genuine blockchain record exists for this ID.");
        } else {
            return (false, "No blockchain record found for this ID. This product may be counterfeit.");
        }
    }

    /**
     * @notice Records that someone checked this product, for clone detection
     *
     * @dev WHY THIS IS A SEPARATE, NON-VIEW FUNCTION.
     *      verifyProduct must stay `view` so a shopper can check a product for free,
     *      without a wallet and without gas. But a free read leaves no trace, and a
     *      trace is exactly what clone detection needs.
     *
     *      So scanning is split in two: anyone can read for free, and anyone who wants
     *      to contribute a data point can pay to record it. In production the caller
     *      would be a retailer's point-of-sale terminal or a brand's verified scanning
     *      app, not the shopper.
     *
     *      WHAT THIS BUYS US: cloned labels all share one product ID. A genuine item is
     *      scanned a handful of times along one route; 4,000 scans of an item already
     *      marked Sold is a strong signal that the label has been copied. This does not
     *      prevent cloning - nothing on-chain can - but it makes cloning *visible*.
     *
     *      Deliberately unrestricted by role: clone detection is worth less if only
     *      insiders can contribute observations.
     *
     * @param _productId Product code being checked
     */
    function recordScan(string calldata _productId) external productExists(_productId) {
        scanCount[_productId] += 1;
        emit ProductScanned(_productId, _productId, msg.sender, scanCount[_productId], block.timestamp);
    }

    /**
     * @notice Returns how many times a scan has been recorded against this ID
     * @param _productId Product code to query
     * @return Number of recorded scans
     */
    function getScanCount(string calldata _productId) external view returns (uint256) {
        return scanCount[_productId];
    }
}
