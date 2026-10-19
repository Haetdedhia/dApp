// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title Identifier Cost Micro-benchmark
 * @notice NOT part of the dApp. Measurement scaffolding for docs/GAS-ANALYSIS.md.
 *
 * @dev SupplyChain keys products by `string`, which is convenient (IDs like
 *      "MED-2026-001" are human-readable and map straight onto printed labels) but
 *      expensive. This isolates that one variable so the cost can be quantified
 *      without refactoring the production contract.
 *
 *      Both contracts below store an identical record. The only difference is whether
 *      the identifier is a dynamic `string` or a fixed `bytes32`. Everything else -
 *      struct layout, mapping shape, event - is held constant, so the delta measured
 *      in test/GasComparison.test.js is attributable to the identifier type alone.
 *
 *      Why the difference exists:
 *        - `string` is dynamically sized, so a mapping key must be keccak-hashed over
 *          variable-length data, and the value itself needs a length slot plus one slot
 *          per 32 bytes of content.
 *        - `bytes32` is one word. It hashes in a single step and stores in one slot.
 */

/// @notice Stores a product keyed by a dynamic string, as SupplyChain does today
contract StringIdStore {
    struct Record {
        string id;
        string name;
        address owner;
        uint8 status;
        bool exists;
    }

    mapping(string => Record) public records;

    function store(string calldata _id, string calldata _name) external {
        records[_id] = Record({
            id: _id,
            name: _name,
            owner: msg.sender,
            status: 0,
            exists: true
        });
    }

    function read(string calldata _id) external view returns (address, uint8) {
        Record storage r = records[_id];
        return (r.owner, r.status);
    }
}

/// @notice Identical record, keyed and identified by a fixed-width bytes32
contract Bytes32IdStore {
    struct Record {
        bytes32 id;
        string name;
        address owner;
        uint8 status;
        bool exists;
    }

    mapping(bytes32 => Record) public records;

    function store(bytes32 _id, string calldata _name) external {
        records[_id] = Record({
            id: _id,
            name: _name,
            owner: msg.sender,
            status: 0,
            exists: true
        });
    }

    function read(bytes32 _id) external view returns (address, uint8) {
        Record storage r = records[_id];
        return (r.owner, r.status);
    }
}
