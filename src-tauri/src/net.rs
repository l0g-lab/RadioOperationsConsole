//! Pieces shared by everything that talks to the internet: who we say we are,
//! how a failed request is classified, and how a client is built.

use std::time::Duration;

pub const USER_AGENT: &str = "RadioOperationsConsole/0.1 (amateur-radio net logger)";

/// Why a download-style request failed. `Offline` means "no connection", which
/// callers turn into the friendly offline message rather than an error.
pub enum FetchError {
    Offline,
    Other(String),
}

/// Whether a failed request just means there's no usable connection.
pub fn is_offline_error(e: &reqwest::Error) -> bool {
    e.is_connect() || e.is_timeout()
}

/// Classifies a failed request: a timeout gets the caller's own wording (what
/// to do differs between a resumable download and a plain retry), a refused
/// connection is `Offline`, anything else is reported as-is.
pub fn map_send_error(e: reqwest::Error, timeout_message: &str) -> FetchError {
    if e.is_timeout() {
        FetchError::Other(timeout_message.to_string())
    } else if e.is_connect() {
        FetchError::Offline
    } else {
        FetchError::Other(format!("Download failed: {e}"))
    }
}

/// A client that fails fast when offline. `request_timeout` is omitted for
/// large downloads, which are guarded by a stall timeout instead.
pub fn client(connect: Duration, request_timeout: Option<Duration>) -> reqwest::Result<reqwest::Client> {
    let mut b = reqwest::Client::builder().connect_timeout(connect);
    if let Some(t) = request_timeout {
        b = b.timeout(t);
    }
    b.build()
}
