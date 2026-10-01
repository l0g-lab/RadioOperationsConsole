//! Pieces shared by everything that talks to the internet: who we say we are,
//! how a failed request is classified, and how a client is built.

use std::time::Duration;

/// The operator's "Work offline" switch (UX-020–UX-026). Every network entry
/// point checks it first and reports itself offline, exactly as with no
/// connection. Tests run in parallel threads, so there it is per-thread:
/// one test going offline can't break another's download.
#[cfg(not(test))]
static WORK_OFFLINE: std::sync::atomic::AtomicBool = std::sync::atomic::AtomicBool::new(false);

#[cfg(not(test))]
pub fn set_work_offline(on: bool) {
    WORK_OFFLINE.store(on, std::sync::atomic::Ordering::SeqCst);
}

#[cfg(not(test))]
pub fn working_offline() -> bool {
    WORK_OFFLINE.load(std::sync::atomic::Ordering::SeqCst)
}

#[cfg(test)]
thread_local! {
    static WORK_OFFLINE: std::cell::Cell<bool> = const { std::cell::Cell::new(false) };
}

#[cfg(test)]
pub fn set_work_offline(on: bool) {
    WORK_OFFLINE.with(|w| w.set(on));
}

#[cfg(test)]
pub fn working_offline() -> bool {
    WORK_OFFLINE.with(|w| w.get())
}

/// Shown where a feature reports its error text directly (weather, APRS-IS).
pub const WORKING_OFFLINE_MESSAGE: &str =
    "Working offline — click \"Working offline\" in the header to go back online.";

/// This build's version, from Cargo.toml, so every service we talk to sees
/// the real release without anyone remembering to update it.
pub const APP_VERSION: &str = env!("CARGO_PKG_VERSION");

pub const USER_AGENT: &str =
    concat!("RadioOperationsConsole/", env!("CARGO_PKG_VERSION"), " (amateur-radio net logger)");

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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn identifies_as_this_release() {
        let version = env!("CARGO_PKG_VERSION");
        assert_eq!(USER_AGENT, format!("RadioOperationsConsole/{version} (amateur-radio net logger)"));
        assert_eq!(APP_VERSION, version);
    }

    #[test]
    fn working_offline_is_off_until_turned_on() {
        assert!(!working_offline());
        set_work_offline(true);
        assert!(working_offline());
        set_work_offline(false);
        assert!(!working_offline());
    }
}
