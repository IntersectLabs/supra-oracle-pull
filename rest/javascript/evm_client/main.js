const PullServiceClient = require("./pullServiceClient");
const {Web3} = require('web3');

async function main() {
    const address = 'http://127.0.0.1:9000'; // Set the rest server address
    const pairIndexes = [0, 21]; // Set the pair indexes as an array
    const chainType = 'evm'; // Set the chain type (evm, sui, aptos, radix)

    const client = new PullServiceClient(address);

    const request = {
        pair_indexes: pairIndexes,
        chain_type: chainType
    };
    console.log("Requesting proof for price index : ", request.pair_indexes);
    client.getProof(request)
        .then(response => {
            console.log('Proof received:', response);
            callContract(response)
        })
        .catch(error => {
            console.error('Error:', error.response.data);
        });
}

async function callContract(response) {

    const web3 = new Web3(new Web3.providers.HttpProvider('<RPC URL>')); // Rpc url for desired chain

    const contractAbi = require("../../resources/abi.json"); // Path of your smart contract ABI

    const contractAddress = '<CONTRACT ADDRESS>'; // Address of your smart contract

    const contract = new web3.eth.Contract(contractAbi, contractAddress);

    const hex = web3.utils.bytesToHex(response.proof_bytes);

    /////////////////////////////////////////////////// Utility code to deserialise the oracle proof bytes (Optional) ///////////////////////////////////////////////////////////////////

    const OracleProofABI = require("../../resources/oracleProof.json"); // Interface for the Oracle Proof data

    let proof_data = web3.eth.abi.decodeParameters(OracleProofABI,hex); // Deserialising the Oracle Proof data 

    let pairId = []  // list of all the pair ids requested
    let pairPrice = []; // list of prices for the corresponding pair ids
    let pairDecimal = []; // list of pair decimals for the corresponding pair ids
    let pairTimestamp = []; // list of pair last updated timestamp for the corresponding pair ids

    for (let i = 0; i < proof_data[0].data.length; ++i) {

        pairId.push(proof_data[0].data[i].CommitteeFeed.pair.toString(10)); // pushing the pair ids requested in the output vector

        pairPrice.push(proof_data[0].data[i].CommitteeFeed.price.toString(10)); // pushing the pair price for the corresponding ids

        pairDecimal.push(proof_data[0].data[i].CommitteeFeed.decimal.toString(10)); // pushing the pair decimals for the corresponding ids requested

        pairTimestamp.push(proof_data[0].data[i].CommitteeFeed.timestamp.toString(10)); // pushing the pair timestamp for the corresponding ids requested

    }

    console.log("Pair index : ", pairId);
    console.log("Pair Price : ", pairPrice);
    console.log("Pair Decimal : ", pairDecimal);
    console.log("Pair Timestamp : ", pairTimestamp);


    /////////////////////////////////////////////////// End of the utility code to deserialise the oracle proof bytes (Optional) ////////////////////////////////////////////////////////////////
    
    const txData = contract.methods.GetPairPrice(hex, 0).encodeABI(); // function from you contract eg:GetPairPrice from example-contract.sol
    const gasEstimate = await contract.methods.GetPairPrice(hex, 0).estimateGas({from: "<WALLET ADDRESS>"});

    // Create the transaction object
    const transactionObject = {
        from: "<WALLET ADDRESS>",
        to: contractAddress,
        data: txData,
        gas: gasEstimate,
        gasPrice: await web3.eth.getGasPrice() // Set your desired gas price here, e.g: web3.utils.toWei('1000', 'gwei')
    };

    // Sign the transaction with the private key
    const signedTransaction = await web3.eth.accounts.signTransaction(transactionObject, "<PRIVATE KEY>");

    // Send the signed transaction
    const receipt = await web3.eth.sendSignedTransaction(signedTransaction.rawTransaction);
    console.log('Transaction receipt:', receipt);
}

main();