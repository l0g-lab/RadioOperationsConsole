//! Offline "mile marker on a road" lookup: turns text like "mile marker 182
//! on the turnpike" into coordinates using small per-road data packs (see
//! `datapacks.rs` for how those are stored and updated). Everything here is
//! pure computation on already-loaded data — no network, no disk.

use serde::{Deserialize, Serialize};

/// One known point on a road: this mile marker is exactly here. Stored in
/// pack files as a bare `[mile, lat, lon]` triple — half the size of a
/// labeled object, which adds up over a few hundred points per road.
#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
#[serde(from = "(f64, f64, f64)", into = "(f64, f64, f64)")]
pub struct Anchor {
    pub mile: f64,
    pub lat: f64,
    pub lon: f64,
}

impl From<(f64, f64, f64)> for Anchor {
    fn from((mile, lat, lon): (f64, f64, f64)) -> Self {
        Anchor { mile, lat, lon }
    }
}

impl From<Anchor> for (f64, f64, f64) {
    fn from(a: Anchor) -> Self {
        (a.mile, a.lat, a.lon)
    }
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct RoutePack {
    pub id: String,
    /// Display name, e.g. "Florida's Turnpike".
    pub name: String,
    /// Ways an operator might refer to this road ("turnpike", "I-95", "95").
    pub aliases: Vec<String>,
    pub source: String,
    pub generated_at: String,
    /// Sorted by mile, one per mile, already cleaned of outliers.
    pub anchors: Vec<Anchor>,
}

#[derive(Serialize, Debug, Clone, PartialEq)]
pub struct MileMarkerHit {
    pub lat: f64,
    pub lon: f64,
    /// Human-readable, e.g. "Florida's Turnpike MM 182".
    pub label: String,
    pub route_id: String,
    pub mile: f64,
}

pub fn haversine_miles(a: (f64, f64), b: (f64, f64)) -> f64 {
    const R_MILES: f64 = 3958.7613;
    let (lat1, lon1) = (a.0.to_radians(), a.1.to_radians());
    let (lat2, lon2) = (b.0.to_radians(), b.1.to_radians());
    let h = ((lat2 - lat1) / 2.0).sin().powi(2)
        + lat1.cos() * lat2.cos() * ((lon2 - lon1) / 2.0).sin().powi(2);
    2.0 * R_MILES * h.sqrt().asin()
}

/// How far apart two anchors may plausibly be for a given mile gap: roads
/// wander, so allow well over the straight-line distance, plus slack for
/// ramps sitting off the mainline.
fn plausible_gap_miles(mile_gap: f64) -> f64 {
    mile_gap.abs() * 1.7 + 2.0
}

/// Turns raw candidate points (possibly several per mile — ramps on both
/// sides of the road, or stray points from elsewhere) into a clean, sorted,
/// one-per-mile anchor list, dropping points that are clearly not on this
/// road (they don't fit with their neighbors).
pub fn clean_anchors(mut raw: Vec<Anchor>) -> Vec<Anchor> {
    raw.retain(|a| a.mile.is_finite() && a.lat.is_finite() && a.lon.is_finite());
    raw.sort_by(|a, b| a.mile.partial_cmp(&b.mile).unwrap());

    // One anchor per mile: average candidates that are close together; if a
    // mile has candidates far apart, keep the biggest cluster.
    let mut merged: Vec<Anchor> = Vec::new();
    let mut i = 0;
    while i < raw.len() {
        let mut j = i;
        while j < raw.len() && (raw[j].mile - raw[i].mile).abs() < 0.005 {
            j += 1;
        }
        let group = &raw[i..j];
        let mut best: Vec<&Anchor> = Vec::new();
        for seed in group {
            let cluster: Vec<&Anchor> = group
                .iter()
                .filter(|o| haversine_miles((seed.lat, seed.lon), (o.lat, o.lon)) < 1.5)
                .collect();
            if cluster.len() > best.len() {
                best = cluster;
            }
        }
        let n = best.len() as f64;
        merged.push(Anchor {
            mile: group[0].mile,
            lat: best.iter().map(|a| a.lat).sum::<f64>() / n,
            lon: best.iter().map(|a| a.lon).sum::<f64>() / n,
        });
        i = j;
    }

    // Drop anchors that don't fit their neighbors, until stable.
    loop {
        let mut removed = false;
        let mut k = 0;
        while k < merged.len() {
            let fits = |x: &Anchor, y: &Anchor| {
                haversine_miles((x.lat, x.lon), (y.lat, y.lon))
                    <= plausible_gap_miles(x.mile - y.mile)
            };
            let prev_ok = k == 0 || fits(&merged[k - 1], &merged[k]);
            let next_ok = k + 1 >= merged.len() || fits(&merged[k], &merged[k + 1]);
            let bad = if k > 0 && k + 1 < merged.len() {
                !prev_ok && !next_ok
            } else if k == 0 && merged.len() > 2 {
                !next_ok && fits(&merged[1], &merged[2])
            } else if k + 1 == merged.len() && merged.len() > 2 {
                !prev_ok && fits(&merged[k - 2], &merged[k - 1])
            } else {
                false
            };
            if bad {
                merged.remove(k);
                removed = true;
            } else {
                k += 1;
            }
        }
        if !removed {
            break;
        }
    }
    merged
}

/// Position of a mile marker by interpolating between the two nearest known
/// anchors. `None` if the mile is outside what this pack covers (never
/// extrapolates — a guess past the end of the known data would be
/// confidently wrong).
pub fn locate(pack: &RoutePack, mile: f64) -> Option<(f64, f64)> {
    let a = &pack.anchors;
    if a.len() < 2 || !mile.is_finite() || mile < a[0].mile || mile > a[a.len() - 1].mile {
        return None;
    }
    let idx = a.partition_point(|p| p.mile <= mile);
    if idx == 0 {
        return Some((a[0].lat, a[0].lon));
    }
    if idx >= a.len() {
        let last = &a[a.len() - 1];
        return Some((last.lat, last.lon));
    }
    let (lo, hi) = (&a[idx - 1], &a[idx]);
    let span = hi.mile - lo.mile;
    let t = if span.abs() < 1e-9 {
        0.0
    } else {
        (mile - lo.mile) / span
    };
    Some((
        lo.lat + (hi.lat - lo.lat) * t,
        lo.lon + (hi.lon - lo.lon) * t,
    ))
}

const STOPWORDS: &[&str] = &[
    "on",
    "of",
    "at",
    "the",
    "hwy",
    "highway",
    "route",
    "rt",
    "road",
    "interstate",
    "northbound",
    "southbound",
    "eastbound",
    "westbound",
    "nb",
    "sb",
    "eb",
    "wb",
    "near",
    "in",
    "along",
    "off",
    "florida",
    "florida's",
    "fl",
    "state",
    "s",
];

/// Lowercases and splits into alphanumeric tokens, also splitting where
/// letters meet digits ("i95" -> "i", "95"; "mm182" -> "mm", "182") so
/// however an operator says or types it, the same tokens come out.
fn tokenize(text: &str) -> Vec<String> {
    let mut tokens = Vec::new();
    let mut cur = String::new();
    let mut prev_digit: Option<bool> = None;
    let flush = |cur: &mut String, tokens: &mut Vec<String>| {
        let t = cur.trim_matches('.').to_string();
        if !t.is_empty() {
            tokens.push(t);
        }
        cur.clear();
    };
    for ch in text.to_lowercase().chars() {
        if ch.is_ascii_alphanumeric() {
            let is_digit = ch.is_ascii_digit();
            if let Some(pd) = prev_digit {
                if pd != is_digit && !cur.is_empty() && !cur.ends_with('.') {
                    flush(&mut cur, &mut tokens);
                }
            }
            cur.push(ch);
            prev_digit = Some(is_digit);
        } else if ch == '.' && prev_digit == Some(true) && !cur.is_empty() {
            cur.push('.'); // decimal point inside a number
        } else if ch == '\'' || ch == '\u{2019}' {
            // Apostrophes vanish ("turnpike's" -> "turnpikes" is harmless,
            // but "florida's" must not split into a stray "s" token).
            continue;
        } else {
            flush(&mut cur, &mut tokens);
            prev_digit = None;
        }
    }
    flush(&mut cur, &mut tokens);
    tokens
}

fn strip_stopwords(tokens: Vec<String>) -> Vec<String> {
    tokens
        .into_iter()
        .filter(|t| !STOPWORDS.contains(&t.as_str()))
        .collect()
}

#[derive(Debug, PartialEq, Clone, Copy)]
pub enum RefKind {
    MileMarker,
    Exit,
}

/// Pulls "mile marker N" / "MM N" / "milepost N" / "exit N" out of the text
/// and returns the number, the kind, and whatever's left over (the road).
fn extract_marker(tokens: &[String]) -> Option<(f64, RefKind, Vec<String>)> {
    const FILLER: &[&str] = &["marker", "markers", "post", "number", "no", "num"];
    for (i, t) in tokens.iter().enumerate() {
        let kind = match t.as_str() {
            "mm" | "mp" | "milepost" | "milemarker" | "mile" | "miles" => RefKind::MileMarker,
            "exit" => RefKind::Exit,
            _ => continue,
        };
        let mut j = i + 1;
        while j < tokens.len() && FILLER.contains(&tokens[j].as_str()) {
            j += 1;
        }
        if let Some(num) = tokens.get(j).and_then(|s| s.parse::<f64>().ok()) {
            let mut rest: Vec<String> = tokens[..i].to_vec();
            rest.extend_from_slice(&tokens[j + 1..]);
            return Some((num, kind, rest));
        }
    }
    None
}

fn contains_sequence(haystack: &[String], needle: &[String]) -> bool {
    !needle.is_empty()
        && haystack.len() >= needle.len()
        && haystack.windows(needle.len()).any(|w| w == needle)
}

/// Which pack does this leftover text refer to? The longest matching alias
/// wins; a bare number alias ("95") only counts when it's all that's left,
/// so a stray number elsewhere in the sentence can't pick a road.
fn match_pack<'a>(packs: &'a [RoutePack], rest: &[String]) -> Option<&'a RoutePack> {
    let mut best: Option<(&RoutePack, usize)> = None;
    for pack in packs {
        for alias in &pack.aliases {
            let alias_tokens = strip_stopwords(tokenize(alias));
            if alias_tokens.is_empty() {
                continue;
            }
            let bare_number = alias_tokens.len() == 1 && alias_tokens[0].parse::<f64>().is_ok();
            let matched = if bare_number {
                rest == alias_tokens.as_slice()
            } else {
                contains_sequence(rest, &alias_tokens)
            };
            if matched && best.is_none_or(|(_, len)| alias_tokens.len() > len) {
                best = Some((pack, alias_tokens.len()));
            }
        }
    }
    best.map(|(p, _)| p)
}

fn format_mile(mile: f64) -> String {
    if (mile - mile.round()).abs() < 1e-9 {
        format!("{}", mile.round() as i64)
    } else {
        format!("{mile}")
    }
}

/// Resolves a spoken/typed reference like "mile marker 182 on turnpike" or
/// "I-95 exit 12" against the loaded packs. `None` when it isn't a
/// recognizable mile-marker reference, names no road we have data for, or
/// the mile is outside that road's covered range.
pub fn resolve(packs: &[RoutePack], text: &str) -> Option<MileMarkerHit> {
    let tokens = tokenize(text);
    let (mile, kind, rest) = extract_marker(&tokens)?;
    let rest = strip_stopwords(rest);
    let pack = match_pack(packs, &rest)?;
    let (lat, lon) = locate(pack, mile)?;
    let label = match kind {
        RefKind::MileMarker => format!("{} MM {}", pack.name, format_mile(mile)),
        RefKind::Exit => format!("{} Exit {}", pack.name, format_mile(mile)),
    };
    Some(MileMarkerHit {
        lat,
        lon,
        label,
        route_id: pack.id.clone(),
        mile,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    /// A straight north-south road, one anchor per mile starting at 25.0N
    /// (1 mile of latitude ~ 0.014472 degrees).
    fn straight_pack(id: &str, name: &str, aliases: &[&str], from: i32, to: i32) -> RoutePack {
        RoutePack {
            id: id.into(),
            name: name.into(),
            aliases: aliases.iter().map(|s| s.to_string()).collect(),
            source: "test".into(),
            generated_at: "now".into(),
            anchors: (from..=to)
                .map(|m| Anchor {
                    mile: m as f64,
                    lat: 25.0 + m as f64 * 0.014472,
                    lon: -80.0,
                })
                .collect(),
        }
    }

    fn packs() -> Vec<RoutePack> {
        vec![
            straight_pack(
                "turnpike",
                "Florida's Turnpike",
                &["turnpike", "sr 91", "heft"],
                1,
                300,
            ),
            straight_pack(
                "i95",
                "I-95",
                &["i-95", "i 95", "interstate 95", "95"],
                2,
                380,
            ),
            straight_pack(
                "us1",
                "US-1",
                &["us-1", "us 1", "route 1", "1", "overseas highway"],
                0,
                127,
            ),
        ]
    }

    #[test]
    fn interpolates_between_anchors() {
        let p = &packs()[0];
        let (lat, lon) = locate(p, 182.5).unwrap();
        assert!((lat - (25.0 + 182.5 * 0.014472)).abs() < 1e-6);
        assert_eq!(lon, -80.0);
    }

    #[test]
    fn exact_anchor_returns_that_anchor() {
        let (lat, _) = locate(&packs()[0], 50.0).unwrap();
        assert!((lat - (25.0 + 50.0 * 0.014472)).abs() < 1e-9);
    }

    #[test]
    fn outside_covered_range_is_none_not_extrapolated() {
        let p = &packs()[0];
        assert!(locate(p, 0.0).is_none());
        assert!(locate(p, 301.0).is_none());
        assert!(locate(p, -5.0).is_none());
        assert!(locate(p, f64::NAN).is_none());
    }

    #[test]
    fn parses_the_example_phrase() {
        let hit = resolve(&packs(), "Mile marker 182 on turnpike").unwrap();
        assert_eq!(hit.route_id, "turnpike");
        assert_eq!(hit.mile, 182.0);
        assert_eq!(hit.label, "Florida's Turnpike MM 182");
    }

    #[test]
    fn handles_many_ways_of_saying_it() {
        let cases = [
            ("MM 182 turnpike", "turnpike", 182.0),
            ("mm182 turnpike", "turnpike", 182.0),
            ("turnpike mile marker 182", "turnpike", 182.0),
            ("I-95 mile marker 47", "i95", 47.0),
            ("mile 47 on I95", "i95", 47.0),
            ("milepost 47 interstate 95 northbound", "i95", 47.0),
            ("mile marker 47 on 95", "i95", 47.0),
            ("MM 100 on US 1", "us1", 100.0),
            ("mile marker 100 US1", "us1", 100.0),
            ("mile marker 100 on the Overseas Highway", "us1", 100.0),
            ("Mile Marker 12.5 on the Turnpike", "turnpike", 12.5),
            (
                "mile marker 182 on Florida's Turnpike southbound",
                "turnpike",
                182.0,
            ),
        ];
        for (text, route, mile) in cases {
            let hit = resolve(&packs(), text).unwrap_or_else(|| panic!("no hit for {text:?}"));
            assert_eq!((hit.route_id.as_str(), hit.mile), (route, mile), "{text:?}");
        }
    }

    #[test]
    fn exit_numbers_resolve_too() {
        let hit = resolve(&packs(), "I-95 exit 12").unwrap();
        assert_eq!(hit.label, "I-95 Exit 12");
    }

    #[test]
    fn a_stray_number_does_not_pick_a_road() {
        // "95" alone must not turn an unrelated sentence into I-95.
        assert!(resolve(&packs(), "mile marker 47 near the 95 gas station").is_none());
    }

    #[test]
    fn unknown_road_or_no_marker_or_out_of_range_is_none() {
        assert!(resolve(&packs(), "mile marker 5 on I-4").is_none());
        assert!(resolve(&packs(), "turnpike").is_none());
        assert!(resolve(&packs(), "182 turnpike").is_none());
        assert!(resolve(&packs(), "mile marker 999 on turnpike").is_none());
        assert!(resolve(&packs(), "").is_none());
    }

    #[test]
    fn longest_alias_wins_between_roads() {
        let mut ps = packs();
        ps.push(straight_pack("i595", "I-595", &["i-595", "595"], 0, 10));
        let hit = resolve(&ps, "mile marker 5 on I-595").unwrap();
        assert_eq!(hit.route_id, "i595");
    }

    #[test]
    fn cleaning_drops_a_stray_point_from_another_state() {
        let mut raw: Vec<Anchor> = (1..=20)
            .map(|m| Anchor {
                mile: m as f64,
                lat: 25.0 + m as f64 * 0.0145,
                lon: -80.0,
            })
            .collect();
        // Mile 10 also has a candidate 400 miles away (a different road with
        // the same exit number).
        raw.push(Anchor {
            mile: 10.0,
            lat: 30.6,
            lon: -83.2,
        });
        let clean = clean_anchors(raw);
        assert_eq!(clean.len(), 20);
        let ten = clean.iter().find(|a| a.mile == 10.0).unwrap();
        assert!(
            (ten.lat - (25.0 + 10.0 * 0.0145)).abs() < 1e-6,
            "kept the on-road cluster"
        );
    }

    #[test]
    fn cleaning_averages_ramps_and_sorts() {
        let raw = vec![
            Anchor {
                mile: 3.0,
                lat: 25.1,
                lon: -80.0,
            },
            Anchor {
                mile: 1.0,
                lat: 25.0,
                lon: -80.001,
            },
            Anchor {
                mile: 1.0,
                lat: 25.0,
                lon: -79.999,
            },
            Anchor {
                mile: 2.0,
                lat: 25.05,
                lon: -80.0,
            },
        ];
        let clean = clean_anchors(raw);
        assert_eq!(
            clean.iter().map(|a| a.mile).collect::<Vec<_>>(),
            vec![1.0, 2.0, 3.0]
        );
        assert!((clean[0].lon - -80.0).abs() < 1e-9);
    }

    #[test]
    fn cleaning_drops_a_bad_first_anchor() {
        let mut raw: Vec<Anchor> = (2..=12)
            .map(|m| Anchor {
                mile: m as f64,
                lat: 25.0 + m as f64 * 0.0145,
                lon: -80.0,
            })
            .collect();
        raw.push(Anchor {
            mile: 1.0,
            lat: 30.0,
            lon: -83.0,
        });
        let clean = clean_anchors(raw);
        assert_eq!(clean[0].mile, 2.0);
    }
}
