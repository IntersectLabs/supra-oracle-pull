pub mod types;
pub mod ethereum_connector;
pub mod pull_contract;

use reqwest::Client as HttpClient;
use std::error::Error;
use types::PullRequest;
use crate::types::PullResponseEvm;

pub struct Client {
    client: HttpClient,
    base_url: String,
}

impl Client {
    pub async fn new(base_url: String) -> Result<Self, Box<dyn Error>> {
        let client = HttpClient::new();
        Ok(Self { client, base_url })
    }

    pub async fn get_proof(
        &self,
        request: &PullRequest,
    ) -> Result<PullResponseEvm, Box<dyn Error>> {
        let url = format!("{}/get_proof", self.base_url);

        let response = self
            .client
            .post(&url)
            .json(request)
            .send()
            .await?
            .error_for_status()?
            .json::<PullResponseEvm>()
            .await?;
        Ok(response)
    }
}