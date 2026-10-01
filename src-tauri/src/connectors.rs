use quick_xml::events::Event;
use quick_xml::reader::Reader;
use serde::Serialize;
use serde_json::Value;
use std::collections::HashMap;
use std::error::Error;
use crate::net::{client, is_offline_error, USER_AGENT};
use std::time::Duration;

const QRZ_AGENT: &str = concat!("RadioOpsConsole", env!("CARGO_PKG_VERSION"));
const QRZ_BASE_URL: &str = "https://xmldata.qrz.com/xml/current/";
const NOMINATIM_URL: &str = "https://nominatim.openstreetmap.org/search";
// Online connectors here are conveniences, not dependencies (VISION-002/005):
// fail fast when offline rather than hanging the caller (QRZ-031, CIMAP-022).
const CONNECT_TIMEOUT: Duration = Duration::from_secs(5);
const REQUEST_TIMEOUT: Duration = Duration::from_secs(8);

fn http_client() -> reqwest::Result<reqwest::Client> {
    client(CONNECT_TIMEOUT, Some(REQUEST_TIMEOUT))
}

/// Fetches active NWS alerts, optionally scoped to a resolved coordinate
/// (NWSA-003) via the API's point-based query. `point` is unscoped when
/// `None`, matching the pre-feature "all active alerts" behavior
/// (NWSA-005).
pub async fn fetch_nws_alerts(
    nws_api_key: Option<&str>,
    point: Option<(f64, f64)>,
) -> Result<Value, Box<dyn Error>> {
    let client = reqwest::Client::new();
    let mut req = client
        .get("https://api.weather.gov/alerts/active")
        .header("User-Agent", USER_AGENT)
        .header("Accept", "application/geo+json, application/json");
    if let Some((lat, lon)) = point {
        req = req.query(&[("point", format!("{lat:.4},{lon:.4}"))]);
    }
    if let Some(key) = nws_api_key {
        req = req.header("X-API-Key", key);
    }
    let resp = req.send().await?;
    if !resp.status().is_success() {
        return Err(Box::from(format!("NWS API HTTP error: {}", resp.status())));
    }
    let v: Value = resp.json().await?;
    Ok(v)
}

/// Fetches the current textual forecast for a coordinate via the two-step
/// NWS API dance: `/points/{lat,lon}` resolves the forecast URL for that
/// point's zone, then that URL returns the actual forecast periods
/// (today/tonight/upcoming days). Point-based, unlike alerts — a forecast
/// is inherently tied to a specific location, so this requires the area of
/// interest to be set (checked by the caller).
pub async fn fetch_nws_forecast(lat: f64, lon: f64) -> Result<Value, Box<dyn Error>> {
    let client = http_client()?;
    let points_url = format!("https://api.weather.gov/points/{lat:.4},{lon:.4}");
    let points_resp = client
        .get(&points_url)
        .header("User-Agent", USER_AGENT)
        .header("Accept", "application/geo+json, application/json")
        .send()
        .await?;
    if !points_resp.status().is_success() {
        return Err(Box::from(format!(
            "NWS points API HTTP error: {}",
            points_resp.status()
        )));
    }
    let points_body: Value = points_resp.json().await?;
    let forecast_url = points_body
        .get("properties")
        .and_then(|p| p.get("forecast"))
        .and_then(Value::as_str)
        .ok_or_else(|| -> Box<dyn Error> { Box::from("NWS points response missing forecast URL") })?
        .to_string();

    let forecast_resp = client
        .get(&forecast_url)
        .header("User-Agent", USER_AGENT)
        .header("Accept", "application/geo+json, application/json")
        .send()
        .await?;
    if !forecast_resp.status().is_success() {
        return Err(Box::from(format!(
            "NWS forecast API HTTP error: {}",
            forecast_resp.status()
        )));
    }
    let forecast_body: Value = forecast_resp.json().await?;
    Ok(forecast_body)
}

/// Flattens a shallow XML document into tag-name -> text. Sufficient for
/// QRZ's XML Data API responses, which have no repeated sibling tag names
/// within the sections this application reads.
fn parse_flat_xml(xml: &str) -> HashMap<String, String> {
    let mut reader = Reader::from_str(xml);
    let mut map = HashMap::new();
    let mut current: Option<String> = None;
    loop {
        match reader.read_event() {
            Ok(Event::Start(e)) => {
                current = Some(String::from_utf8_lossy(e.name().as_ref()).into_owned());
            }
            Ok(Event::Text(t)) => {
                if let Some(tag) = &current {
                    if let Ok(text) = t.unescape() {
                        let text = text.trim().to_string();
                        if !text.is_empty() {
                            map.insert(tag.clone(), text);
                        }
                    }
                }
            }
            Ok(Event::End(_)) => current = None,
            Ok(Event::Eof) | Err(_) => break,
            _ => {}
        }
    }
    map
}

#[derive(Debug, Clone)]
pub struct QrzCallsignInfo {
    pub call: String,
    pub name: Option<String>,
    pub qth_location: Option<String>,
    pub grid_square: Option<String>,
    pub address: Option<String>,
    /// QRZ's own coordinates for the station, present only when QRZ says
    /// they're an exact point (`geoloc` of "user" or "geocode") — never when
    /// QRZ itself just rounded to a grid/ZIP/state/country, which is no
    /// better than what this application derives on its own.
    pub exact_lat: Option<f64>,
    pub exact_lon: Option<f64>,
    /// QRZ's raw `geoloc` value (how it arrived at lat/lon), kept for
    /// visibility even when the coordinates were rejected as not exact.
    pub geoloc: Option<String>,
}

pub enum QrzLookupOutcome {
    Found(QrzCallsignInfo),
    NotFound,
    SessionExpired,
    /// No network connectivity reached QRZ at all (DNS failure, connection
    /// refused/timed out). Distinct from `Error` so callers can stay silent
    /// per QRZ-030 instead of surfacing a status indicator.
    Offline,
    Error(String),
}

pub enum QrzLoginOutcome {
    Ok(String),
    /// See `QrzLookupOutcome::Offline`.
    Offline,
    Error(String),
}

/// Builds a full mailing address from QRZ's address fields, omitting any
/// that are absent rather than leaving stray punctuation.
fn qrz_full_address(fields: &HashMap<String, String>) -> Option<String> {
    let addr1 = fields.get("addr1").map(String::as_str);
    let addr2 = fields.get("addr2").map(String::as_str);
    let state = fields.get("state").map(String::as_str);
    let zip = fields.get("zip").map(String::as_str);
    let country = fields.get("country").map(String::as_str);

    let mut city_state_zip = String::new();
    if let Some(c) = addr2 {
        city_state_zip.push_str(c);
    }
    if let Some(s) = state {
        if !city_state_zip.is_empty() {
            city_state_zip.push_str(", ");
        }
        city_state_zip.push_str(s);
    }
    if let Some(z) = zip {
        if !city_state_zip.is_empty() {
            city_state_zip.push(' ');
        }
        city_state_zip.push_str(z);
    }

    let mut lines: Vec<&str> = Vec::new();
    if let Some(a1) = addr1 {
        lines.push(a1);
    }
    if !city_state_zip.is_empty() {
        lines.push(&city_state_zip);
    }
    if let Some(c) = country {
        lines.push(c);
    }

    if lines.is_empty() {
        None
    } else {
        Some(lines.join(", "))
    }
}

/// Logs into the QRZ.com XML Data API and returns a session key. Requires a
/// QRZ.com subscription with XML/callbook data access; a plain login without
/// that subscription authenticates but cannot be used for lookups.
pub async fn qrz_login(username: &str, password: &str) -> QrzLoginOutcome {
    if crate::net::working_offline() {
        return QrzLoginOutcome::Offline;
    }
    let client = match http_client() {
        Ok(c) => c,
        Err(e) => return QrzLoginOutcome::Error(e.to_string()),
    };
    let resp = match client
        .get(QRZ_BASE_URL)
        .query(&[
            ("username", username),
            ("password", password),
            ("agent", QRZ_AGENT),
        ])
        .send()
        .await
    {
        Ok(r) => r,
        Err(e) if is_offline_error(&e) => return QrzLoginOutcome::Offline,
        Err(e) => return QrzLoginOutcome::Error(e.to_string()),
    };
    let body = match resp.text().await {
        Ok(b) => b,
        Err(e) if is_offline_error(&e) => return QrzLoginOutcome::Offline,
        Err(e) => return QrzLoginOutcome::Error(e.to_string()),
    };
    let fields = parse_flat_xml(&body);
    if let Some(err) = fields.get("Error") {
        return QrzLoginOutcome::Error(format!("QRZ login failed: {err}"));
    }
    match fields.get("Key") {
        Some(key) => QrzLoginOutcome::Ok(key.clone()),
        None => QrzLoginOutcome::Error("QRZ login response missing session key".to_string()),
    }
}

/// Looks up a call sign using an existing QRZ session key. Callers should
/// treat `SessionExpired` as a signal to re-login and retry once, and
/// `Offline` as a signal to stay silent (QRZ-030).
pub async fn qrz_lookup(session_key: &str, call_sign: &str) -> QrzLookupOutcome {
    if crate::net::working_offline() {
        return QrzLookupOutcome::Offline;
    }
    let client = match http_client() {
        Ok(c) => c,
        Err(e) => return QrzLookupOutcome::Error(e.to_string()),
    };
    let resp = match client
        .get(QRZ_BASE_URL)
        .query(&[("s", session_key), ("callsign", call_sign)])
        .send()
        .await
    {
        Ok(r) => r,
        Err(e) if is_offline_error(&e) => return QrzLookupOutcome::Offline,
        Err(e) => return QrzLookupOutcome::Error(e.to_string()),
    };
    let body = match resp.text().await {
        Ok(b) => b,
        Err(e) if is_offline_error(&e) => return QrzLookupOutcome::Offline,
        Err(e) => return QrzLookupOutcome::Error(e.to_string()),
    };
    let fields = parse_flat_xml(&body);
    if let Some(err) = fields.get("Error") {
        let lower = err.to_lowercase();
        if lower.contains("session") {
            return QrzLookupOutcome::SessionExpired;
        }
        if lower.contains("not found") {
            return QrzLookupOutcome::NotFound;
        }
        return QrzLookupOutcome::Error(err.clone());
    }
    match qrz_info_from_fields(&fields) {
        Some(info) => QrzLookupOutcome::Found(info),
        None => QrzLookupOutcome::NotFound,
    }
}

/// QRZ `geoloc` values meaning the coordinates are a real point for the
/// station (operator-supplied, or geocoded from their address) rather than
/// QRZ rounding off to a grid square, ZIP, state, or country.
fn qrz_geoloc_is_exact(geoloc: &str) -> bool {
    matches!(geoloc.trim().to_lowercase().as_str(), "user" | "geocode")
}

fn qrz_info_from_fields(fields: &HashMap<String, String>) -> Option<QrzCallsignInfo> {
    let call = fields.get("call")?;
    let full_name = match (fields.get("fname"), fields.get("name")) {
        (Some(f), Some(l)) => Some(format!("{f} {l}")),
        (Some(f), None) => Some(f.clone()),
        (None, Some(l)) => Some(l.clone()),
        (None, None) => None,
    };
    // QRZ's `addr2` is the city; `state` is present for US/Canada
    // stations, otherwise fall back to `country`.
    let qth_location = match (fields.get("addr2"), fields.get("state")) {
        (Some(city), Some(state)) => Some(format!("{city}, {state}")),
        (Some(city), None) => Some(city.clone()),
        (None, Some(state)) => Some(state.clone()),
        (None, None) => fields.get("country").cloned(),
    };
    let geoloc = fields.get("geoloc").cloned();
    let (exact_lat, exact_lon) = if geoloc.as_deref().is_some_and(qrz_geoloc_is_exact) {
        let lat = fields.get("lat").and_then(|v| v.trim().parse::<f64>().ok());
        let lon = fields.get("lon").and_then(|v| v.trim().parse::<f64>().ok());
        match (lat, lon) {
            (Some(lat), Some(lon)) if (-90.0..=90.0).contains(&lat) && (-180.0..=180.0).contains(&lon) => {
                (Some(lat), Some(lon))
            }
            _ => (None, None),
        }
    } else {
        (None, None)
    };
    Some(QrzCallsignInfo {
        call: call.clone(),
        name: full_name,
        qth_location,
        grid_square: fields.get("grid").cloned(),
        address: qrz_full_address(fields),
        exact_lat,
        exact_lon,
        geoloc,
    })
}

#[cfg(test)]
mod work_offline_tests {
    use super::*;

    #[test]
    fn lookups_report_offline_without_trying_the_network() {
        crate::net::set_work_offline(true);
        use tauri::async_runtime::block_on;
        assert!(matches!(block_on(qrz_login("u", "p")), QrzLoginOutcome::Offline));
        assert!(matches!(block_on(qrz_lookup("key", "W1AW")), QrzLookupOutcome::Offline));
        assert!(matches!(block_on(geocode_location("Orlando, FL")), GeocodeOutcome::Offline));
        crate::net::set_work_offline(false);
    }
}

#[cfg(test)]
mod qrz_tests {
    use super::*;

    fn fields(xml: &str) -> HashMap<String, String> {
        parse_flat_xml(xml)
    }

    const BASE: &str = "<QRZDatabase><Callsign><call>W1AW</call><fname>Hiram</fname><name>Maxim</name>\
        <addr1>225 Main St</addr1><addr2>Newington</addr2><state>CT</state><zip>06111</zip>\
        <country>United States</country><grid>FN31pr</grid>";

    #[test]
    fn geocoded_coordinates_are_kept_as_exact() {
        let xml = format!("{BASE}<lat>41.714775</lat><lon>-72.727260</lon><geoloc>geocode</geoloc></Callsign></QRZDatabase>");
        let info = qrz_info_from_fields(&fields(&xml)).unwrap();
        assert!((info.exact_lat.unwrap() - 41.714775).abs() < 1e-6);
        assert!((info.exact_lon.unwrap() - -72.727260).abs() < 1e-6);
        assert_eq!(info.geoloc.as_deref(), Some("geocode"));
    }

    #[test]
    fn user_supplied_coordinates_are_exact_too() {
        let xml = format!("{BASE}<lat>41.7</lat><lon>-72.7</lon><geoloc>user</geoloc></Callsign></QRZDatabase>");
        assert!(qrz_info_from_fields(&fields(&xml)).unwrap().exact_lat.is_some());
    }

    #[test]
    fn rounded_geoloc_sources_are_not_treated_as_exact() {
        for src in ["grid", "zip", "state", "dxcc", "none"] {
            let xml = format!("{BASE}<lat>41.7</lat><lon>-72.7</lon><geoloc>{src}</geoloc></Callsign></QRZDatabase>");
            let info = qrz_info_from_fields(&fields(&xml)).unwrap();
            assert!(info.exact_lat.is_none() && info.exact_lon.is_none(), "{src}");
            assert_eq!(info.geoloc.as_deref(), Some(src));
        }
    }

    #[test]
    fn missing_or_bad_coordinates_yield_none() {
        let no_coords = format!("{BASE}<geoloc>geocode</geoloc></Callsign></QRZDatabase>");
        assert!(qrz_info_from_fields(&fields(&no_coords)).unwrap().exact_lat.is_none());
        let junk = format!("{BASE}<lat>abc</lat><lon>-72.7</lon><geoloc>geocode</geoloc></Callsign></QRZDatabase>");
        assert!(qrz_info_from_fields(&fields(&junk)).unwrap().exact_lat.is_none());
        let out_of_range = format!("{BASE}<lat>141.7</lat><lon>-72.7</lon><geoloc>geocode</geoloc></Callsign></QRZDatabase>");
        assert!(qrz_info_from_fields(&fields(&out_of_range)).unwrap().exact_lat.is_none());
    }

    #[test]
    fn existing_fields_still_parse() {
        let xml = format!("{BASE}</Callsign></QRZDatabase>");
        let info = qrz_info_from_fields(&fields(&xml)).unwrap();
        assert_eq!(info.name.as_deref(), Some("Hiram Maxim"));
        assert_eq!(info.qth_location.as_deref(), Some("Newington, CT"));
        assert_eq!(info.grid_square.as_deref(), Some("FN31pr"));
        assert!(info.exact_lat.is_none());
    }
}

#[derive(Serialize, Debug, Clone)]
pub struct GeocodeResult {
    pub lat: f64,
    pub lon: f64,
    pub display_name: Option<String>,
}

pub enum GeocodeOutcome {
    Found(GeocodeResult),
    NotFound,
    /// See `QrzLookupOutcome::Offline`.
    Offline,
    Error(String),
}

/// Resolves free-text location/address into coordinates via the public
/// OpenStreetMap Nominatim search API (CIMAP-011). No API key: it's the
/// fallback path when a check-in has no grid square, and CIMAP-040 requires
/// this to work without operator configuration.
///
/// Restricted to the US (`countrycodes=us`): this application's domain is
/// US ham radio operations (NEXRAD stations, US zip codes throughout), and
/// a short numeric query like a 5-digit zip code is otherwise ambiguous —
/// many countries use similarly-formatted postal codes, and an unrestricted
/// search can resolve a US zip to a same-numbered location elsewhere.
pub async fn geocode_location(query: &str) -> GeocodeOutcome {
    if crate::net::working_offline() {
        return GeocodeOutcome::Offline;
    }
    let client = match http_client() {
        Ok(c) => c,
        Err(e) => return GeocodeOutcome::Error(e.to_string()),
    };
    let resp = match client
        .get(NOMINATIM_URL)
        .query(&[
            ("q", query),
            ("format", "json"),
            ("limit", "1"),
            ("countrycodes", "us"),
        ])
        .header("User-Agent", USER_AGENT)
        .send()
        .await
    {
        Ok(r) => r,
        Err(e) if is_offline_error(&e) => return GeocodeOutcome::Offline,
        Err(e) => return GeocodeOutcome::Error(e.to_string()),
    };
    if !resp.status().is_success() {
        return GeocodeOutcome::Error(format!("geocoding HTTP error: {}", resp.status()));
    }
    let body: Value = match resp.json().await {
        Ok(b) => b,
        Err(e) if is_offline_error(&e) => return GeocodeOutcome::Offline,
        Err(e) => return GeocodeOutcome::Error(e.to_string()),
    };
    let first = match body.as_array().and_then(|a| a.first()) {
        Some(v) => v,
        None => return GeocodeOutcome::NotFound,
    };
    let lat = first
        .get("lat")
        .and_then(Value::as_str)
        .and_then(|s| s.parse::<f64>().ok());
    let lon = first
        .get("lon")
        .and_then(Value::as_str)
        .and_then(|s| s.parse::<f64>().ok());
    let display_name = first
        .get("display_name")
        .and_then(Value::as_str)
        .map(String::from);
    match (lat, lon) {
        (Some(lat), Some(lon)) => GeocodeOutcome::Found(GeocodeResult {
            lat,
            lon,
            display_name,
        }),
        _ => GeocodeOutcome::Error("geocoding response missing coordinates".to_string()),
    }
}
