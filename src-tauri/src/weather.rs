//! The weather when a net started and ended (docs/features/net-weather.md):
//! the reading from the NWS station nearest the repeater, or else net
//! control, taken closest to the moment, and the NWS alerts in effect there.
//! Read in the background as a net starts and ends; never from the Settings
//! weather area, which may be somewhere else entirely.

use crate::net::{client, USER_AGENT};
use chrono::{DateTime, Duration as ChronoDuration, SecondsFormat, Utc};
use serde::Serialize;
use serde_json::Value;
use std::error::Error;
use std::time::Duration;

/// How far from the moment a reading may be and still describe it. Stations
/// report hourly, some every 20 minutes.
const WINDOW_MINUTES: i64 = 90;
/// Stations to try, nearest first, when the nearest has no usable reading.
const STATIONS_TO_TRY: usize = 3;

#[derive(Serialize, Debug, Clone, PartialEq)]
pub struct ActivityWeather {
    /// "start" or "end".
    pub moment: String,
    /// "ok" (the fields below hold a reading), or why there's none: "offline",
    /// "no_place" (no repeater or net control location), "error" (NWS
    /// couldn't be reached or refused), "no_reading" (no nearby report).
    pub outcome: String,
    /// "repeater" or "net_control": where it was read for; empty without a reading.
    pub place: String,
    pub station_id: String,
    pub station_name: String,
    pub observed_at: String,
    pub temp_c: Option<f64>,
    pub conditions: String,
    pub wind_dir_deg: Option<f64>,
    pub wind_speed_kmh: Option<f64>,
    pub wind_gust_kmh: Option<f64>,
    /// The alerts in effect, e.g. "Severe Thunderstorm Warning".
    pub alerts: Vec<String>,
}

/// What it's doing now at a place: the nearest station's latest reading
/// (the Weather tab's Now, and a SKYWARN net's weather line).
#[derive(Serialize, Debug, Clone, PartialEq)]
pub struct CurrentWeather {
    pub station_id: String,
    pub station_name: String,
    pub observed_at: String,
    pub temp_c: Option<f64>,
    pub conditions: String,
    pub wind_dir_deg: Option<f64>,
    pub wind_speed_kmh: Option<f64>,
    pub wind_gust_kmh: Option<f64>,
}

/// The latest reading near a point, from the last 90 minutes; None if no
/// nearby station has reported.
pub async fn fetch_current(lat: f64, lon: f64) -> Result<Option<CurrentWeather>, Box<dyn Error>> {
    Ok(fetch_observation_near(lat, lon, Utc::now()).await?.map(|(station_id, station_name, o)| CurrentWeather {
        station_id,
        station_name,
        observed_at: o.observed_at.to_rfc3339(),
        temp_c: o.temp_c,
        conditions: o.conditions,
        wind_dir_deg: o.wind_dir_deg,
        wind_speed_kmh: o.wind_speed_kmh,
        wind_gust_kmh: o.wind_gust_kmh,
    }))
}

/// NOAA's national radar mosaic (base reflectivity, quality-controlled), as
/// a map layer that radar.weather.gov itself draws from (RADAR-010).
pub const RADAR_WMS: &str = "https://opengeo.ncep.noaa.gov/geoserver/conus/conus_bref_qcd/ows";

/// Scans kept for the loop: every one of the last hour (about every two
/// minutes, so about 30), for smooth motion (RADAR-011).
const RADAR_LOOP_MINUTES: i64 = 60;

/**
 * The times of the radar scans to loop, oldest first, from the layer's WMS
 * capabilities: its `time` dimension lists every scan of the last couple of
 * hours; this keeps the last hour's.
 */
pub fn radar_frame_times(capabilities: &str, now: DateTime<Utc>) -> Vec<String> {
    let Some(start) = capabilities.find("<Dimension name=\"time\"") else {
        return Vec::new();
    };
    let Some(open) = capabilities[start..].find('>') else {
        return Vec::new();
    };
    let body = &capabilities[start + open + 1..];
    let body = &body[..body.find('<').unwrap_or(body.len())];
    let cutoff = now - ChronoDuration::minutes(RADAR_LOOP_MINUTES);
    let mut times: Vec<String> = body
        .split(',')
        .map(str::trim)
        .filter(|t| {
            DateTime::parse_from_rfc3339(t)
                .map(|d| d.with_timezone(&Utc) >= cutoff)
                .unwrap_or(false)
        })
        .map(String::from)
        .collect();
    times.sort();
    times
}

/// The radar loop's scan times, oldest first (RADAR-011).
pub async fn fetch_radar_frames() -> Result<Vec<String>, Box<dyn Error>> {
    let c = client(Duration::from_secs(5), Some(Duration::from_secs(15)))?;
    let resp = c
        .get(RADAR_WMS)
        .query(&[("service", "WMS"), ("version", "1.3.0"), ("request", "GetCapabilities")])
        .header("User-Agent", USER_AGENT)
        .send()
        .await?;
    if !resp.status().is_success() {
        return Err(Box::from(format!("NOAA radar HTTP error: {}", resp.status())));
    }
    Ok(radar_frame_times(&resp.text().await?, Utc::now()))
}

/// A station's reading, before it's tied to an activity.
#[derive(Debug, Clone, PartialEq)]
pub struct Observation {
    pub observed_at: DateTime<Utc>,
    pub temp_c: Option<f64>,
    pub conditions: String,
    pub wind_dir_deg: Option<f64>,
    pub wind_speed_kmh: Option<f64>,
    pub wind_gust_kmh: Option<f64>,
}

/// Where a net's weather is read: the repeater, else net control; none
/// without either (no guessing from elsewhere).
pub fn weather_point(
    repeater: (Option<f64>, Option<f64>),
    net_control: (Option<f64>, Option<f64>),
) -> Option<(&'static str, f64, f64)> {
    match (repeater, net_control) {
        ((Some(lat), Some(lon)), _) => Some(("repeater", lat, lon)),
        (_, (Some(lat), Some(lon))) => Some(("net_control", lat, lon)),
        _ => None,
    }
}

fn number(v: &Value, key: &str) -> Option<f64> {
    v.get(key).and_then(|q| q.get("value")).and_then(Value::as_f64)
}

/// The reading in an NWS observations list closest to `at`, within the
/// window; readings with neither a temperature nor conditions are skipped.
pub fn pick_observation(body: &Value, at: DateTime<Utc>) -> Option<Observation> {
    body.get("features")?
        .as_array()?
        .iter()
        .filter_map(|f| {
            let p = f.get("properties")?;
            let observed_at = DateTime::parse_from_rfc3339(p.get("timestamp")?.as_str()?)
                .ok()?
                .with_timezone(&Utc);
            let o = Observation {
                observed_at,
                temp_c: number(p, "temperature"),
                conditions: p
                    .get("textDescription")
                    .and_then(Value::as_str)
                    .unwrap_or("")
                    .trim()
                    .to_string(),
                wind_dir_deg: number(p, "windDirection"),
                wind_speed_kmh: number(p, "windSpeed"),
                wind_gust_kmh: number(p, "windGust"),
            };
            (o.temp_c.is_some() || !o.conditions.is_empty()).then_some(o)
        })
        .filter(|o| (o.observed_at - at).num_minutes().abs() <= WINDOW_MINUTES)
        .min_by_key(|o| (o.observed_at - at).num_seconds().abs())
}

/// The names of the alerts in an NWS alerts response, each once, in order.
pub fn alert_names(body: &Value) -> Vec<String> {
    let mut names: Vec<String> = Vec::new();
    for f in body.get("features").and_then(Value::as_array).into_iter().flatten() {
        if let Some(e) = f.get("properties").and_then(|p| p.get("event")).and_then(Value::as_str) {
            if !names.iter().any(|n| n == e) {
                names.push(e.to_string());
            }
        }
    }
    names
}

async fn get_json(c: &reqwest::Client, url: &str, query: &[(&str, String)]) -> Result<Value, Box<dyn Error>> {
    let resp = c
        .get(url)
        .query(query)
        .header("User-Agent", USER_AGENT)
        .header("Accept", "application/geo+json, application/json")
        .send()
        .await?;
    if !resp.status().is_success() {
        return Err(Box::from(format!("NWS API HTTP error: {}", resp.status())));
    }
    Ok(resp.json().await?)
}

/// The reading nearest `at` from the stations nearest a point, with the
/// station's id and name; None when no nearby station has one in the window.
pub async fn fetch_observation_near(
    lat: f64,
    lon: f64,
    at: DateTime<Utc>,
) -> Result<Option<(String, String, Observation)>, Box<dyn Error>> {
    let c = client(Duration::from_secs(5), Some(Duration::from_secs(10)))?;
    let point = get_json(&c, &format!("https://api.weather.gov/points/{lat:.4},{lon:.4}"), &[]).await?;
    let stations_url = point
        .get("properties")
        .and_then(|p| p.get("observationStations"))
        .and_then(Value::as_str)
        .ok_or("NWS points response missing observation stations")?
        .to_string();
    let stations = get_json(&c, &stations_url, &[]).await?;
    // The API refuses an end in the future.
    let end = (at + ChronoDuration::minutes(WINDOW_MINUTES)).min(Utc::now());
    let start = at - ChronoDuration::minutes(WINDOW_MINUTES);
    for s in stations
        .get("features")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .take(STATIONS_TO_TRY)
    {
        let Some(p) = s.get("properties") else { continue };
        let Some(id) = p.get("stationIdentifier").and_then(Value::as_str) else { continue };
        let name = p.get("name").and_then(Value::as_str).unwrap_or("").to_string();
        let obs = get_json(
            &c,
            &format!("https://api.weather.gov/stations/{id}/observations"),
            // Whole seconds: NWS refuses fractions (400 Bad Request).
            &[
                ("start", start.to_rfc3339_opts(SecondsFormat::Secs, true)),
                ("end", end.to_rfc3339_opts(SecondsFormat::Secs, true)),
            ],
        )
        .await?;
        if let Some(o) = pick_observation(&obs, at) {
            return Ok(Some((id.to_string(), name, o)));
        }
    }
    Ok(None)
}

/// No reading for a moment, and why (see `ActivityWeather::outcome`).
pub fn without_reading(moment: &str, outcome: &str) -> ActivityWeather {
    ActivityWeather {
        moment: moment.to_string(),
        outcome: outcome.to_string(),
        place: String::new(),
        station_id: String::new(),
        station_name: String::new(),
        observed_at: String::new(),
        temp_c: None,
        conditions: String::new(),
        wind_dir_deg: None,
        wind_speed_kmh: None,
        wind_gust_kmh: None,
        alerts: Vec::new(),
    }
}

/// Reads and keeps the weather for an activity's start or end, in the
/// background so starting or ending a net never waits on it. Without a
/// reading it keeps why (WX-006), and either way tells the window.
pub fn record_in_background(app: tauri::AppHandle, activity_id: String, moment: &'static str) {
    tauri::async_runtime::spawn(async move {
        use tauri::Manager;
        let w = read(&app, &activity_id, moment).await;
        let state = app.state::<crate::commands::AppState>();
        if let Err(e) = state.repo.lock().unwrap().save_activity_weather(&activity_id, &w) {
            eprintln!("weather for {activity_id} ({moment}): {e}");
            return;
        }
        let _ = tauri::Emitter::emit(&app, "activity-weather", &activity_id);
    });
}

async fn read(app: &tauri::AppHandle, activity_id: &str, moment: &'static str) -> ActivityWeather {
    use tauri::Manager;
    if crate::net::working_offline() {
        return without_reading(moment, "offline");
    }
    let state = app.state::<crate::commands::AppState>();
    let Ok(activity) = state.repo.lock().unwrap().get_activity(activity_id) else {
        return without_reading(moment, "error");
    };
    let key = {
        let s = state.settings.lock().unwrap();
        (!s.nws_api_key.is_empty()).then(|| s.nws_api_key.clone())
    };
    let Some((place, lat, lon)) = weather_point(
        (activity.repeater_lat, activity.repeater_lon),
        (activity.location_lat, activity.location_lon),
    ) else {
        return without_reading(moment, "no_place");
    };
    let when = if moment == "start" { &activity.opened_at } else { &activity.closed_at };
    let at = DateTime::parse_from_rfc3339(when)
        .map(|t| t.with_timezone(&Utc))
        .unwrap_or_else(|_| Utc::now());
    let (station_id, station_name, o) = match fetch_observation_near(lat, lon, at).await {
        Ok(Some(found)) => found,
        Ok(None) => return without_reading(moment, "no_reading"),
        Err(e) => {
            eprintln!("weather for {activity_id} ({moment}): {e}");
            return without_reading(moment, "error");
        }
    };
    // The alerts in effect now: as the net starts or ends, give or take.
    let alerts = crate::connectors::fetch_nws_alerts(key.as_deref(), Some((lat, lon)))
        .await
        .map(|v| alert_names(&v))
        .unwrap_or_default();
    ActivityWeather {
        moment: moment.to_string(),
        outcome: "ok".to_string(),
        place: place.to_string(),
        station_id,
        station_name,
        observed_at: o.observed_at.to_rfc3339(),
        temp_c: o.temp_c,
        conditions: o.conditions,
        wind_dir_deg: o.wind_dir_deg,
        wind_speed_kmh: o.wind_speed_kmh,
        wind_gust_kmh: o.wind_gust_kmh,
        alerts,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn t(s: &str) -> DateTime<Utc> {
        DateTime::parse_from_rfc3339(s).unwrap().with_timezone(&Utc)
    }

    fn obs(ts: &str, temp: Option<f64>, text: &str) -> Value {
        json!({ "properties": {
            "timestamp": ts,
            "textDescription": text,
            "temperature": { "value": temp, "unitCode": "wmoUnit:degC" },
            "windDirection": { "value": 180.0 },
            "windSpeed": { "value": 24.1 },
            "windGust": { "value": null },
        }})
    }

    #[test]
    fn reads_at_the_repeater_else_net_control_else_nowhere() {
        assert_eq!(weather_point((Some(1.0), Some(2.0)), (Some(3.0), Some(4.0))), Some(("repeater", 1.0, 2.0)));
        assert_eq!(weather_point((None, None), (Some(3.0), Some(4.0))), Some(("net_control", 3.0, 4.0)));
        assert_eq!(weather_point((Some(1.0), None), (None, None)), None);
    }

    #[test]
    fn picks_the_reading_closest_to_the_moment() {
        let body = json!({ "features": [
            obs("2026-10-05T23:53:00+00:00", Some(24.0), "Cloudy"),
            obs("2026-10-05T23:15:00+00:00", Some(26.0), "Thunderstorms"),
            obs("2026-10-05T22:53:00+00:00", Some(27.0), "Partly Cloudy"),
        ]});
        let o = pick_observation(&body, t("2026-10-05T23:20:00Z")).unwrap();
        assert_eq!(o.conditions, "Thunderstorms");
        assert_eq!(o.temp_c, Some(26.0));
        assert_eq!(o.wind_dir_deg, Some(180.0));
        assert_eq!(o.wind_gust_kmh, None);
    }

    #[test]
    fn skips_empty_readings_and_ones_outside_the_window() {
        let body = json!({ "features": [
            obs("2026-10-05T23:20:00+00:00", None, ""),
            obs("2026-10-05T20:00:00+00:00", Some(30.0), "Sunny"),
            obs("2026-10-05T22:30:00+00:00", None, "Rain"),
        ]});
        let o = pick_observation(&body, t("2026-10-05T23:20:00Z")).unwrap();
        assert_eq!(o.conditions, "Rain");
        assert_eq!(pick_observation(&json!({ "features": [] }), t("2026-10-05T23:20:00Z")), None);
    }

    /// Against the live NWS service: `cargo test -- --ignored weather`.
    #[test]
    #[ignore]
    fn reads_a_live_observation_for_an_hour_ago() {
        let at = Utc::now() - ChronoDuration::hours(1);
        let found = tauri::async_runtime::block_on(fetch_observation_near(28.5383, -81.3792, at));
        let (station, _, o) = found.unwrap().unwrap();
        assert!(!station.is_empty());
        assert!((o.observed_at - at).num_minutes().abs() <= WINDOW_MINUTES);
    }

    #[test]
    fn loops_every_radar_scan_of_the_last_hour() {
        let now = t("2026-10-06T03:30:00Z");
        let caps = r#"<Layer><Dimension name="time" default="2026-10-06T03:28:00Z" units="ISO8601">2026-10-06T02:00:00.000Z,2026-10-06T02:32:00.000Z,2026-10-06T02:34:00.000Z,2026-10-06T02:36:00.000Z,2026-10-06T03:26:00.000Z,2026-10-06T03:28:00.000Z</Dimension></Layer>"#;
        assert_eq!(
            radar_frame_times(caps, now),
            [
                "2026-10-06T02:32:00.000Z",
                "2026-10-06T02:34:00.000Z",
                "2026-10-06T02:36:00.000Z",
                "2026-10-06T03:26:00.000Z",
                "2026-10-06T03:28:00.000Z"
            ]
        );
        assert!(radar_frame_times("<nothing/>", now).is_empty());
    }

    /// Against NOAA's live radar service: `cargo test -- --ignored radar`.
    #[test]
    #[ignore]
    fn reads_the_live_radar_scan_times() {
        let frames = tauri::async_runtime::block_on(fetch_radar_frames()).unwrap();
        assert!(frames.len() >= 5, "{frames:?}");
    }

    #[test]
    fn lists_each_alert_once() {
        let body = json!({ "features": [
            { "properties": { "event": "Severe Thunderstorm Warning" } },
            { "properties": { "event": "Flood Watch" } },
            { "properties": { "event": "Severe Thunderstorm Warning" } },
        ]});
        assert_eq!(alert_names(&body), vec!["Severe Thunderstorm Warning", "Flood Watch"]);
    }
}
