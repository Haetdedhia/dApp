// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title Decentralized Supply Chain Tracker
 * @notice Keeps record of products moving from manufacturers through distributors and retailers to final consumers.
 * @dev Inherits from OpenZeppelin's Ownable for administrative controls like role authorization.
 */
contract SupplyChain is Ownable {

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
    struct Product {
        string productId;           // Unique scan identifier (QR code value)
        string name;                // Human-readable product name
        string batchNumber;         // Batch/lot identifier for traceability grouping
        address manufacturer;       // Original creator address (never changes)
        address currentOwner;       // Current custody holder (changes with each transfer)
        Status status;              // Current lifecycle stage in supply chain
        uint256 manufacturedDate;   // Unix timestamp of product creation
        bool exists;                // Marker to verify product registration (prevents false lookups)
    }

    /**
     * @notice Audit log entry recording each state change event.
     * @dev Enables complete provenance tracking from manufacture through final sale.
     */
    struct HistoryEntry {
        address actor;              // Address of entity performing the action
        Status status;              // Status achieved after this transaction
        uint256 timestamp;          // Unix timestamp when change occurred
    }

    // ===== STATE MAPPINGS: Core data persistence structures =====

    /// @notice Primary registry mapping productId strings to Product records
    mapping(string => Product) public products;

    /// @notice Audit trail mapping productId to chronological HistoryEntry array
    mapping(string => HistoryEntry[]) public productHistory;

    /// @notice Role assignment mapping addresses to their authorization level
    mapping(address => Role) public roles;

    // ===== EVENTS: Audit logs and frontend listener triggers =====

    /// @notice Emitted when a Manufacturer logs a new product batch onto the ledger
    event ProductCreated(
        string indexed productId,
        string name,
        address indexed manufacturer,
        uint256 timestamp
    );

    /// @notice Emitted on any state transition or change of custody ownership
    event ProductTransferred(
        string indexed productId,
        address indexed from,
        address indexed to,
        Status newStatus,
        uint256 timestamp
    );

    /// @notice Emitted when the contract owner modifies role authorizations
    event RoleAssigned(address indexed account, Role role);

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
        require(roles[msg.sender] == _role, "Unauthorized: Invalid role");
        _;
    }

    /**
     * @dev Ensures that a product with the given ID has already been registered on-chain
     * @param _productId Unique identifier string for the target item
     */
    modifier productExists(string memory _productId) {
        require(products[_productId].exists, "Product does not exist");
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
        string memory _productId,
        string memory _name,
        string memory _batchNumber
    ) external onlyRole(Role.Manufacturer) {
        // Pre-validation checks for state and parameter safety
        require(!products[_productId].exists, "Product already exists");
        require(bytes(_productId).length > 0, "Product ID cannot be empty");
        require(bytes(_name).length > 0, "Product name cannot be empty");

        Product memory newProduct = Product({
            productId: _productId,
            name: _name,
            batchNumber: _batchNumber,
            manufacturer: msg.sender,
            currentOwner: msg.sender,
            status: Status.Manufactured,
            manufacturedDate: block.timestamp,
            exists: true
        });

        // Store primary product details in persistent mapping
        products[_productId] = newProduct;

        // Append initial creation event to tracking history (Manufactured status)
        productHistory[_productId].push(
            HistoryEntry({
                actor: msg.sender,
                status: Status.Manufactured,
                timestamp: block.timestamp
            })
        );

        emit ProductCreated(_productId, _name, msg.sender, block.timestamp);
    }

    /**
     * @notice Performs first custody transfer from Manufacturer to authorized Distributor
     * @dev Restricts caller to the original constructor-authorized Manufacturer role.
     * @param _productId Registry product key
     * @param _distributor Target address of the recipient, which must have Role.Distributor
     */
    function transferToDistributor(string memory _productId, address _distributor)
        external
        onlyRole(Role.Manufacturer)
        productExists(_productId)
    {
        Product storage product = products[_productId];

        // Safety assertions: Only original manufacturer can transfer, and state must be fresh
        require(product.manufacturer == msg.sender, "Not the manufacturer");
        require(
            product.status == Status.Manufactured,
            "Product already transferred"
        );
        require(
            roles[_distributor] == Role.Distributor,
            "Recipient is not a distributor"
        );

        // Update ownership and status state
        product.currentOwner = _distributor;
        product.status = Status.DistributorReceived;

        // Record audit entry for custody change
        productHistory[_productId].push(
            HistoryEntry({
                actor: _distributor,
                status: Status.DistributorReceived,
                timestamp: block.timestamp
            })
        );

        emit ProductTransferred(
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
    function transferToRetailer(string memory _productId, address _retailer)
        external
        onlyRole(Role.Distributor)
        productExists(_productId)
    {
        Product storage product = products[_productId];

        // Safety assertions: caller must be current active owner, status must show Distributor receipt
        require(
            product.currentOwner == msg.sender,
            "You are not the current owner"
        );
        require(
            product.status == Status.DistributorReceived,
            "Invalid product status"
        );
        require(
            roles[_retailer] == Role.Retailer,
            "Recipient is not a retailer"
        );

        // Update ownership and status state
        product.currentOwner = _retailer;
        product.status = Status.RetailerReceived;

        // Record history log
        productHistory[_productId].push(
            HistoryEntry({
                actor: _retailer,
                status: Status.RetailerReceived,
                timestamp: block.timestamp
            })
        );

        emit ProductTransferred(
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
    function markAsSold(string memory _productId)
        external
        onlyRole(Role.Retailer)
        productExists(_productId)
    {
        Product storage product = products[_productId];

        // Safety assertions: caller must have custody, product must be at retail status
        require(
            product.currentOwner == msg.sender,
            "You are not the current owner"
        );
        require(
            product.status == Status.RetailerReceived,
            "Product not at retailer"
        );

        // Mark as sold and finalize status (removes active custodian logic)
        product.status = Status.Sold;

        // Record final history entry
        productHistory[_productId].push(
            HistoryEntry({
                actor: msg.sender,
                status: Status.Sold,
                timestamp: block.timestamp
            })
        );

        // Emit transfer to address(0) signifying dispatch off-network to consumer
        emit ProductTransferred(
            _productId,
            msg.sender,
            address(0),
            Status.Sold,
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
    function getProduct(string memory _productId)
        external
        view
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
        require(products[_productId].exists, "Product does not exist");
        Product memory product = products[_productId];
        return (
            product.productId,
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
    function getProductHistory(string memory _productId)
        external
        view
        productExists(_productId)
        returns (HistoryEntry[] memory)
    {
        return productHistory[_productId];
    }

    /**
     * @notice Fast consumer-facing validation endpoint to check block presence
     * @param _productId Product code scanned by buyer
     * @return exists Boolean showing whether the ID exists in registry
     * @return message Context statement denoting genuine vs counterfeit matches
     */
    function verifyProduct(string memory _productId)
        external
        view
        returns (bool exists, string memory message)
    {
        if (products[_productId].exists) {
            return (true, "Product verified on blockchain");
        } else {
            return (false, "No verified blockchain record found. Product may be counterfeit.");
        }
    }
}
