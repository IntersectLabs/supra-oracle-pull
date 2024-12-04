// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;

interface ISupraOraclePull {
    //Below does not have the timestamp or the round.
    struct PriceData {
        uint256[] pairs;
        // prices[i] is the price of pairs[i]
        uint256[] prices;
        // decimals[i] is the decimals of pairs[i]
        uint256[] decimals;
    }

    // If timestamp or round is required please use the below
    struct PriceInfo {
        uint256[] pairs;
        // prices[i] is the price of pairs[i]
        uint256[] prices;
        // timestamp[i] is the timestamp of pairs[i]
        uint256[] timestamp;
        // decimals[i] is the decimals of pairs[i]
        uint256[] decimal;
        // round[i] is the round of pairs[i]
        uint256[] round;
    }

    //Below function requests price data with round
    function verifyOracleProof(bytes calldata _bytesproof) external returns (PriceData memory);

    //Below function requests price data with round and timestamp
    function verifyOracleProofV2(bytes calldata _bytesProof) external returns (PriceInfo memory);
}
