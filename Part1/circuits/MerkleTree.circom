pragma circom 2.0.0;

include "../node_modules/circomlib/circuits/poseidon.circom";
include "../node_modules/circomlib/circuits/switcher.circom";

template CheckRoot(n) { // compute the root of a MerkleTree of n Levels 
    signal input leaves[2**n];
    signal output root;

    //[assignment] insert your code here to calculate the Merkle root from 2^n leaves
    var hashCount = (2 ** n) - 1;
    component hashes[hashCount];

    // leaf hashes
    for (var i = 0; i < 2**n / 2; i++) {
        hashes[i] = Poseidon(2);
        hashes[i].inputs[0] <== leaves[2*i];
        hashes[i].inputs[1] <== leaves[2*i + 1];
    }

    // remaining hashes
    var nodeStartIndex = 2**n / 2;
    for (var i = 0; i < (hashCount - 1) / 2; i++) {
        hashes[nodeStartIndex + i] = Poseidon(2);
        hashes[nodeStartIndex + i].inputs[0] <== hashes[2*i].out;
        hashes[nodeStartIndex + i].inputs[1] <== hashes[2*i + 1].out;
    }

    root <== hashes[hashCount - 1].out;
}

template MerkleTreeInclusionProof(n) {
    signal input leaf;
    signal input path_elements[n];
    signal input path_index[n]; // path index are 0's and 1's indicating whether the current element is on the left or right
    signal output root; // note that this is an OUTPUT signal

    //[assignment] insert your code here to compute the root from a leaf and elements along the path
    component hashes[n];
    component hashInputSwitchers[n];

    // leaf hash
    hashInputSwitchers[0] = Switcher();
    hashInputSwitchers[0].L <== leaf;
    hashInputSwitchers[0].R <== path_elements[0];
    hashInputSwitchers[0].sel <== path_index[0];

    hashes[0] = Poseidon(2);
    hashes[0].inputs[0] <== hashInputSwitchers[0].outL;
    hashes[0].inputs[1] <== hashInputSwitchers[0].outR;

    // remaining hashes
    for (var i = 1; i < n; i++) {
        hashInputSwitchers[i] = Switcher();
        hashInputSwitchers[i].L <== hashes[i - 1].out;
        hashInputSwitchers[i].R <== path_elements[i];
        hashInputSwitchers[i].sel <== path_index[i];

        hashes[i] = Poseidon(2);
        hashes[i].inputs[0] <== hashInputSwitchers[i].outL;
        hashes[i].inputs[1] <== hashInputSwitchers[i].outR;
    }

    root <== hashes[n - 1].out;
}