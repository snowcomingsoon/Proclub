use proclub_rs::serve::{handle_request, Endpoint};
use vercel_runtime::{run, service_fn, Error};

#[tokio::main]
async fn main() -> Result<(), Error> {
    run(service_fn(|req| handle_request(Endpoint::Summary, req))).await
}
