//! Offline data packs. A pack is one small JSON file (a few KB each) that
//! lives in the app's data folder. A bundled copy ships with the app so it
//! works offline out of the box, and "Update" (Settings -> Offline Data)
//! downloads the latest mile-marker data straight from the public source
//! (Florida DOT's published mile-marker layers), builds a fresh pack from it
//! on this computer, and keeps that copy for offline use. Nothing is hosted
//! by us: the app talks to the data provider directly.
//!
//! Sources are ArcGIS "feature layers" — plain web queries that answer with
//! JSON, on servers built for exactly this kind of programmatic access. Each
//! query is small (a few hundred points) and every request has a hard time
//! limit, so an update either finishes in seconds or says clearly why not.

use crate::net::{self, USER_AGENT};
use crate::routes::{clean_anchors, haversine_miles, Anchor, RoutePack};
use serde::Serialize;
use serde_json::Value;
use std::path::{Path, PathBuf};
use std::time::Duration;

const SOURCE_CREDIT: &str = "Florida Department of Transportation mile-marker data (public)";
const CONNECT_TIMEOUT: Duration = Duration::from_secs(8);
/// One web request, start to finish.
const REQUEST_TIMEOUT: Duration = Duration::from_secs(20);
/// A whole pack update (a few requests). Nothing here should take more than
/// seconds; this only exists so a bad connection can never hang the button.
pub const UPDATE_TIMEOUT: Duration = Duration::from_secs(60);
const PAGE_SIZE: usize = 1000;
const MAX_PAGES: usize = 20;

/// FDOT's inventory of posted mile-marker sign locations (from its Roadway
/// Characteristics Inventory). `ROADWAY` is FDOT's internal road-section ID —
/// not a road number, so each road below lists the section IDs that make it
/// up — and `MILEPOINT` is the number printed on the sign.
const FDOT_SIGNS: &str =
    "https://services1.arcgis.com/O1JpcwDW8sjYuddV/arcgis/rest/services/Mile_Markers_TDA/FeatureServer/0";
/// Mile markers keyed by state-road name. Its I-95 (SR 9) numbering matches
/// the posted miles and covers the whole state, which fills the part of I-95
/// (Miami/Broward) the sign inventory above doesn't include. Its other
/// interstates use route-milepoint numbering that differs from the signs, so
/// they aren't used.
const STATE_ROAD_MARKERS: &str =
    "https://services.arcgis.com/04HiymDgLlsbhaV4/arcgis/rest/services/State_Road_Mile_Markers/FeatureServer/0";

pub struct Source {
    pub layer: &'static str,
    pub where_clause: &'static str,
    pub mile_field: &'static str,
    /// This source numbers the road in the opposite direction from the
    /// first (primary) source. Its miles are flipped and shifted to line up
    /// with the primary's where the two overlap — see `align_reversed`.
    pub reversed: bool,
}

pub struct PackDef {
    pub id: &'static str,
    pub name: &'static str,
    pub description: &'static str,
    pub aliases: &'static [&'static str],
    /// The first source is primary; later ones only fill mile ranges the
    /// earlier ones don't cover.
    pub sources: &'static [Source],
    /// The copy bundled with the app.
    pub seed: &'static str,
}

pub const PACK_DEFS: &[PackDef] = &[
    PackDef {
        id: "route-fl-turnpike",
        name: "Florida's Turnpike",
        description: "Mile markers, Florida City to Wildwood (incl. the HEFT)",
        aliases: &["turnpike", "florida turnpike", "sr 91", "sr 821", "heft", "homestead extension"],
        sources: &[Source {
            layer: FDOT_SIGNS,
            where_clause: "ROADWAY IN ('87471000','86471000','86470000','93470000','89470000','94470000','88470000','92470000','92471000','75470000','11470000','18470000')",
            mile_field: "MILEPOINT",
            reversed: false,
        }],
        seed: include_str!("../datapacks/route-fl-turnpike.json"),
    },
    PackDef {
        id: "route-fl-i95",
        name: "I-95",
        description: "Mile markers within Florida",
        aliases: &["i-95", "i 95", "interstate 95", "95"],
        sources: &[
            Source {
                layer: FDOT_SIGNS,
                where_clause: "ROADWAY IN ('93220000','89095000','94001000','88081000','70220000','70225000','79002000','73001000','78080000','72280000','72020000','72290000','74160000')",
                mile_field: "MILEPOINT",
                reversed: false,
            },
            Source {
                layer: STATE_ROAD_MARKERS,
                where_clause: "ROUTE='SR    9'",
                mile_field: "Mile_Marker",
                reversed: false,
            },
        ],
        seed: include_str!("../datapacks/route-fl-i95.json"),
    },
    PackDef {
        id: "route-fl-i75",
        name: "I-75",
        description: "Mile markers within Florida",
        aliases: &["i-75", "i 75", "interstate 75", "75"],
        sources: &[Source {
            layer: FDOT_SIGNS,
            where_clause: "ROADWAY IN ('86075000','03175000','12075000','01075000','17075000','13075000','10075000','14140000','08150000','18130000','36210000','26260000','29180000','37130000','32100000')",
            mile_field: "MILEPOINT",
            reversed: false,
        }],
        seed: include_str!("../datapacks/route-fl-i75.json"),
    },
    PackDef {
        id: "route-fl-us1-keys",
        name: "US-1 (Florida Keys)",
        description: "Mile markers 0-127, Key West to Florida City",
        aliases: &["us-1", "us 1", "route 1", "1", "overseas highway", "overseas hwy"],
        sources: &[Source {
            layer: FDOT_SIGNS,
            where_clause: "ROADWAY IN ('90010000','90020000','90030000','90040000','90050000','90060000','87010000','87020000')",
            mile_field: "MILEPOINT",
            reversed: false,
        }],
        seed: include_str!("../datapacks/route-fl-us1-keys.json"),
    },
    PackDef {
        id: "route-fl-us41-tamiami",
        name: "US-41 (Tamiami Trail)",
        description: "Mile markers 3-107, Miami to Naples (as posted, counting west from Miami)",
        aliases: &["us-41", "us 41", "sr 41", "41", "tamiami trail", "tamiami", "sr 90"],
        // The posted signs count west from downtown Miami, but the sign
        // inventory only has the Miami-Dade stretch (about 19-43). The rest
        // comes from the state-road layer (US-41 here is SR 90; that layer's
        // "SR 41" is a different road, near Plant City), which numbers the
        // road the other way, from Naples. Its miles 1-6 are a separate
        // downtown-Miami stretch numbered out of sequence, so they're left out.
        sources: &[
            Source {
                layer: FDOT_SIGNS,
                where_clause: "ROADWAY = '87110000'",
                mile_field: "MILEPOINT",
                reversed: false,
            },
            Source {
                layer: STATE_ROAD_MARKERS,
                where_clause: "ROUTE='SR   90' AND Mile_Marker >= 7",
                mile_field: "Mile_Marker",
                reversed: true,
            },
        ],
        seed: include_str!("../datapacks/route-fl-us41-tamiami.json"),
    },
];

pub fn find_def(id: &str) -> Option<&'static PackDef> {
    PACK_DEFS.iter().find(|d| d.id == id)
}

// ----------------------------------------------------------------- download

use crate::net::FetchError;

fn timed_out() -> FetchError {
    FetchError::Other("The download timed out — check your connection and try again.".into())
}

fn map_send_error(e: reqwest::Error) -> FetchError {
    net::map_send_error(e, "The download timed out — check your connection and try again.")
}

/// One page of an ArcGIS feature-layer query.
struct Page {
    anchors: Vec<Anchor>,
    /// Features in the response (including ones without a usable mile).
    count: usize,
    /// The server has more results than this page held.
    more: bool,
}

/// Reads an ArcGIS query response: each feature is a point with a mile-marker
/// field. The server reports problems as a 200 response containing an
/// `error` object, so that's checked for explicitly.
fn parse_page(body: &str, mile_field: &str) -> Result<Page, String> {
    let v: Value = serde_json::from_str(body)
        .map_err(|_| "The data server sent something unexpected.".to_string())?;
    if let Some(err) = v.get("error") {
        let msg = err.get("message").and_then(Value::as_str).unwrap_or("request rejected");
        return Err(format!("The data server reported an error: {msg}"));
    }
    let features = v
        .get("features")
        .and_then(Value::as_array)
        .ok_or("The data server's response had no features.")?;
    let mut anchors = Vec::new();
    for f in features {
        let mile = f.pointer(&format!("/attributes/{mile_field}")).and_then(|m| {
            m.as_f64().or_else(|| m.as_str().and_then(|s| s.trim().parse::<f64>().ok()))
        });
        let (Some(mile), Some(lon), Some(lat)) = (
            mile,
            f.pointer("/geometry/x").and_then(Value::as_f64),
            f.pointer("/geometry/y").and_then(Value::as_f64),
        ) else {
            continue;
        };
        anchors.push(Anchor { mile, lat, lon });
    }
    let more = v.get("exceededTransferLimit").and_then(Value::as_bool).unwrap_or(false);
    Ok(Page { anchors, count: features.len(), more })
}

/// Downloads every marker a source's query matches, a page at a time.
async fn fetch_source(
    client: &reqwest::Client,
    layer: &str,
    where_clause: &str,
    mile_field: &str,
) -> Result<Vec<Anchor>, FetchError> {
    let mut all = Vec::new();
    let mut offset = 0usize;
    for _ in 0..MAX_PAGES {
        let resp = client
            .get(format!("{layer}/query"))
            .header("User-Agent", USER_AGENT)
            .query(&[
                ("where", where_clause),
                ("outFields", mile_field),
                ("outSR", "4326"),
                ("returnGeometry", "true"),
                ("geometryPrecision", "5"),
                ("f", "json"),
                ("resultOffset", &offset.to_string()),
                ("resultRecordCount", &PAGE_SIZE.to_string()),
            ])
            .send()
            .await
            .map_err(map_send_error)?;
        if !resp.status().is_success() {
            return Err(FetchError::Other(format!(
                "The data server returned HTTP {}.",
                resp.status()
            )));
        }
        let body = resp.text().await.map_err(map_send_error)?;
        let page = parse_page(&body, mile_field).map_err(FetchError::Other)?;
        all.extend(page.anchors);
        if !page.more || page.count == 0 {
            return Ok(all);
        }
        offset += page.count;
    }
    Ok(all)
}

/// Combines sources in priority order: later sources only contribute
/// markers in stretches the earlier ones leave uncovered (no marker within
/// `fill_gap_miles`), so a lower-priority source can never override the
/// better one where both have data.
pub fn merge_sources(sources: Vec<Vec<Anchor>>, fill_gap_miles: f64) -> Vec<Anchor> {
    let mut merged: Vec<Anchor> = Vec::new();
    for (i, source) in sources.into_iter().enumerate() {
        if i == 0 {
            merged = source;
            continue;
        }
        let existing: Vec<f64> = merged.iter().map(|a| a.mile).collect();
        for a in source {
            if !existing.iter().any(|m| (m - a.mile).abs() < fill_gap_miles) {
                merged.push(a);
            }
        }
    }
    merged
}

/// Markers from the two sources this close together are the same spot.
const ALIGN_MATCH_MILES: f64 = 0.25;
/// Fewer shared spots than this and the offset can't be trusted.
const ALIGN_MIN_MATCHES: usize = 5;
/// Shared spots should all agree on the offset to within this.
const ALIGN_MAX_SPREAD_MILES: f64 = 0.5;

/// Renumbers `other`, which counts the road in the opposite direction from
/// `primary`, onto the primary's numbering: mile becomes `offset - mile`.
/// The offset is worked out from the data each time (at every spot both
/// sources have a marker, the two miles add up to the same total), so if
/// either provider renumbers, the result follows — or the update is refused
/// when they no longer line up, rather than putting markers in wrong places.
pub fn align_reversed(primary: &[Anchor], other: Vec<Anchor>) -> Result<Vec<Anchor>, String> {
    let mut sums: Vec<f64> = other
        .iter()
        .filter_map(|o| {
            primary
                .iter()
                .map(|p| (p, haversine_miles((p.lat, p.lon), (o.lat, o.lon))))
                .filter(|(_, d)| *d <= ALIGN_MATCH_MILES)
                .min_by(|a, b| a.1.partial_cmp(&b.1).unwrap())
                .map(|(p, _)| p.mile + o.mile)
        })
        .collect();
    if sums.len() < ALIGN_MIN_MATCHES {
        return Err(format!(
            "The two data sources overlap too little to line up ({} shared markers).",
            sums.len()
        ));
    }
    sums.sort_by(|a, b| a.partial_cmp(b).unwrap());
    let offset = sums[sums.len() / 2];
    let lo = sums[sums.len() / 10];
    let hi = sums[sums.len() - 1 - sums.len() / 10];
    if hi - lo > ALIGN_MAX_SPREAD_MILES {
        return Err("The two data sources number the road inconsistently.".into());
    }
    // Tenths, like a posted milepoint.
    Ok(other
        .into_iter()
        .map(|a| Anchor { mile: ((offset - a.mile) * 10.0).round() / 10.0, ..a })
        .collect())
}

fn round5(x: f64) -> f64 {
    (x * 100_000.0).round() / 100_000.0
}

/// Builds one finished pack from the live sources. Coordinates are rounded
/// to 5 decimals (about a meter) to keep the file small.
pub async fn build_pack(def: &PackDef, total_timeout: Duration) -> Result<RoutePack, FetchError> {
    if net::working_offline() {
        return Err(FetchError::Offline);
    }
    let work = async {
        let client = net::client(CONNECT_TIMEOUT, Some(REQUEST_TIMEOUT))
            .map_err(|e| FetchError::Other(e.to_string()))?;
        let mut fetched: Vec<Vec<Anchor>> = Vec::new();
        for src in def.sources {
            let mut anchors = fetch_source(&client, src.layer, src.where_clause, src.mile_field).await?;
            if src.reversed {
                let primary = fetched.first().map(Vec::as_slice).unwrap_or(&[]);
                anchors = align_reversed(primary, anchors).map_err(FetchError::Other)?;
            }
            fetched.push(anchors);
        }
        let anchors = clean_anchors(merge_sources(fetched, 3.0));
        Ok(RoutePack {
            id: def.id.to_string(),
            name: def.name.to_string(),
            aliases: def.aliases.iter().map(|s| s.to_string()).collect(),
            source: SOURCE_CREDIT.to_string(),
            generated_at: chrono::Utc::now().to_rfc3339(),
            anchors: anchors
                .into_iter()
                .map(|a| Anchor { mile: a.mile, lat: round5(a.lat), lon: round5(a.lon) })
                .collect(),
        })
    };
    tokio::time::timeout(total_timeout, work).await.map_err(|_| timed_out())?
}

// ------------------------------------------------------------------ storage

#[derive(Serialize, Debug, Clone)]
pub struct PackInfo {
    pub id: String,
    pub name: String,
    pub description: String,
    /// "bundled" (ships with the app) or "downloaded" (refreshed by the operator).
    pub origin: String,
    pub generated_at: String,
    pub anchor_count: usize,
    pub first_mile: Option<f64>,
    pub last_mile: Option<f64>,
    pub source: String,
}

fn pack_path(dir: &Path, id: &str) -> PathBuf {
    dir.join(format!("{id}.json"))
}

/// Loads every pack, preferring a downloaded copy on disk and falling back
/// to the bundled seed (also used when a downloaded file is unreadable, so
/// a corrupt download can never take the feature away).
pub fn load_all(dir: &Path) -> Vec<(RoutePack, bool)> {
    PACK_DEFS
        .iter()
        .filter_map(|def| {
            if let Ok(text) = std::fs::read_to_string(pack_path(dir, def.id)) {
                if let Ok(p) = serde_json::from_str::<RoutePack>(&text) {
                    if validate_shape(&p).is_ok() {
                        return Some((p, true));
                    }
                }
            }
            serde_json::from_str::<RoutePack>(def.seed).ok().map(|p| (p, false))
        })
        .collect()
}

pub fn info_for(pack: &RoutePack, downloaded: bool) -> PackInfo {
    let description = find_def(&pack.id).map(|d| d.description).unwrap_or("").to_string();
    PackInfo {
        id: pack.id.clone(),
        name: pack.name.clone(),
        description,
        origin: if downloaded { "downloaded" } else { "bundled" }.to_string(),
        generated_at: pack.generated_at.clone(),
        anchor_count: pack.anchors.len(),
        first_mile: pack.anchors.first().map(|a| a.mile),
        last_mile: pack.anchors.last().map(|a| a.mile),
        source: pack.source.clone(),
    }
}

/// A pack the lookup code can safely use: enough points, strictly
/// increasing miles (interpolation assumes it), and real coordinates.
pub fn validate_shape(pack: &RoutePack) -> Result<(), String> {
    if pack.anchors.len() < 10 {
        return Err(format!("the data looks incomplete ({} points)", pack.anchors.len()));
    }
    if !pack.anchors.windows(2).all(|w| w[0].mile < w[1].mile) {
        return Err("the mile markers aren't in order".into());
    }
    if !pack.anchors.iter().all(|a| {
        a.mile.is_finite() && (-90.0..=90.0).contains(&a.lat) && (-180.0..=180.0).contains(&a.lon)
    }) {
        return Err("the data contains invalid coordinates".into());
    }
    Ok(())
}

/// How far, in miles, `new` typically is from `old` at the mile markers
/// they share. `None` when they overlap too little to say.
fn typical_disagreement(new: &RoutePack, old: &RoutePack) -> Option<f64> {
    let mut d: Vec<f64> = new
        .anchors
        .iter()
        .filter_map(|a| {
            crate::routes::locate(old, a.mile).map(|p| haversine_miles(p, (a.lat, a.lon)))
        })
        .collect();
    if d.len() < 10 {
        return None;
    }
    d.sort_by(|a, b| a.partial_cmp(b).unwrap());
    Some(d[d.len() / 2])
}

/// A new pack should agree with the one it replaces to within a few miles
/// at the same mile markers. If the provider changes how it numbers things,
/// the new data would land in the wrong places — better to say so and keep
/// what works.
const MAX_DISAGREEMENT_MILES: f64 = 4.0;

/// Refuses a download that looks broken rather than replacing good data.
pub fn validate_update(new: &RoutePack, existing: Option<&RoutePack>) -> Result<(), String> {
    validate_shape(new).map_err(|e| format!("Downloaded data rejected — {e}. Kept what you have."))?;
    if let Some(old) = existing {
        // Coverage, not point count: a source with a marker every mile is
        // as complete as one with a point every half mile.
        let span = |p: &RoutePack| p.anchors.last().map_or(0.0, |l| l.mile) - p.anchors.first().map_or(0.0, |f| f.mile);
        if span(new) < span(old) * 0.8 {
            return Err(format!(
                "Downloaded data covers much less of the road ({:.0} vs {:.0} miles). Kept what you have.",
                span(new),
                span(old)
            ));
        }
        if let Some(d) = typical_disagreement(new, old) {
            if d > MAX_DISAGREEMENT_MILES {
                return Err(format!(
                    "Downloaded data disagrees with what you have by about {d:.0} miles, so the \
                     provider may have changed its format. Kept what you have."
                ));
            }
        }
    }
    Ok(())
}

/// Installs a freshly downloaded pack: validates it, saves it to disk, and
/// swaps it into `packs`. Returns the pack's info. Nothing is touched on
/// failure.
pub fn install_update(
    dir: &Path,
    packs: &mut Vec<(RoutePack, bool)>,
    new: RoutePack,
) -> Result<PackInfo, String> {
    let existing = packs.iter().position(|(p, _)| p.id == new.id);
    validate_update(&new, existing.map(|i| &packs[i].0))?;
    save_pack(dir, &new)?;
    let info = info_for(&new, true);
    match existing {
        Some(i) => packs[i] = (new, true),
        None => packs.push((new, true)),
    }
    Ok(info)
}

/// Writes atomically (temp file then rename) so an interrupted save can't
/// leave half a file.
pub fn save_pack(dir: &Path, pack: &RoutePack) -> Result<(), String> {
    std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    let final_path = pack_path(dir, &pack.id);
    let tmp = final_path.with_extension("json.tmp");
    let json = serde_json::to_string(pack).map_err(|e| e.to_string())?;
    std::fs::write(&tmp, json).map_err(|e| e.to_string())?;
    std::fs::rename(&tmp, &final_path).map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use tokio::io::{AsyncReadExt, AsyncWriteExt};
    use tokio::net::TcpListener;

    fn pack_with(n: usize) -> RoutePack {
        RoutePack {
            id: "x".into(),
            name: "X".into(),
            aliases: vec![],
            source: "t".into(),
            generated_at: "2026-01-01T00:00:00Z".into(),
            anchors: (0..n)
                .map(|i| Anchor { mile: i as f64, lat: 25.0 + i as f64 * 0.0145, lon: -80.0 })
                .collect(),
        }
    }

    fn temp_dir(tag: &str) -> PathBuf {
        let d = std::env::temp_dir().join(format!("roc-datapacks-{tag}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&d);
        d
    }

    // ---- validation and install ----

    #[test]
    fn a_broken_download_never_replaces_good_data() {
        assert!(validate_update(&pack_with(3), None).is_err());
        assert!(validate_update(&pack_with(40), None).is_ok());
        // Covering far less of the road is refused; slightly less is fine.
        assert!(validate_update(&pack_with(20), Some(&pack_with(200))).is_err());
        assert!(validate_update(&pack_with(180), Some(&pack_with(200))).is_ok());
        // Fewer points over the same stretch (sparser source) is fine.
        let mut sparse = pack_with(100);
        for (i, a) in sparse.anchors.iter_mut().enumerate() {
            a.mile = i as f64 * 2.0;
            a.lat = 25.0 + a.mile * 0.0145;
        }
        assert!(validate_update(&sparse, Some(&pack_with(200))).is_ok());
        let mut unsorted = pack_with(40);
        unsorted.anchors.swap(5, 6);
        assert!(validate_update(&unsorted, None).is_err());
        let mut bad_coord = pack_with(40);
        bad_coord.anchors[3].lat = 123.0;
        assert!(validate_update(&bad_coord, None).is_err());
    }

    #[test]
    fn data_that_lands_in_the_wrong_place_is_rejected() {
        // Same miles, but every point ~70 miles north: the provider changed
        // its numbering or format. Refuse, keep the good copy.
        let old = pack_with(60);
        let mut shifted = pack_with(60);
        for a in &mut shifted.anchors {
            a.lat += 1.0;
        }
        let err = validate_update(&shifted, Some(&old)).unwrap_err();
        assert!(err.contains("disagrees"), "{err}");
        // A small, honest refinement is fine.
        let mut nudged = pack_with(60);
        for a in &mut nudged.anchors {
            a.lat += 0.004;
        }
        assert!(validate_update(&nudged, Some(&old)).is_ok());
    }

    #[test]
    fn install_update_swaps_in_new_data_and_persists_it() {
        let dir = temp_dir("install");
        let mut packs = load_all(&dir);
        let mut newer = packs[0].0.clone();
        newer.generated_at = "2099-01-01T00:00:00Z".into();
        newer.anchors.pop();
        let info = install_update(&dir, &mut packs, newer).unwrap();
        assert_eq!(info.origin, "downloaded");
        assert_eq!(packs[0].0.generated_at, "2099-01-01T00:00:00Z");
        assert!(packs[0].1);
        assert_eq!(load_all(&dir)[0].0.generated_at, "2099-01-01T00:00:00Z", "survives a restart");
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn a_rejected_install_touches_nothing() {
        let dir = temp_dir("reject");
        let mut packs = load_all(&dir);
        let before = packs[0].0.generated_at.clone();
        let mut broken = packs[0].0.clone();
        broken.generated_at = "2099-01-01T00:00:00Z".into();
        broken.anchors.truncate(3);
        assert!(install_update(&dir, &mut packs, broken).is_err());
        assert_eq!(packs[0].0.generated_at, before);
        assert!(!pack_path(&dir, &packs[0].0.id).exists(), "nothing written");
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn saved_packs_beat_the_bundled_copy_and_corrupt_files_fall_back() {
        let dir = temp_dir("roundtrip");
        let mut p = load_all(&dir)[0].0.clone();
        assert!(!load_all(&dir)[0].1, "nothing downloaded yet");
        p.anchors.truncate(20);
        save_pack(&dir, &p).unwrap();
        let loaded = load_all(&dir);
        assert!(loaded[0].1);
        assert_eq!(loaded[0].0.anchors.len(), 20);
        std::fs::write(pack_path(&dir, &p.id), "not json").unwrap();
        assert!(!load_all(&dir)[0].1, "falls back to the bundled copy");
        let _ = std::fs::remove_dir_all(&dir);
    }

    // ---- reading the provider's responses ----

    fn arcgis(features: &[(&str, f64, f64)], more: bool) -> String {
        let f: Vec<String> = features
            .iter()
            .map(|(m, x, y)| format!(r#"{{"attributes":{{"MILEPOINT":"{m}"}},"geometry":{{"x":{x},"y":{y}}}}}"#))
            .collect();
        format!(r#"{{"features":[{}],"exceededTransferLimit":{more}}}"#, f.join(","))
    }

    #[test]
    fn parses_arcgis_responses() {
        let body = arcgis(&[("265.5", -82.35, 28.06), ("017.0", -82.5, 28.1), ("junk", -82.0, 28.0)], false);
        let page = parse_page(&body, "MILEPOINT").unwrap();
        assert_eq!(page.count, 3);
        assert_eq!(page.anchors.len(), 2, "unreadable mile skipped");
        assert_eq!(page.anchors[0], Anchor { mile: 265.5, lat: 28.06, lon: -82.35 });
        assert_eq!(page.anchors[1].mile, 17.0);
        assert!(!page.more);
        // Numeric mile fields work too.
        let numeric = r#"{"features":[{"attributes":{"Mile_Marker":42},"geometry":{"x":-80.1,"y":26.1}}]}"#;
        assert_eq!(parse_page(numeric, "Mile_Marker").unwrap().anchors[0].mile, 42.0);
    }

    #[test]
    fn provider_errors_and_junk_are_reported_not_ignored() {
        let err = parse_page(r#"{"error":{"code":400,"message":"Invalid query"}}"#, "MILEPOINT").err().unwrap();
        assert!(err.contains("Invalid query"));
        assert!(parse_page("<html>maintenance</html>", "MILEPOINT").is_err());
        assert!(parse_page(r#"{"nothing":1}"#, "MILEPOINT").is_err());
    }

    #[test]
    fn later_sources_only_fill_gaps() {
        let a = |m: f64, lat: f64| Anchor { mile: m, lat, lon: -80.0 };
        let primary = vec![a(60.0, 1.0), a(61.0, 1.0), a(62.0, 1.0)];
        let filler = vec![a(1.0, 9.0), a(30.0, 9.0), a(60.5, 9.0), a(61.5, 9.0), a(100.0, 9.0)];
        let merged = merge_sources(vec![primary, filler], 3.0);
        let miles: Vec<f64> = merged.iter().map(|x| x.mile).collect();
        assert!(miles.contains(&1.0) && miles.contains(&30.0) && miles.contains(&100.0));
        assert!(!miles.contains(&60.5) && !miles.contains(&61.5), "no override where primary has data");
        assert!(merged.iter().filter(|x| x.mile == 60.0).all(|x| x.lat == 1.0));
    }

    /// A straight east-west road: one marker a mile, `start..=end`, where
    /// mile `m` sits `m` miles east (or west, when `west`) of the origin.
    fn road(start: i32, end: i32, west: bool, reading: impl Fn(f64) -> f64) -> Vec<Anchor> {
        (start..=end)
            .map(|i| {
                let east = if west { -(i as f64) } else { i as f64 };
                Anchor { mile: reading(i as f64), lat: 25.76, lon: -80.5 + east * 0.016 }
            })
            .collect()
    }

    #[test]
    fn reversed_source_is_renumbered_onto_the_primary() {
        // Signs count west from 19 to 43; the other source counts the same
        // spots the opposite way (sign 19 = its 95.2).
        let signs = road(19, 43, true, |m| m);
        let other = road(3, 100, true, |m| 114.2 - m);
        let aligned = align_reversed(&signs, other).unwrap();
        for a in &aligned {
            let at_sign = signs.iter().find(|s| (s.lon - a.lon).abs() < 1e-9);
            if let Some(s) = at_sign {
                assert!((s.mile - a.mile).abs() < 0.051, "{} vs {}", s.mile, a.mile);
            }
        }
        // Beyond the signs it keeps counting the same way, in tenths.
        assert!(aligned.iter().any(|a| a.mile == 100.0));
        assert!(aligned.iter().all(|a| (a.mile * 10.0 - (a.mile * 10.0).round()).abs() < 1e-9));
    }

    #[test]
    fn reversed_source_is_refused_when_it_cant_be_lined_up() {
        let signs = road(19, 43, true, |m| m);
        // Too little overlap: only 3 shared spots.
        let short = road(41, 43, true, |m| 114.0 - m);
        assert!(align_reversed(&signs, short).unwrap_err().contains("overlap too little"));
        // Same spots, but the numbering isn't a consistent flip.
        let skewed = road(19, 43, true, |m| 114.0 - m * 1.1);
        assert!(align_reversed(&signs, skewed).unwrap_err().contains("inconsistently"));
        // No primary at all.
        assert!(align_reversed(&[], road(3, 100, true, |m| m)).is_err());
    }

    // ---- the download path, against a throwaway local server ----

    /// A tiny HTTP server. The handler gets the request path+query and
    /// returns `Some((status line, body))`, or `None` to accept the
    /// connection and never answer (a hung server).
    async fn serve<F>(handler: F) -> String
    where
        F: Fn(&str) -> Option<(&'static str, String)> + Send + Sync + 'static,
    {
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr = listener.local_addr().unwrap();
        let handler = std::sync::Arc::new(handler);
        tokio::spawn(async move {
            loop {
                let Ok((mut sock, _)) = listener.accept().await else { return };
                let handler = handler.clone();
                tokio::spawn(async move {
                    let mut buf = [0u8; 4096];
                    let n = sock.read(&mut buf).await.unwrap_or(0);
                    let request = String::from_utf8_lossy(&buf[..n]).to_string();
                    let path = request.lines().next().unwrap_or("").split(' ').nth(1).unwrap_or("").to_string();
                    match handler(&path) {
                        Some((status, body)) => {
                            let msg = format!(
                                "HTTP/1.1 {status}\r\nContent-Length: {}\r\nContent-Type: application/json\r\nConnection: close\r\n\r\n{body}",
                                body.len()
                            );
                            let _ = sock.write_all(msg.as_bytes()).await;
                        }
                        None => tokio::time::sleep(Duration::from_secs(60)).await,
                    }
                });
            }
        });
        format!("http://{addr}/layer")
    }

    fn run<T>(f: impl std::future::Future<Output = T>) -> T {
        tauri::async_runtime::block_on(f)
    }

    fn fetch(layer: &str) -> Result<Vec<Anchor>, String> {
        run(async {
            let client = reqwest::Client::builder()
                .connect_timeout(Duration::from_secs(2))
                .timeout(Duration::from_secs(1))
                .build()
                .unwrap();
            fetch_source(&client, layer, "1=1", "MILEPOINT").await
        })
        .map_err(|e| match e {
            FetchError::Offline => "offline".to_string(),
            FetchError::Other(s) => s,
        })
    }

    #[test]
    fn downloads_all_pages() {
        // 1000 markers on page one (more available), 5 on page two.
        let layer = run(serve(|path| {
            let page_two = path.contains("resultOffset=1000");
            let body = if page_two {
                arcgis(&(1000..1005).map(|i| (Box::leak(format!("{i}").into_boxed_str()) as &str, -80.0, 25.0)).collect::<Vec<_>>(), false)
            } else {
                arcgis(&(0..1000).map(|i| (Box::leak(format!("{i}").into_boxed_str()) as &str, -80.0, 25.0)).collect::<Vec<_>>(), true)
            };
            Some(("200 OK", body))
        }));
        assert_eq!(fetch(&layer).unwrap().len(), 1005);
    }

    #[test]
    fn a_server_that_never_answers_times_out_promptly() {
        let layer = run(serve(|_| None));
        let started = std::time::Instant::now();
        let err = fetch(&layer).unwrap_err();
        assert!(err.contains("timed out"), "{err}");
        assert!(started.elapsed() < Duration::from_secs(5), "took {:?}", started.elapsed());
    }

    #[test]
    fn server_trouble_is_explained() {
        let l = run(serve(|_| Some(("503 Service Unavailable", "busy".into()))));
        assert!(fetch(&l).unwrap_err().contains("HTTP 503"));
        let l = run(serve(|_| Some(("200 OK", r#"{"error":{"code":500,"message":"Service is down"}}"#.into()))));
        assert!(fetch(&l).unwrap_err().contains("Service is down"));
        let l = run(serve(|_| Some(("200 OK", "<html>captive portal</html>".into()))));
        assert!(fetch(&l).unwrap_err().contains("unexpected"));
    }

    #[test]
    fn nothing_listening_reads_as_offline() {
        let layer = run(async {
            let l = TcpListener::bind("127.0.0.1:0").await.unwrap();
            let url = format!("http://{}/layer", l.local_addr().unwrap());
            drop(l);
            url
        });
        assert_eq!(fetch(&layer).unwrap_err(), "offline");
    }

    // ---- the bundled packs ----

    #[test]
    fn every_bundled_pack_parses_is_small_and_has_usable_coverage() {
        let mut total = 0;
        for def in PACK_DEFS {
            let p: RoutePack = serde_json::from_str(def.seed).unwrap_or_else(|e| panic!("{}: {e}", def.id));
            assert_eq!(p.id, def.id);
            validate_shape(&p).unwrap_or_else(|e| panic!("{}: {e}", def.id));
            assert!(p.anchors.len() >= 30, "{} has {} anchors", def.id, p.anchors.len());
            assert!(def.seed.len() < 60_000, "{} is {} bytes — keep packs small", def.id, def.seed.len());
            total += def.seed.len();
        }
        assert!(total < 150_000, "all packs together are {total} bytes");
    }

    #[test]
    fn spoken_references_land_in_the_right_places_using_the_bundled_packs() {
        let packs: Vec<RoutePack> = load_all(Path::new("/nonexistent")).into_iter().map(|(p, _)| p).collect();
        let near = |text: &str, lat: f64, lon: f64, within_miles: f64| {
            let hit = crate::routes::resolve(&packs, text).unwrap_or_else(|| panic!("no hit for {text:?}"));
            let d = haversine_miles((hit.lat, hit.lon), (lat, lon));
            assert!(d <= within_miles, "{text:?} resolved {d:.1} mi from where it should be ({hit:?})");
        };
        // Key Largo, Marathon, Key West on US-1.
        near("mile marker 100 on US 1", 25.09, -80.44, 2.0);
        near("MM 50 on the Overseas Highway", 24.72, -81.06, 2.5);
        near("mile marker 4 US1", 24.57, -81.75, 1.0);
        // Turnpike exit 259 is SR 50 in Ocoee; exit 1 is Florida City.
        near("Mile marker 259 on turnpike", 28.476, -81.447, 1.5);
        near("MM 1 turnpike", 25.456, -80.472, 1.0);
        // I-95 exit 18 is Hallandale Beach Blvd.
        near("I-95 exit 18", 25.98, -80.166, 1.0);
        near("mile marker 18 on 95", 25.98, -80.166, 1.0);
        // US-41 (Tamiami Trail), as posted, counting west from Miami: sign
        // 23 is Coopertown and 43 the Miami-Dade line (from the sign
        // inventory); beyond it, renumbered from SR 90 — the Oasis Visitor
        // Center is posted MM 55, and the Naples end is about 107.
        near("mile marker 23 on US 41", 25.761, -80.5604, 0.2);
        near("MM 43 Tamiami Trail", 25.7972, -80.8646, 0.2);
        near("mm 55 state road 41", 25.8566, -81.0338, 0.5);
        near("mile marker 72 sr41", 25.90, -81.31, 1.0);
        near("MM 107 us41", 26.139, -81.786, 1.0);
    }

    // ---- against the real provider (needs internet; run by hand) ----

    /// Not a real test: rebuilds the bundled packs from the live sources —
    /// the exact code path the app's Update button runs — and writes them to
    /// `src-tauri/datapacks/`. Run with
    /// `cargo test generate_bundled_packs -- --ignored --nocapture` before a
    /// release so new installs start with current data.
    #[test]
    #[ignore]
    fn generate_bundled_packs() {
        let dir = Path::new(env!("CARGO_MANIFEST_DIR")).join("datapacks");
        for def in PACK_DEFS {
            let pack = match run(build_pack(def, UPDATE_TIMEOUT)) {
                Ok(p) => p,
                Err(FetchError::Offline) => panic!("offline"),
                Err(FetchError::Other(e)) => panic!("{}: {e}", def.id),
            };
            validate_shape(&pack).unwrap_or_else(|e| panic!("{}: {e}", def.id));
            let json = serde_json::to_string(&pack).unwrap();
            println!(
                "{}: {} points, mile {:?}..{:?}, {} bytes",
                def.id,
                pack.anchors.len(),
                pack.anchors.first().map(|a| a.mile),
                pack.anchors.last().map(|a| a.mile),
                json.len()
            );
            std::fs::write(dir.join(format!("{}.json", def.id)), json).unwrap();
        }
    }

    /// Not a real test: the full Update flow against the live provider —
    /// download, build, validate against the installed copy, save — into a
    /// throwaway folder, timing each pack.
    #[test]
    #[ignore]
    fn live_update_flow() {
        let dir = temp_dir("live");
        let mut packs = load_all(&dir);
        for def in PACK_DEFS {
            let started = std::time::Instant::now();
            let pack = match run(build_pack(def, UPDATE_TIMEOUT)) {
                Ok(p) => p,
                Err(FetchError::Offline) => panic!("offline"),
                Err(FetchError::Other(e)) => panic!("{}: {e}", def.id),
            };
            let info = install_update(&dir, &mut packs, pack).unwrap_or_else(|e| panic!("{}: {e}", def.id));
            println!("{}: {} points, {:?}, took {:.1}s", def.id, info.anchor_count, (info.first_mile, info.last_mile), started.elapsed().as_secs_f32());
        }
        assert!(load_all(&dir).iter().all(|(_, downloaded)| *downloaded));
        let _ = std::fs::remove_dir_all(&dir);
    }
}
