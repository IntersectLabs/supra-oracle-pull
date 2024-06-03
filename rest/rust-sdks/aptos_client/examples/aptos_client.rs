use aptos_pull_client::aptos_connector::{invoke_aptos_chain, AptosConfig, AptosConnector};
use aptos_pull_client::Client;
use aptos_pull_client::types::{PullRequest, PullResponseAptos};

#[tokio::main]
async fn main() {
    let address = "<REST API SERVER ADDRESS>".to_string(); // Set the rest server address
    let client = Client::new(address).await.unwrap();

    // Create a PullRequest
    let request = PullRequest {
        pair_indexes: vec![0, 21], // Set the pair indexes as an array
        chain_type: "aptos".to_string(),   // Set the chain type (evm, sui, aptos, radix)
    };

    // Call the get_proof function and handle the result
    match client.get_proof(&request).await {
        Ok(response) => {
            call_contract(response).await;
        }
        Err(status) => {
            eprint!("{:?}", status);
        }
    }
}

async fn call_contract(input: PullResponseAptos) {
        let aptos_connector = AptosConnector::new(AptosConfig::new(
            "<--secret-key-->",
            "<--rpc-url-->",
            "<-contract-address-->",
            50000,
        ))
        .await
        .unwrap();
        invoke_aptos_chain(input, aptos_connector).await;

}
