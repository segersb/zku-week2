//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.0;

import { PoseidonT3 } from "./Poseidon.sol"; //an existing library to perform Poseidon hash on solidity
import "./verifier.sol"; //inherits with the MerkleTreeInclusionProof verifier contract
import "hardhat/console.sol";

contract MerkleTree is Verifier {
    uint256[] public hashes; // the Merkle tree in flattened array form
    uint256 public index = 0; // the current index of the first unfilled leaf
    uint256 public root; // the current Merkle root

    uint public constant DEPTH = 3;
    uint public constant LEAF_COUNT = 2 ** DEPTH;

    constructor() {
        // [assignment] initialize a Merkle tree of 8 with blank leaves

        // initialize the leaf hashes
        for (uint i = 0; i < LEAF_COUNT; i++) {
            hashes.push(0);
        }

        // calculate the tree hashes
        for (uint i = 0; i < LEAF_COUNT - 1; i++) {
            hashes.push(PoseidonT3.poseidon([hashes[2 * i], hashes[2 * i + 1]]));
        }

        root = hashes[hashes.length - 1];
    }

    function insertLeaf(uint256 hashedLeaf) public returns (uint256) {
        // [assignment] insert a hashed leaf into the Merkle tree

        // verify tree is not full and insert new hash
        assert(index < LEAF_COUNT);
        hashes[index] = hashedLeaf;

        // update the tree for each depth
        uint updatedIndex = index;
        uint currentLevelStartIndex = 0;
        uint currentLevelCount = LEAF_COUNT;
        for (uint level = 1; level <= DEPTH; level++) {
            uint leftIndex = updatedIndex % 2 == 0 ? updatedIndex : updatedIndex - 1;
            uint rightIndex = updatedIndex % 2 == 0 ? updatedIndex + 1 : updatedIndex;

            uint currentLevelIndex = (updatedIndex - currentLevelStartIndex) / 2;
            uint nextLevelIndex = currentLevelStartIndex + currentLevelCount + (currentLevelIndex / 2);
            hashes[nextLevelIndex] = PoseidonT3.poseidon([hashes[leftIndex], hashes[rightIndex]]);

            updatedIndex = nextLevelIndex;
            currentLevelStartIndex += currentLevelCount;
            currentLevelCount /= 2;
        }

        root = hashes[14];
        index++;

        return root;
    }

    function verify(
            uint[2] memory a,
            uint[2][2] memory b,
            uint[2] memory c,
            uint[1] memory input
        ) public view returns (bool) {

        // [assignment] verify an inclusion proof and check that the proof root matches current root
        return input[0] == root && super.verifyProof(a, b, c, input);
    }
}
