//! HF conditions (docs/features/hf-conditions.md): NOAA SWPC's space weather
//! scales and outlook, the K and A indexes, solar flux, and D-RAP's
//! absorption at the weather area. Only fetched and parsed here; what it
//! means for a net is worked out in the interface (hfConditions.ts).

use crate::net::{client, USER_AGENT};
use chrono::{NaiveDate, NaiveDateTime, NaiveTime};
use serde::Serialize;
use serde_json::Value;
use std::error::Error;
use std::time::Duration;

const SWPC: &str = "https://services.swpc.noaa.gov";

#[derive(Serialize, Debug, Clone, PartialEq, Default)]
pub struct HfConditions {
    /// 10.7 cm solar flux, and when it was measured (RFC 3339, UTC).
    pub flux: Option<f64>,
    pub flux_at: String,
    /// The latest planetary K index, the running A index, and the start of
    /// the three hours they're for.
    pub kp: Option<f64>,
    pub a_index: Option<f64>,
    pub kp_at: String,
    /// The R, S and G scales now, 0–5, and when NOAA last set them.
    pub r: u8,
    pub s: u8,
    pub g: u8,
    pub scales_at: String,
    /// The rest of today and the days after, in order (HFC-005).
    pub outlook: Vec<OutlookDay>,
    /// D-RAP at the point nearest the weather area (HFC-004); None with no
    /// area, or when it couldn't be read.
    pub absorption: Option<Absorption>,
}

#[derive(Serialize, Debug, Clone, PartialEq, Default)]
pub struct OutlookDay {
    /// YYYY-MM-DD (UTC).
    pub date: String,
    /// The highest G scale expected.
    pub g: u8,
    /// Chance of an R1–R2 and of an R3-or-worse blackout, in percent.
    pub r_minor_pct: Option<u8>,
    pub r_major_pct: Option<u8>,
}

#[derive(Serialize, Debug, Clone, PartialEq, Default)]
pub struct Absorption {
    /// The highest frequency absorbed by 1 dB or more, in MHz (0 for none).
    pub mhz: f64,
    pub valid_at: String,
    /// D-RAP's own words: "Normal X-ray Background", "Normal Proton
    /// Background", or what's happening instead, and its recovery estimate.
    pub xray: String,
    pub proton: String,
    pub recovery: String,
}

/// "2026-10-18T20:00:00" (UTC, as SWPC writes it) as RFC 3339.
fn utc(tag: &str) -> String {
    NaiveDateTime::parse_from_str(tag.trim(), "%Y-%m-%dT%H:%M:%S")
        .or_else(|_| NaiveDateTime::parse_from_str(tag.trim(), "%Y-%m-%d %H:%M:%S"))
        .map(|t| t.and_utc().to_rfc3339())
        .unwrap_or_default()
}

/// A level or a percentage, which SWPC writes as text ("1", "25") or null.
fn small(v: &Value) -> Option<u8> {
    match v {
        Value::String(s) => s.trim().parse().ok(),
        Value::Number(n) => n.as_u64().and_then(|n| u8::try_from(n).ok()),
        _ => None,
    }
}

/// The scales now and the outlook, from `noaa-scales.json`: "0" is now, "1"
/// the rest of today, "2" and on the days after ("-1", yesterday, is left out).
pub fn parse_scales(v: &Value, into: &mut HfConditions) {
    let Some(days) = v.as_object() else { return };
    if let Some(now) = days.get("0") {
        into.r = small(&now["R"]["Scale"]).unwrap_or(0);
        into.s = small(&now["S"]["Scale"]).unwrap_or(0);
        into.g = small(&now["G"]["Scale"]).unwrap_or(0);
        let date = now["DateStamp"].as_str().unwrap_or_default();
        let time = now["TimeStamp"].as_str().unwrap_or_default();
        into.scales_at = utc(&format!("{date}T{time}"));
    }
    let mut keys: Vec<i32> = days.keys().filter_map(|k| k.parse().ok()).filter(|k| *k >= 1).collect();
    keys.sort();
    into.outlook = keys
        .into_iter()
        .filter_map(|k| days.get(&k.to_string()))
        .map(|d| OutlookDay {
            date: d["DateStamp"].as_str().unwrap_or_default().to_string(),
            g: small(&d["G"]["Scale"]).unwrap_or(0),
            r_minor_pct: small(&d["R"]["MinorProb"]),
            r_major_pct: small(&d["R"]["MajorProb"]),
        })
        .collect();
}

/// The latest reading from `noaa-planetary-k-index.json`, oldest first.
pub fn parse_kp(v: &Value, into: &mut HfConditions) {
    if let Some(last) = v.as_array().and_then(|a| a.last()) {
        into.kp = last["Kp"].as_f64();
        into.a_index = last["a_running"].as_f64();
        into.kp_at = utc(last["time_tag"].as_str().unwrap_or_default());
    }
}

/// From `summary/10cm-flux.json`, a list of one.
pub fn parse_flux(v: &Value, into: &mut HfConditions) {
    if let Some(f) = v.as_array().and_then(|a| a.first()) {
        into.flux = f["flux"].as_f64();
        into.flux_at = utc(f["time_tag"].as_str().unwrap_or_default());
    }
}

/// A header line's value: "#  X-RAY Message : Normal X-ray Background".
fn header(text: &str, name: &str) -> String {
    text.lines()
        .filter_map(|l| l.strip_prefix('#'))
        .find_map(|l| {
            let (k, v) = l.split_once(':')?;
            (k.trim() == name).then(|| v.trim().to_string())
        })
        .unwrap_or_default()
}

/// D-RAP at the grid point nearest `lat`, `lon`: rows of latitude ("29 | 0.0
/// 0.0 …"), columns of longitude from the heading line above them. None
/// when the text isn't laid out that way.
pub fn parse_drap(text: &str, lat: f64, lon: f64) -> Option<Absorption> {
    let lons: Vec<f64> = text
        .lines()
        .find(|l| !l.starts_with('#') && !l.contains('|') && l.split_whitespace().count() > 10)?
        .split_whitespace()
        .map(str::parse)
        .collect::<Result<_, _>>()
        .ok()?;
    let lon = if lon > 180.0 { lon - 360.0 } else { lon };
    let col = (0..lons.len()).min_by(|&a, &b| (lons[a] - lon).abs().total_cmp(&(lons[b] - lon).abs()))?;
    let mut best: Option<(f64, f64)> = None;
    for l in text.lines() {
        let Some((row_lat, values)) = l.split_once('|') else { continue };
        let Ok(row_lat) = row_lat.trim().parse::<f64>() else { continue };
        let Some(v) = values.split_whitespace().nth(col).and_then(|v| v.parse::<f64>().ok()) else { continue };
        if best.is_none_or(|(b, _)| (row_lat - lat).abs() < (b - lat).abs()) {
            best = Some((row_lat, v));
        }
    }
    let (_, mhz) = best?;
    // "Product Valid At : 2026-10-18 23:41 UTC"
    let valid = header(text, "Product Valid At");
    let valid_at = NaiveDate::parse_from_str(valid.get(..10).unwrap_or_default(), "%Y-%m-%d")
        .ok()
        .zip(NaiveTime::parse_from_str(valid.get(11..16).unwrap_or_default(), "%H:%M").ok())
        .map(|(d, t)| d.and_time(t).and_utc().to_rfc3339())
        .unwrap_or_default();
    Some(Absorption {
        mhz,
        valid_at,
        xray: header(text, "X-RAY Message"),
        proton: header(text, "Proton Message"),
        recovery: header(text, "Estimated Recovery Time"),
    })
}

async fn get(c: &reqwest::Client, path: &str) -> Result<String, Box<dyn Error + Send + Sync>> {
    Ok(c.get(format!("{SWPC}{path}"))
        .header("User-Agent", USER_AGENT)
        .send()
        .await?
        .error_for_status()?
        .text()
        .await?)
}

/// Everything the panel shows, fetched together. The scales, K index and
/// flux must all come back; D-RAP is only asked for with an area, and the
/// panel goes without it if it fails.
pub async fn fetch(area: Option<(f64, f64)>) -> Result<HfConditions, Box<dyn Error + Send + Sync>> {
    let c = client(Duration::from_secs(10), Some(Duration::from_secs(30)))?;
    let (scales, kp, flux, drap) = tokio::join!(
        get(&c, "/products/noaa-scales.json"),
        get(&c, "/products/noaa-planetary-k-index.json"),
        get(&c, "/products/summary/10cm-flux.json"),
        async {
            match area {
                Some(_) => get(&c, "/text/drap_global_frequencies.txt").await.ok(),
                None => None,
            }
        }
    );
    let mut out = HfConditions::default();
    parse_scales(&serde_json::from_str(&scales?)?, &mut out);
    parse_kp(&serde_json::from_str(&kp?)?, &mut out);
    parse_flux(&serde_json::from_str(&flux?)?, &mut out);
    out.absorption = area.zip(drap).and_then(|((lat, lon), text)| parse_drap(&text, lat, lon));
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Recorded from SWPC on 2026-10-18 (quiet, a G1 storm forecast for the next two days).
    const SCALES: &str = include_str!("../tests/fixtures/swpc/noaa-scales.json");
    const KP: &str = include_str!("../tests/fixtures/swpc/noaa-planetary-k-index.json");
    const FLUX: &str = include_str!("../tests/fixtures/swpc/10cm-flux.json");
    const DRAP: &str = include_str!("../tests/fixtures/swpc/drap_global_frequencies.txt");

    #[test]
    fn reads_the_scales_now_and_the_outlook() {
        // HFC-003, HFC-005
        let mut c = HfConditions::default();
        parse_scales(&serde_json::from_str(SCALES).unwrap(), &mut c);
        assert_eq!((c.r, c.s, c.g), (0, 0, 0));
        assert_eq!(c.scales_at, "2026-10-18T23:44:00+00:00");
        let days: Vec<_> = c.outlook.iter().map(|d| (d.date.as_str(), d.g, d.r_minor_pct, d.r_major_pct)).collect();
        assert_eq!(
            days,
            [("2026-10-18", 0, Some(25), Some(5)), ("2026-10-19", 1, Some(25), Some(5)), ("2026-10-20", 1, Some(25), Some(5))]
        );
    }

    #[test]
    fn reads_the_latest_k_a_and_flux() {
        // HFC-002
        let mut c = HfConditions::default();
        parse_kp(&serde_json::from_str(KP).unwrap(), &mut c);
        parse_flux(&serde_json::from_str(FLUX).unwrap(), &mut c);
        assert_eq!((c.kp, c.a_index, c.kp_at.as_str()), (Some(1.67), Some(6.0), "2026-10-18T18:00:00+00:00"));
        assert_eq!((c.flux, c.flux_at.as_str()), (Some(137.0), "2026-10-18T20:00:00+00:00"));
    }

    #[test]
    fn reads_absorption_at_the_nearest_grid_point() {
        // HFC-004: quiet, so nothing over Florida at dusk, and the daytime
        // background near the equator on the sunlit side.
        let fl = parse_drap(DRAP, 28.5, -81.4).unwrap();
        assert_eq!(fl.mhz, 0.0);
        assert_eq!((fl.xray.as_str(), fl.proton.as_str()), ("Normal X-ray Background", "Normal Proton Background"));
        assert_eq!((fl.recovery.as_str(), fl.valid_at.as_str()), ("No Estimate", "2026-10-18T23:43:00+00:00"));
        assert_eq!(parse_drap(DRAP, -1.0, -174.0).unwrap().mhz, 3.5);
        // Longitudes past 180 (as some sources write them) wrap round.
        assert_eq!(parse_drap(DRAP, -1.0, 186.0).unwrap().mhz, 3.5);
        assert!(parse_drap("not a table", 28.5, -81.4).is_none());
    }

    /// Against NOAA itself: `cargo test live_swpc -- --ignored --nocapture`.
    #[tokio::test]
    #[ignore]
    async fn live_swpc() {
        let c = fetch(Some((28.5, -81.4))).await.unwrap();
        println!("{c:#?}");
        assert!(c.flux.is_some() && c.kp.is_some() && !c.scales_at.is_empty());
        assert!(!c.outlook.is_empty());
        assert!(c.absorption.is_some());
    }

    #[test]
    fn a_flare_is_read_from_its_messages() {
        let flare = DRAP
            .replace("Normal X-ray Background", "R2 (Moderate) Radio Blackout in progress")
            .replace("Estimated Recovery Time : No Estimate", "Estimated Recovery Time : 45 minutes");
        let a = parse_drap(&flare, 28.5, -81.4).unwrap();
        assert_eq!((a.xray.as_str(), a.recovery.as_str()), ("R2 (Moderate) Radio Blackout in progress", "45 minutes"));
    }
}
