require('dotenv').config();
const fs = require('fs');
const PullServiceClient = require('./pullServiceClient');
const { Web3 } = require('web3');

const OracleProofABI = require('../../resources/oracleProof.json'); // Interface for the Oracle Proof data
const contractAbi = require('../../resources/abi.json'); // Path of your smart contract ABI

// Constants
const MILLISECOND_CONVERSION_FACTOR = 1000;
const TESTNET = 'testnet';
const MAINNET = 'main';
const DEBUG = process.env.DEBUG || false;

// Load network related configuration such as rpc url, contract address, etc.
const { web3, config } = loadConfig(process.env.NETWORK || 'testnet');
const SAMPLE_SIZE = config.block_sample_size || 100; // number of block to sample for average block time

const oraclesData = new Map(); // map of oracle spec and data
let oracleIndexesArr = []; // sorted array of oracle indexs

main();
async function main() {
  try {
    console.log('config', config);
    const client = new PullServiceClient(config.supra_rpc_url);

    while (true) {
      const { currentTime, averageBlockTime } = await getCurrentAndAverageBlockTime(web3);

      const pairIndexes = filterPriceIndexesToUpdate(currentTime);

      const request = {
        pair_indexes: pairIndexes,
        chain_type: config.chain_type,
      };

      console.log('Requesting proof for price index : ', request.pair_indexes);
      client.getProof(request, (err, response) => {
        if (err) {
          console.error('Error:', err.details);
          return;
        }

        // Becayse of the slow block time the proof is deemed to be in the future during verification
        verifyProofandPublish(response.evm, currentTime, averageBlockTime);

        // update the last updated time for the oracles
        pairIndexes.forEach((index) => {
          oraclesData.get(index).lastUpdated = currentTime;
        });
      });
    }
  } catch (e) {
    console.error('Error:', e);
    process.exit(1);
  }
}

async function verifyProofandPublish(response, currentTime, averageBlockTime) {
  console.log('Calling pull contract to verify the proofs...');
  const hex = web3.utils.bytesToHex(response.proof_bytes);

  const contract = new web3.eth.Contract(contractAbi, config.pull_oracle_address);
  contract.handleRevert = true;

  const DELTA_ALLOWANCE = Number(await contract.methods.TIME_DELTA_ALLOWANCE().call());

  // Utility code to deserialise the oracle proof bytes (Optional)
  let proof_data = web3.eth.abi.decodeParameters(OracleProofABI, hex); // Deserialising the Oracle Proof data

  let pairId = []; // list of all the pair ids requested
  let pairPrice = []; // list of prices for the corresponding pair ids
  let pairDecimal = []; // list of pair decimals for the corresponding pair ids
  let pairTimestamp = []; // list of pair last updated timestamp for the corresponding pair ids
  let pairRound = [];

  for (let i = 0; i < proof_data[0].data.length; ++i) {
    for (let j = 0; j < proof_data[0].data[i].committee_data.committee_feed.length; j++) {
      pairId.push(proof_data[0].data[i].committee_data.committee_feed[j].pair.toString(10)); // pushing the pair ids requested in the output vector

      pairPrice.push(proof_data[0].data[i].committee_data.committee_feed[j].price.toString(10)); // pushing the pair price for the corresponding ids

      pairDecimal.push(
        proof_data[0].data[i].committee_data.committee_feed[j].decimals.toString(10)
      ); // pushing the pair decimals for the corresponding ids requested

      pairTimestamp.push(
        proof_data[0].data[i].committee_data.committee_feed[j].timestamp.toString(10)
      ); // pushing the pair timestamp for the corresponding ids requested

      pairRound.push(proof_data[0].data[i].committee_data.committee_feed[j].round.toString(10)); // pushing the pair round for the corresponding ids requested
    }
  }

  if (pairId.length === 0) {
    console.log('No proof data found');
    return;
  }

  console.log('Pair index : ', pairId);
  console.log('Pair Price : ', pairPrice);
  console.log('Pair Decimal : ', pairDecimal);
  console.log('Pair Timestamp : ', pairTimestamp);
  console.log('Pair Round : ', pairRound);

  // calculate max future time for the proof to be valid
  let DELAY = averageBlockTime * Number(config.delay_multiplier);
  const maxFutureTime = currentTime + DELTA_ALLOWANCE;
  if (maxFutureTime < pairTimestamp[0].round) {
    DELAY = Math.max(DELAY, pairTimestamp[0].round - maxFutureTime);
  }

  console.log(`Waiting for proof to be valid in ${DELAY}ms ...`);
  setTimeout(async () => {
    sendProofToPullContract(contract, hex);
  }, DELAY);
}

async function sendProofToPullContract(contract, hex) {
  console.log('Verifying the oracle proof...');

  const gasEstimate = await contract.methods
    .verifyOracleProof(hex)
    .estimateGas({ from: web3.eth.wallet.get(0).address });
  console.log('gas estimate:', gasEstimate);

  // const txData = contract.methods.verifyOracleProof(hex).encodeABI();
  const txData = await contract.methods.verifyOracleProof(hex).send({
    from: web3.eth.wallet.get(0).address,
    gas: gasEstimate,
    gasPrice: await web3.eth.getGasPrice(),
  });
  console.log('Transaction receipt:', txData);

  // Legacy tx sending
  // // Create the transaction object
  // const transactionObject = {
  //   from: web3.eth.wallet.get(0).address,
  //   to: contract.address,
  //   data: txData,
  //   gas: gasEstimate,
  //   gasPrice: await web3.eth.getGasPrice(),
  // };

  // // Sign the transaction with the private key
  // const signedTransaction = await web3.eth.accounts.signTransaction(
  //   transactionObject,
  //   web3.eth.wallet.get(0).privateKey
  // );

  // // Send the signed transaction
  // const receipt = await web3.eth.sendSignedTransaction(signedTransaction.rawTransaction, null, {
  //   checkRevertBeforeSending: false,
  // });

  // console.log('Transaction receipt:', receipt);
}

// get the current block time and average block time within a sample size
async function getCurrentAndAverageBlockTime(web3) {
  const CURRENT_BLOCK = await web3.eth.getBlock();

  let blockTimes = [];

  // collect all block time data asynchronously (latest -> earliest)
  for (let i = 1; i < SAMPLE_SIZE; i++) {
    blockTimes.push(web3.eth.getBlock(Number(CURRENT_BLOCK.number) - i));
  }

  blockTimes = await Promise.all(blockTimes);

  let totalTime = 0;
  for (let i = 0; i < blockTimes.length - 1; i++) {
    totalTime += Number(blockTimes[i].timestamp) - Number(blockTimes[i + 1].timestamp);
  }
  let averageBlockTime = (totalTime / SAMPLE_SIZE) * MILLISECOND_CONVERSION_FACTOR;

  return {
    currentTime: Number(CURRENT_BLOCK.timestamp) * MILLISECOND_CONVERSION_FACTOR,
    averageBlockTime,
  };
}

// loads network configuration from config.json and initialize web3 with the provider and account
function loadConfig(network) {
  console.log(`Loading configuration for ${network}...`);
  const config = JSON.parse(
    fs.readFileSync('./config.json', 'utf8', (err, data) => {
      if (err) {
        console.error('Error reading JSON file:', err);
        return;
      }
    })
  )[network];
  console.log('Successfully read configuration');

  const web3 = new Web3(new Web3.providers.HttpProvider(config.chain_rpc_url)); // Rpc url for desired chain

  if (!process.env.PRIVATE_KEY) {
    throw new Erro('PRIVATE_KEY not set in .env');
  }

  const account = web3.eth.accounts.privateKeyToAccount(process.env.PRIVATE_KEY);
  web3.eth.wallet.add(account);
  console.log('Using wallet address', web3.eth.wallet.get(0).address);

  return { web3, config };
}

// initialize a map of oracle data and price indexes
// filters the price indexes to update based on the last updated time and resolution
// all time is calculated in ms
function filterPriceIndexesToUpdate(currentTime) {
  if (oracleIndexesArr.length == 0) {
    config.oracles.map((spec) => {
      const o = {
        pair: spec.pair,
        priceIndex: spec.price_index,
        resolution: spec.resolution,
        lastUpdated: 0,
      };

      oraclesData.set(o.priceIndex, o);
      oracleIndexesArr.push(o.priceIndex);
    });

    oracleIndexesArr.sort((a, b) => oraclesData.get(a).resolution - oraclesData.get(b).resolution);
  }

  console.log(oracleIndexesArr);
  const indexesToUpdate = [];
  for (let i = 0; i < oracleIndexesArr.length; i++) {
    const oracle = oraclesData.get(oracleIndexesArr[i]);

    console.log(`checking index ${oracle.priceIndex}`);
    if (currentTime - oracle.lastUpdated < oracle.resolution) {
      // oracles is sorted by resolution, so we can break early as the lower resolutions will need to be updated
      // before the higher resolutions
      break;
    }
    indexesToUpdate.push(Number(oracle.priceIndex));
  }

  return indexesToUpdate;
}
