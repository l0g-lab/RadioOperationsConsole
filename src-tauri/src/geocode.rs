//! Placing typed locations on the map (docs/features/location-resolution.md,
//! LOCRES-050–LOCRES-056): street addresses, towns, and cross streets such as
//! "sw 152st & sw 137ave miami fl".
//!
//! Typed shorthand is first put into the form map data uses ("Southwest 152nd
//! Street"), since a search for "152 st" finds the wrong street. Cross
//! streets are placed by fetching both streets' shapes and working out where
//! they cross on this computer; only if that finds nothing is Overpass asked,
//! which does the work on its server and is often slow. Searches stay near
//! the net (its repeater, else net control) unless a town is typed.
//!
//! Everything here is kind to the free services it uses: at most one
//! Nominatim request a second, results remembered (found places for good,
//! misses for a day), and nothing asked while typing. The name matching and
//! crossing math don't need the network, so downloaded streets can use them
//! later (GitHub issue #6).

use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;
use std::path::Path;
use std::sync::Mutex;
use std::time::{Duration, Instant};

// ------------------------------------------------------------ names

/// "sw" → "Southwest", and the full word to itself.
fn directional(t: &str) -> Option<&'static str> {
    Some(match t {
        "n" | "north" => "North",
        "s" | "south" => "South",
        "e" | "east" => "East",
        "w" | "west" => "West",
        "ne" | "northeast" => "Northeast",
        "nw" | "northwest" => "Northwest",
        "se" | "southeast" => "Southeast",
        "sw" | "southwest" => "Southwest",
        _ => return None,
    })
}

/// A street type, abbreviated or not, as map data spells it out.
fn street_type(t: &str) -> Option<&'static str> {
    Some(match t {
        "st" | "str" | "street" => "Street",
        "ave" | "av" | "avn" | "avenue" => "Avenue",
        "rd" | "road" => "Road",
        "blvd" | "boulevard" => "Boulevard",
        "dr" | "drive" => "Drive",
        "ct" | "court" => "Court",
        "ter" | "terr" | "terrace" => "Terrace",
        "pl" | "place" => "Place",
        "ln" | "lane" => "Lane",
        "hwy" | "highway" => "Highway",
        "pkwy" | "pky" | "parkway" => "Parkway",
        "cir" | "circle" => "Circle",
        "trl" | "tr" | "trail" => "Trail",
        "cswy" | "causeway" => "Causeway",
        "expy" | "expressway" => "Expressway",
        "tpke" | "turnpike" => "Turnpike",
        "way" => "Way",
        "sq" | "square" => "Square",
        "aly" | "alley" => "Alley",
        "xing" | "crossing" => "Crossing",
        "path" => "Path",
        "run" => "Run",
        "loop" => "Loop",
        "cv" | "cove" => "Cove",
        "pt" | "point" => "Point",
        _ => return None,
    })
}

/// The ordinal of a number: 1 → "1st", 12 → "12th", 152 → "152nd".
fn ordinal(n: u32) -> String {
    let suffix = match (n % 10, n % 100) {
        (_, 11..=13) => "th",
        (1, _) => "st",
        (2, _) => "nd",
        (3, _) => "rd",
        _ => "th",
    };
    format!("{n}{suffix}")
}

/// Typed text tidied before it's read: notes in brackets ("sw 40 st (bird
/// rd)") and leading words ("corner of …") dropped, so they aren't taken for
/// part of a street.
fn tidy(text: &str) -> String {
    let mut out = String::new();
    let mut depth = 0;
    for c in text.chars() {
        match c {
            '(' => depth += 1,
            ')' => depth = (depth - 1).max(0),
            _ if depth == 0 => out.push(c),
            _ => {}
        }
    }
    let t = out.trim_start();
    for lead in ["the corner of ", "corner of ", "the intersection of ", "intersection of ", "near "] {
        if t.len() > lead.len() && t[..lead.len()].eq_ignore_ascii_case(lead) {
            return t[lead.len()..].to_string();
        }
    }
    t.to_string()
}

/// Highway prefixes run into their number ("i95", "us-1", "sr-826").
const ROUTE_PREFIXES: [&str; 6] = ["i", "us", "sr", "cr", "fl", "hwy"];
/// Words for the unit within a building: the word and the one after it are
/// dropped, since map data places the building, and a unit stops it matching.
const UNIT_WORDS: [&str; 10] = ["apt", "apartment", "unit", "ste", "suite", "lot", "trlr", "bldg", "rm", "room"];

/// Splits typed text into lower-case words, keeping commas, and tidies them:
/// periods dropped from words ("N.W." → "nw"); a direction or a highway
/// prefix run into a number pulled apart ("sw184st" → "sw", "184st"; "i95",
/// "us-1" → "i", "95"); a number run into a type pulled apart ("184st" →
/// "184", "st") unless it's a real ordinal ("152nd", "21st" stay whole); an
/// ordinal ending typed apart joined on ("2 nd" → "2nd", "21 st ave" →
/// "21st ave"); and a unit ("Apt 4", "#4") or a PO box dropped.
fn words(text: &str) -> Vec<String> {
    let mut out: Vec<String> = Vec::new();
    for raw in tidy(text).replace(',', " , ").split_whitespace() {
        let mut w = raw.trim_matches(|c: char| matches!(c, '.' | ';' | ':')).to_lowercase();
        if !w.chars().any(|c| c.is_ascii_digit()) {
            w = w.replace('.', "");
        }
        if w.is_empty() {
            continue;
        }
        // "us-1", "i-95": a highway number.
        if let Some((pre, num)) = w.split_once('-') {
            if ROUTE_PREFIXES.contains(&pre) && !num.is_empty() && num.chars().all(|c| c.is_ascii_digit()) {
                out.push(pre.to_string());
                out.push(num.to_string());
                continue;
            }
        }
        if let Some(i) = w.find(|c: char| c.is_ascii_digit()).filter(|&i| i > 0) {
            if directional(&w[..i]).is_some() {
                out.push(w[..i].to_string());
                w = w[i..].to_string();
            } else if ROUTE_PREFIXES.contains(&&w[..i]) && w[i..].chars().all(|c| c.is_ascii_digit()) {
                out.push(w[..i].to_string());
                out.push(w[i..].to_string());
                continue;
            }
        }
        let digits: String = w.chars().take_while(|c| c.is_ascii_digit()).collect();
        let rest = &w[digits.len()..];
        if !digits.is_empty() && !rest.is_empty() && rest.chars().all(|c| c.is_ascii_alphabetic()) {
            let n: u32 = digits.parse().unwrap_or(0);
            if ordinal(n) == w {
                out.push(w);
            } else {
                out.push(digits);
                out.push(rest.to_string());
            }
        } else {
            out.push(w);
        }
    }
    // Second pass: units and PO boxes out, ordinal endings joined on.
    let mut tidy: Vec<String> = Vec::new();
    let mut i = 0;
    while i < out.len() {
        let w = &out[i];
        let next = out.get(i + 1).map(String::as_str);
        if w.starts_with('#') {
            // "#4", or "#" then "4".
            i += if w == "#" { 2 } else { 1 };
            continue;
        }
        if UNIT_WORDS.contains(&w.as_str()) && next.is_some_and(|n| n != ",") {
            i += 2;
            continue;
        }
        if w == "po" && next == Some("box") {
            i += if out.get(i + 2).is_some_and(|n| n != ",") { 3 } else { 2 };
            continue;
        }
        if w.chars().all(|c| c.is_ascii_digit()) {
            let after = out.get(i + 2).map(String::as_str);
            let joins = match next {
                Some("nd" | "rd" | "th") => true,
                // "21 st ave" is 21st Avenue; "152 st" alone is 152nd Street.
                Some("st") => after.is_some_and(|a| street_type(a).is_some()),
                _ => false,
            };
            if joins {
                tidy.push(format!("{w}{}", next.unwrap_or("")));
                i += 2;
                continue;
            }
        }
        tidy.push(w.clone());
        i += 1;
    }
    tidy
}

/// A street as map data names it: "sw 152 st" → "Southwest 152nd Street".
/// `typed` is whether a street type was given (a name without one, like
/// "Coral Reef", matches any).
#[derive(Debug, Clone, PartialEq)]
pub struct Street {
    pub name: String,
    pub typed: bool,
}

/// Puts a run of words into map-data form. A number before a street type
/// becomes an ordinal ("152 st" → "152nd Street"); a number that isn't (a
/// house number, "US 1") stays as it is. "St" before a name at the start is
/// Saint ("St Augustine"). For a town (`place`), nothing is a street type:
/// "Hartford CT" stays Connecticut.
fn canonical_as(words: &[String], place: bool) -> (String, bool) {
    let mut out: Vec<String> = Vec::new();
    let mut typed = false;
    for (i, w) in words.iter().enumerate() {
        let next = words.get(i + 1);
        let next_is_type = next.is_some_and(|n| street_type(n).is_some());
        let saint = i == 0
            && w == "st"
            && next.is_some_and(|n| n.chars().all(|c| c.is_ascii_alphabetic()) && street_type(n).is_none() && directional(n).is_none());
        if saint {
            out.push("Saint".to_string());
        } else if let Some(t) = street_type(w).filter(|_| i > 0 && !place) {
            out.push(t.to_string());
            typed = true;
        } else if let Some(d) = directional(w).filter(|_| !place || i == 0) {
            out.push(d.to_string());
        } else if w.chars().all(|c| c.is_ascii_digit()) && next_is_type && !place {
            out.push(ordinal(w.parse().unwrap_or(0)));
        } else if w.len() <= 2 && w.chars().all(|c| c.is_ascii_alphabetic()) {
            // State abbreviations and initials: "fl" → "FL".
            out.push(w.to_uppercase());
        } else {
            let mut c = w.chars();
            out.push(c.next().map(|f| f.to_uppercase().collect::<String>() + c.as_str()).unwrap_or_default());
        }
    }
    (out.join(" "), typed)
}

fn canonical(words: &[String]) -> (String, bool) {
    canonical_as(words, false)
}

/// Normalizes a whole typed location for a map search ("13700 sw 152 st
/// miami fl" → "13700 Southwest 152nd Street Miami FL"). What follows a
/// comma is the town and state ("…, St Petersburg, FL").
pub fn normalize(text: &str) -> String {
    let w = words(text);
    w.split(|x| x == ",")
        .filter(|seg| !seg.is_empty())
        .enumerate()
        .map(|(i, seg)| canonical_as(seg, i > 0).0)
        .collect::<Vec<_>>()
        .join(", ")
}

/// Whether a street name starts with a direction ("Southwest 137th Avenue").
fn has_direction(name: &str) -> bool {
    name.split(' ').next().is_some_and(|w| directional(&w.to_lowercase()).is_some())
}

/// Two names for the same street? Compares their map-data forms, ignoring
/// case. A street typed without a type ("Coral Reef") matches any type, and
/// one typed without a direction ("137 Ave", where the direction goes without
/// saying) matches any direction.
pub fn same_street(typed: &Street, name: &str) -> bool {
    matches_canonical(typed, &canonical_lower(name))
}

/// A street name in map-data form, lower case: how known streets keep their names.
fn canonical_lower(name: &str) -> String {
    canonical(&words(name)).0.to_lowercase()
}

/// `same_street`, against a name already in `canonical_lower` form.
fn matches_canonical(typed: &Street, other: &str) -> bool {
    let a = typed.name.to_lowercase();
    let mut b = other.to_string();
    if !has_direction(&typed.name) && has_direction(other) {
        b = b.split_once(' ').map(|(_, rest)| rest.to_string()).unwrap_or(b);
    }
    if typed.typed {
        return a == b;
    }
    b == a || b.strip_prefix(&a).is_some_and(|rest| rest.starts_with(' ') && street_type(&rest.trim().to_lowercase()).is_some())
}

/// What's typed: two streets that cross (and, if typed, the town), or
/// anything else, searched as it is.
#[derive(Debug, Clone, PartialEq)]
pub enum Query {
    Crossing { a: Street, b: Street, place: Option<String> },
    Text(String),
}

const SEPARATORS: [&str; 5] = ["&", "and", "@", "at", "/"];

/// Reads typed text. Two streets joined by "&", "and", "@", "at" or "/" are a
/// crossing; a town after the second street is split off at a comma, after
/// its street type ("sw 137 ave miami fl"), or, with no type, after its
/// number ("nw 151st miami fl").
pub fn parse(text: &str) -> Query {
    let w = words(&text.replace('&', " & ").replace('/', " / ").replace('@', " @ "));
    let Some(i) = w.iter().position(|x| SEPARATORS.contains(&x.as_str())) else {
        return Query::Text(normalize(text));
    };
    let first: Vec<String> = w[..i].iter().filter(|x| *x != ",").cloned().collect();
    let mut second: Vec<String> = w[i + 1..].to_vec();
    let mut place: Vec<String> = Vec::new();
    if let Some(c) = second.iter().position(|x| x == ",") {
        place = second.split_off(c);
    } else if let Some(t) = second.iter().rposition(|x| street_type(x).is_some()) {
        if t > 0 {
            place = second.split_off(t + 1);
        }
    } else if let Some(n) = second.iter().rposition(|x| is_street_number(x)) {
        place = second.split_off(n + 1);
    }
    let place: Vec<String> = place.into_iter().filter(|x| x != ",").collect();
    if first.is_empty() || second.is_empty() {
        return Query::Text(normalize(text));
    }
    let street = |words: &[String]| {
        // A bare number is a numbered street: "152 and 137" → 152nd, 137th.
        let mut words = words.to_vec();
        let named: Vec<usize> = (0..words.len()).filter(|&i| directional(&words[i]).is_none()).collect();
        if let [only] = named[..] {
            if words[only].chars().all(|c| c.is_ascii_digit()) {
                words[only] = ordinal(words[only].parse().unwrap_or(0));
            }
        }
        let (name, typed) = canonical(&words);
        Street { name, typed }
    };
    Query::Crossing {
        a: street(&first),
        b: street(&second),
        place: (!place.is_empty()).then(|| canonical_as(&place, true).0),
    }
}

/// A numbered street's number: "151", or an ordinal like "151st".
fn is_street_number(w: &str) -> bool {
    let digits: String = w.chars().take_while(|c| c.is_ascii_digit()).collect();
    !digits.is_empty() && (digits.len() == w.len() || ordinal(digits.parse().unwrap_or(0)) == w)
}

/// An Overpass name pattern matching a street however it's written:
/// "Southwest 152nd Street" also matches "SW 152 St".
pub fn overpass_pattern(s: &Street) -> String {
    let mut parts = Vec::new();
    for w in s.name.split(' ') {
        let lw = w.to_lowercase();
        if let Some(d) = directional(&lw) {
            let abbr = match d {
                "Northeast" => "NE",
                "Northwest" => "NW",
                "Southeast" => "SE",
                "Southwest" => "SW",
                _ => &d[..1],
            };
            parts.push(format!("({d}|{abbr})"));
        } else if street_type(&lw).is_some() && street_type(&lw) == Some(w) {
            let abbrs = TYPE_ABBRS.iter().find(|(full, _)| *full == w).map(|(_, a)| *a).unwrap_or("");
            parts.push(if abbrs.is_empty() { w.to_string() } else { format!("({w}|{abbrs})") });
        } else if let Some(n) = lw.strip_suffix(|c: char| c.is_ascii_alphabetic()).and_then(|x| {
            x.strip_suffix(|c: char| c.is_ascii_alphabetic())
        }).filter(|n| !n.is_empty() && n.chars().all(|c| c.is_ascii_digit()) && ordinal(n.parse().unwrap_or(0)) == lw)
        {
            parts.push(format!("{n}(st|nd|rd|th)?"));
        } else {
            parts.push(escape_overpass(w));
        }
    }
    let any_direction = if has_direction(&s.name) {
        ""
    } else {
        "((North|South|East|West|Northeast|Northwest|Southeast|Southwest|N|S|E|W|NE|NW|SE|SW) )?"
    };
    let mut p = format!("^{any_direction}{}", parts.join(" "));
    if !s.typed {
        p.push_str("( [A-Za-z]+)?");
    }
    p.push('$');
    p
}

/// Abbreviations map data uses for each full street type.
const TYPE_ABBRS: [(&str, &str); 12] = [
    ("Street", "St"),
    ("Avenue", "Ave"),
    ("Road", "Rd"),
    ("Boulevard", "Blvd"),
    ("Drive", "Dr"),
    ("Court", "Ct"),
    ("Terrace", "Ter"),
    ("Place", "Pl"),
    ("Lane", "Ln"),
    ("Highway", "Hwy"),
    ("Parkway", "Pkwy"),
    ("Circle", "Cir"),
];

fn escape_overpass(w: &str) -> String {
    w.chars()
        .flat_map(|c| if "\\^$.|?*+()[]{}\"".contains(c) { vec!['\\', c] } else { vec![c] })
        .collect()
}

// ------------------------------------------------------------ crossings

type Line = Vec<(f64, f64)>; // (lon, lat) points, as GeoJSON gives them

/// Where any line of one street meets any line of the other: crossing
/// segments and shared points, as (lat, lon).
pub fn crossings(a: &[Line], b: &[Line]) -> Vec<(f64, f64)> {
    let mut out = Vec::new();
    for la in a {
        for lb in b {
            for sa in la.windows(2) {
                for sb in lb.windows(2) {
                    if let Some(p) = segment_cross(sa[0], sa[1], sb[0], sb[1]) {
                        out.push(p);
                    }
                }
            }
        }
    }
    out
}

fn segment_cross(p1: (f64, f64), p2: (f64, f64), p3: (f64, f64), p4: (f64, f64)) -> Option<(f64, f64)> {
    let ((x1, y1), (x2, y2), (x3, y3), (x4, y4)) = (p1, p2, p3, p4);
    let den = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
    if den.abs() < 1e-15 {
        // Parallel; a shared end point still counts.
        return [p1, p2]
            .into_iter()
            .find(|p| *p == p3 || *p == p4)
            .map(|(x, y)| (y, x));
    }
    let t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / den;
    let u = -((x1 - x2) * (y1 - y3) - (y1 - y2) * (x1 - x3)) / den;
    ((0.0..=1.0).contains(&t) && (0.0..=1.0).contains(&u)).then_some((y1 + t * (y2 - y1), x1 + t * (x2 - x1)))
}

/// Distance in metres between two (lat, lon) points.
pub fn metres(a: (f64, f64), b: (f64, f64)) -> f64 {
    let (la1, lo1, la2, lo2) = (a.0.to_radians(), a.1.to_radians(), b.0.to_radians(), b.1.to_radians());
    let h = ((la2 - la1) / 2.0).sin().powi(2) + la1.cos() * la2.cos() * ((lo2 - lo1) / 2.0).sin().powi(2);
    6_371_000.0 * 2.0 * h.sqrt().asin()
}

/// One spot for a crossing: points within ~150 m of each other are one
/// corner (a divided road crosses twice); of several corners, the one
/// nearest the search centre.
pub fn corner(points: &[(f64, f64)], centre: Option<(f64, f64)>) -> Option<(f64, f64)> {
    let mut groups: Vec<Vec<(f64, f64)>> = Vec::new();
    for &p in points {
        match groups.iter_mut().find(|g| metres(g[0], p) < 150.0) {
            Some(g) => g.push(p),
            None => groups.push(vec![p]),
        }
    }
    let mid = |g: &Vec<(f64, f64)>| {
        let n = g.len() as f64;
        (g.iter().map(|p| p.0).sum::<f64>() / n, g.iter().map(|p| p.1).sum::<f64>() / n)
    };
    let mids: Vec<(f64, f64)> = groups.iter().map(mid).collect();
    match centre {
        Some(c) => mids.into_iter().min_by(|x, y| metres(*x, c).total_cmp(&metres(*y, c))),
        None => mids.into_iter().next(),
    }
}

/// Where two streets probably meet, from the pieces fetched so far: a
/// straight line fitted through each street's points, and where those lines
/// cross (as (lat, lon)). A long street comes back in more pieces than are
/// returned at once, so the crossing piece can be missing; this says where to
/// look closer. None for streets running the same way.
pub fn likely_meeting(a: &[Line], b: &[Line]) -> Option<(f64, f64)> {
    // Points as (x east, y north) in metres around a's middle, so the fit
    // isn't skewed by longitude shrinking with latitude.
    let pa: Vec<(f64, f64)> = a.iter().flatten().copied().collect();
    let pb: Vec<(f64, f64)> = b.iter().flatten().copied().collect();
    if pa.len() < 2 || pb.len() < 2 {
        return None;
    }
    let (lon0, lat0) = pa[pa.len() / 2];
    let kx = 111_320.0 * lat0.to_radians().cos();
    let ky = 110_540.0;
    let xy = |(lon, lat): (f64, f64)| ((lon - lon0) * kx, (lat - lat0) * ky);
    // A line through the points' middle, along their main direction.
    let fit = |pts: &[(f64, f64)]| {
        let v: Vec<(f64, f64)> = pts.iter().map(|p| xy(*p)).collect();
        let n = v.len() as f64;
        let (mx, my) = (v.iter().map(|p| p.0).sum::<f64>() / n, v.iter().map(|p| p.1).sum::<f64>() / n);
        let (mut sxx, mut syy, mut sxy) = (0.0, 0.0, 0.0);
        for (x, y) in &v {
            sxx += (x - mx).powi(2);
            syy += (y - my).powi(2);
            sxy += (x - mx) * (y - my);
        }
        let angle = 0.5 * (2.0 * sxy).atan2(sxx - syy);
        ((mx, my), (angle.cos(), angle.sin()))
    };
    let ((ax, ay), (adx, ady)) = fit(&pa);
    let ((bx, by), (bdx, bdy)) = fit(&pb);
    let den = adx * bdy - ady * bdx;
    if den.abs() < 0.2 {
        return None;
    }
    let t = ((bx - ax) * bdy - (by - ay) * bdx) / den;
    let (x, y) = (ax + t * adx, ay + t * ady);
    Some((lat0 + y / ky, lon0 + x / kx))
}

/// The 6-character Maidenhead locator of a point (as grid.ts works it out).
pub fn grid_square(lat: f64, lon: f64) -> String {
    let (lon, lat) = (lon + 180.0, lat + 90.0);
    let f1 = (lon / 20.0).floor();
    let f2 = (lat / 10.0).floor();
    let (r1, r2) = (lon - f1 * 20.0, lat - f2 * 10.0);
    let s1 = (r1 / 2.0).floor();
    let s2 = r2.floor();
    let sub1 = ((r1 - s1 * 2.0) / 2.0 * 24.0).floor();
    let sub2 = ((r2 - s2) * 24.0).floor();
    let ch = |base: u8, n: f64| (base + n as u8) as char;
    format!(
        "{}{}{}{}{}{}",
        ch(b'A', f1),
        ch(b'A', f2),
        ch(b'0', s1),
        ch(b'0', s2),
        ch(b'a', sub1),
        ch(b'a', sub2)
    )
}

// ------------------------------------------------------------ results

/// How exact a found place is, so a rough one is shown as approximate.
#[derive(Serialize, Deserialize, Debug, Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum Precision {
    /// A house or building.
    Address,
    /// Where two streets cross.
    Crossing,
    /// Somewhere along a street (no house number matched).
    Street,
    /// A town, neighbourhood or ZIP code area: its centre.
    Town,
    /// A county or larger: its centre.
    Region,
}

impl Precision {
    /// From a Nominatim result's place rank.
    pub fn from_rank(rank: i64) -> Precision {
        match rank {
            28.. => Precision::Address,
            26..=27 => Precision::Street,
            13..=25 => Precision::Town,
            _ => Precision::Region,
        }
    }
}

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
pub struct Found {
    pub lat: f64,
    pub lon: f64,
    pub precision: Precision,
    /// What was found, in map-data form ("Southwest 152nd Street &
    /// Southwest 137th Avenue").
    pub label: String,
    /// "nominatim" or "overpass".
    pub source: String,
}

pub enum Lookup {
    Found(Found),
    NotFound,
    Offline,
    Error(String),
}

// ------------------------------------------------------------ remembering

/// Places already looked up, kept in a file so the same address or corner
/// is never asked twice. Misses are kept a day, in case the map data was
/// missing it.
#[derive(Default, Serialize, Deserialize)]
pub struct Cache {
    entries: HashMap<String, Entry>,
}

#[derive(Serialize, Deserialize, Clone)]
struct Entry {
    found: Option<Found>,
    /// Unix seconds.
    at: i64,
}

const MISS_KEPT_SECS: i64 = 24 * 60 * 60;
const CACHE_LIMIT: usize = 20_000;
pub const CACHE_FILE: &str = "looked-up-places.json";

impl Cache {
    pub fn load(dir: &Path) -> Cache {
        std::fs::read_to_string(dir.join(CACHE_FILE))
            .ok()
            .and_then(|s| serde_json::from_str(&s).ok())
            .unwrap_or_default()
    }

    fn save(&self, dir: &Path) {
        if let Ok(s) = serde_json::to_string(self) {
            let _ = std::fs::write(dir.join(CACHE_FILE), s);
        }
    }

    /// What was found for this key before, if it's still good: Some(None)
    /// for a recent miss.
    fn get(&self, key: &str, now: i64) -> Option<Option<Found>> {
        let e = self.entries.get(key)?;
        match &e.found {
            Some(f) => Some(Some(f.clone())),
            None if now - e.at < MISS_KEPT_SECS => Some(None),
            None => None,
        }
    }

    fn put(&mut self, key: String, found: Option<Found>, now: i64) {
        if self.entries.len() >= CACHE_LIMIT {
            // Drop the oldest tenth.
            let mut ats: Vec<i64> = self.entries.values().map(|e| e.at).collect();
            ats.sort_unstable();
            let cut = ats[ats.len() / 10];
            self.entries.retain(|_, e| e.at > cut);
        }
        self.entries.insert(key, Entry { found, at: now });
    }
}

// ------------------------------------------------------------ known streets

/// Street shapes fetched for cross streets, kept so later crossings of the
/// same streets are worked out here, offline and without asking anyone
/// (LOCRES-057). Each piece of road once, by its OpenStreetMap id.
#[derive(Default, Serialize, Deserialize)]
pub struct Streets {
    ways: HashMap<String, Way>,
}

#[derive(Serialize, Deserialize, Clone)]
struct Way {
    /// Every name the road goes by, in `canonical_lower` form.
    names: Vec<String>,
    lines: Vec<Line>,
}

pub const STREETS_FILE: &str = "known-streets.json";
const STREETS_LIMIT: usize = 100_000;

impl Streets {
    /// Keeps a piece of road; false if it was already known (or there's no room).
    fn add(&mut self, id: String, names: &[String], lines: Vec<Line>) -> bool {
        if lines.is_empty() || names.is_empty() || self.ways.contains_key(&id) || self.ways.len() >= STREETS_LIMIT {
            return false;
        }
        // To about 10 cm: plenty for a pin, and a much smaller file.
        let round = |v: f64| (v * 1e6).round() / 1e6;
        let lines = lines.into_iter().map(|l| l.into_iter().map(|(x, y)| (round(x), round(y))).collect()).collect();
        let names = names.iter().map(|n| canonical_lower(n)).collect();
        self.ways.insert(id, Way { names, lines });
        true
    }

    /// The known pieces of a street, within `km` of `centre` when given.
    fn lines_for(&self, s: &Street, centre: Option<(f64, f64)>, km: f64) -> Vec<Line> {
        let near = |l: &Line| centre.is_none_or(|c| l.iter().any(|&(lon, lat)| metres((lat, lon), c) < km * 1000.0));
        self.ways
            .values()
            .filter(|w| w.names.iter().any(|n| matches_canonical(s, n)))
            .flat_map(|w| w.lines.iter().filter(|l| near(l)).cloned())
            .collect()
    }

    #[cfg(test)]
    pub fn len(&self) -> usize {
        self.ways.len()
    }
}

/// The ways a street might be meant, likeliest first: a numbered street
/// said without a type ("nw 151st") is a Street, unless no Street fits, in
/// which case any type ("Terrace", "Court") will do.
fn meanings(s: &Street) -> Vec<Street> {
    let numbered = s.name.rsplit(' ').next().is_some_and(|w| is_street_number(&w.to_lowercase()));
    if s.typed || !numbered {
        return vec![s.clone()];
    }
    vec![Street { name: format!("{} Street", s.name), typed: true }, s.clone()]
}

/// Where two streets cross, from known streets within `km` of `centre`,
/// trying the likeliest meanings first; with the names it found them by.
fn best_corner(streets: &Streets, a: &Street, b: &Street, centre: Option<(f64, f64)>, km: f64) -> Option<((f64, f64), String)> {
    for ma in meanings(a) {
        let la = streets.lines_for(&ma, centre, km);
        if la.is_empty() {
            continue;
        }
        for mb in meanings(b) {
            let lb = streets.lines_for(&mb, centre, km);
            if let Some(p) = corner(&crossings(&la, &lb), centre) {
                return Some((p, format!("{} & {}", ma.name, mb.name)));
            }
        }
    }
    None
}

/// A cross street worked out from known streets alone, near the net when
/// it's known; None when they don't cover it.
pub fn known_crossing(streets: &Streets, text: &str, near: Option<(f64, f64)>) -> Option<Found> {
    let Query::Crossing { a, b, .. } = parse(text) else { return None };
    let ((lat, lon), label) = best_corner(streets, &a, &b, near, NEAR_NET_KM)?;
    Some(Found { lat, lon, precision: Precision::Crossing, label, source: "known streets".into() })
}

/// What the lookup remembers between runs: places found, and the street
/// shapes fetched along the way. Both work offline.
#[derive(Default)]
pub struct Memory {
    pub places: Cache,
    pub streets: Streets,
    streets_changed: bool,
}

impl Memory {
    pub fn load(dir: &Path) -> Memory {
        Memory {
            places: Cache::load(dir),
            streets: std::fs::read_to_string(dir.join(STREETS_FILE))
                .ok()
                .and_then(|s| serde_json::from_str(&s).ok())
                .unwrap_or_default(),
            streets_changed: false,
        }
    }

    fn save(&mut self, dir: &Path) {
        self.places.save(dir);
        if self.streets_changed {
            if let Ok(s) = serde_json::to_string(&self.streets) {
                let _ = std::fs::write(dir.join(STREETS_FILE), s);
            }
            self.streets_changed = false;
        }
    }
}

/// The cache key: the typed text in map-data form, and roughly where it was
/// searched from (about 5 km), since "Main St & 5th" means a different place
/// near another net.
fn cache_key(text: &str, near: Option<(f64, f64)>) -> String {
    let q = normalize(text).to_lowercase();
    match near {
        Some((lat, lon)) => format!("{q}|{:.2},{:.2}", (lat * 20.0).round() / 20.0, (lon * 20.0).round() / 20.0),
        None => q,
    }
}

// ------------------------------------------------------------ looking up

const NOMINATIM_URL: &str = "https://nominatim.openstreetmap.org/search";
const OVERPASS_URLS: [&str; 2] = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
];
/// Searches stay within this distance of the net, or of a typed town (a
/// "Miami" mailing address covers most of the county).
const NEAR_NET_KM: f64 = 40.0;
/// How far around a likely meeting point to look again for the crossing piece.
const CLOSER_KM: f64 = 2.0;
/// Nominatim's limit is one request a second; a little over, to be safe.
const NOMINATIM_GAP: Duration = Duration::from_millis(1100);

static LAST_NOMINATIM: tokio::sync::Mutex<Option<Instant>> = tokio::sync::Mutex::const_new(None);

/// A Nominatim request, never sooner than a second after the last.
async fn nominatim(params: &[(&str, String)]) -> Result<Value, Lookup> {
    let mut last = LAST_NOMINATIM.lock().await;
    if let Some(t) = *last {
        let since = t.elapsed();
        if since < NOMINATIM_GAP {
            tokio::time::sleep(NOMINATIM_GAP - since).await;
        }
    }
    let client = crate::net::client(Duration::from_secs(5), Some(Duration::from_secs(10)))
        .map_err(|e| Lookup::Error(e.to_string()))?;
    let resp = client
        .get(NOMINATIM_URL)
        .query(params)
        .header("User-Agent", crate::net::USER_AGENT)
        .send()
        .await;
    *last = Some(Instant::now());
    drop(last);
    let resp = resp.map_err(|e| if crate::net::is_offline_error(&e) { Lookup::Offline } else { Lookup::Error(e.to_string()) })?;
    if !resp.status().is_success() {
        return Err(Lookup::Error(format!("map search HTTP error: {}", resp.status())));
    }
    resp.json().await.map_err(|e| Lookup::Error(e.to_string()))
}

/// A box around a point, `km` each way, as Nominatim's "left,top,right,bottom".
fn viewbox((lat, lon): (f64, f64), km: f64) -> String {
    let dlat = km / 111.0;
    let dlon = km / (111.0 * lat.to_radians().cos().max(0.2));
    format!("{},{},{},{}", lon - dlon, lat + dlat, lon + dlon, lat - dlat)
}

fn num(v: &Value, k: &str) -> Option<f64> {
    v.get(k).and_then(|x| x.as_str().and_then(|s| s.parse().ok()).or_else(|| x.as_f64()))
}

/// A plain search: the first result, within `around` if given.
async fn search(q: &str, around: Option<((f64, f64), f64)>) -> Result<Option<(Found, Value)>, Lookup> {
    let mut p = vec![
        ("q", q.to_string()),
        ("format", "jsonv2".to_string()),
        ("limit", "1".to_string()),
        ("countrycodes", "us".to_string()),
    ];
    if let Some((c, km)) = around {
        p.push(("viewbox", viewbox(c, km)));
        p.push(("bounded", "1".to_string()));
    }
    let body = nominatim(&p).await?;
    let Some(first) = body.as_array().and_then(|a| a.first()) else { return Ok(None) };
    let (Some(lat), Some(lon)) = (num(first, "lat"), num(first, "lon")) else { return Ok(None) };
    let rank = first.get("place_rank").and_then(Value::as_i64).unwrap_or(0);
    let label = first.get("display_name").and_then(Value::as_str).unwrap_or(q).to_string();
    Ok(Some((
        Found { lat, lon, precision: Precision::from_rank(rank), label, source: "nominatim".into() },
        first.clone(),
    )))
}

/// A street's shapes within `km` of `centre`, keeping only roads that really
/// have that name (Nominatim also returns near matches).
async fn street_lines(memory: &Mutex<Memory>, s: &Street, centre: (f64, f64), km: f64) -> Result<Vec<Line>, Lookup> {
    let p = vec![
        ("q", s.name.clone()),
        ("format", "jsonv2".to_string()),
        ("limit", "40".to_string()),
        ("countrycodes", "us".to_string()),
        ("viewbox", viewbox(centre, km)),
        ("bounded", "1".to_string()),
        ("dedupe", "0".to_string()),
        ("polygon_geojson", "1".to_string()),
        ("namedetails", "1".to_string()),
        ("layer", "address".to_string()),
    ];
    let body = nominatim(&p).await?;
    let mut lines = Vec::new();
    let mut m = memory.lock().unwrap();
    for r in body.as_array().into_iter().flatten() {
        if r.get("category").and_then(Value::as_str) != Some("highway") {
            continue;
        }
        let names: Vec<String> = r
            .get("namedetails")
            .and_then(Value::as_object)
            .map(|n| n.values().filter_map(Value::as_str).map(String::from).collect())
            .unwrap_or_default();
        let shape = geojson_lines(r.get("geojson"));
        // Every road that came back is kept, for crossings asked later.
        if let (Some(t), Some(id)) = (r.get("osm_type").and_then(Value::as_str), r.get("osm_id").and_then(Value::as_i64)) {
            if m.streets.add(format!("{t}{id}"), &names, shape.clone()) {
                m.streets_changed = true;
            }
        }
        if names.iter().any(|v| same_street(s, v)) {
            lines.extend(shape);
        }
    }
    Ok(lines)
}

fn geojson_lines(g: Option<&Value>) -> Vec<Line> {
    let Some(g) = g else { return Vec::new() };
    let line = |v: &Value| -> Line {
        v.as_array()
            .into_iter()
            .flatten()
            .filter_map(|p| Some((p.get(0)?.as_f64()?, p.get(1)?.as_f64()?)))
            .collect()
    };
    match g.get("type").and_then(Value::as_str) {
        Some("LineString") => g.get("coordinates").map(|c| vec![line(c)]).unwrap_or_default(),
        Some("MultiLineString") => g
            .get("coordinates")
            .and_then(Value::as_array)
            .map(|ls| ls.iter().map(line).collect())
            .unwrap_or_default(),
        _ => Vec::new(),
    }
}

/// Asks Overpass for the points two streets share, trying a second server if
/// the first is busy. Only a definite answer counts as "not there".
async fn overpass_corner(a: &Street, b: &Street, centre: (f64, f64), km: f64) -> Result<Vec<(f64, f64)>, Lookup> {
    let around = format!("around:{:.0},{:.5},{:.5}", km * 1000.0, centre.0, centre.1);
    let ways = |s: &Street, var: &str| {
        let pat = overpass_pattern(s).replace('"', "\\\"");
        let each: String = ["name", "alt_name", "official_name", "old_name", "ref"]
            .iter()
            .map(|k| format!("way({around})[\"highway\"][\"{k}\"~\"{pat}\",i];"))
            .collect();
        format!("({each})->.{var};")
    };
    let q = format!("[out:json][timeout:20];{}{}node(w.a)(w.b);out;", ways(a, "a"), ways(b, "b"));
    let client = crate::net::client(Duration::from_secs(5), Some(Duration::from_secs(25)))
        .map_err(|e| Lookup::Error(e.to_string()))?;
    let mut last = Lookup::Error("Overpass didn't answer".into());
    for url in OVERPASS_URLS {
        let resp = client
            .post(url)
            .header("User-Agent", crate::net::USER_AGENT)
            .form(&[("data", q.as_str())])
            .send()
            .await;
        let resp = match resp {
            Ok(r) if r.status().is_success() => r,
            Ok(r) => {
                last = Lookup::Error(format!("Overpass HTTP error: {}", r.status()));
                continue;
            }
            Err(e) if crate::net::is_offline_error(&e) && !e.is_timeout() => return Err(Lookup::Offline),
            Err(e) => {
                last = Lookup::Error(e.to_string());
                continue;
            }
        };
        let Ok(body) = resp.json::<Value>().await else { continue };
        if body.get("remark").and_then(Value::as_str).is_some_and(|r| r.contains("timed out")) {
            last = Lookup::Error("Overpass timed out".into());
            continue;
        }
        return Ok(body
            .get("elements")
            .and_then(Value::as_array)
            .into_iter()
            .flatten()
            .filter_map(|e| Some((num(e, "lat")?, num(e, "lon")?)))
            .collect());
    }
    Err(last)
}

/// Places a cross street: around the typed town, else the net; first from
/// the two streets' shapes worked out here, then from Overpass.
async fn find_crossing(
    memory: &Mutex<Memory>,
    a: &Street,
    b: &Street,
    place: Option<&str>,
    near: Option<(f64, f64)>,
    patient: bool,
) -> Result<Option<Found>, Lookup> {
    let (centre, km) = match place {
        Some(p) => match search(p, near.map(|n| (n, 150.0))).await? {
            Some((f, _)) => ((f.lat, f.lon), NEAR_NET_KM),
            None => match search(p, None).await? {
                Some((f, _)) => ((f.lat, f.lon), NEAR_NET_KM),
                None => return Ok(None),
            },
        },
        None => match near {
            Some(n) => (n, NEAR_NET_KM),
            // No town and no net to search around: anywhere in the country
            // is too broad for a street name.
            None => return Ok(None),
        },
    };
    let found = |(lat, lon): (f64, f64), label: String, source: &str| Found {
        lat,
        lon,
        precision: Precision::Crossing,
        label,
        source: source.into(),
    };
    // The pieces fetched are kept (`street_lines`), so the corner is worked
    // out from them with the likeliest meanings first (`best_corner`).
    let corner_here = |at: (f64, f64), km: f64| best_corner(&memory.lock().unwrap().streets, a, b, Some(at), km);
    let la = street_lines(memory, a, centre, km).await?;
    if !la.is_empty() {
        let lb = street_lines(memory, b, centre, km).await?;
        if let Some((p, label)) = corner_here(centre, km) {
            return Ok(Some(found(p, label, "nominatim")));
        }
        // Long streets: the pieces near the crossing may not have come back.
        // Look again close to where the two streets look likely to meet.
        if let Some(m) = likely_meeting(&la, &lb).filter(|m| metres(*m, centre) < km * 1000.0) {
            let (la, lb) = (
                street_lines(memory, a, m, CLOSER_KM).await?,
                street_lines(memory, b, m, CLOSER_KM).await?,
            );
            if !la.is_empty() && !lb.is_empty() {
                if let Some((p, label)) = corner_here(m, CLOSER_KM * 1.5) {
                    return Ok(Some(found(p, label, "nominatim")));
                }
            }
        }
    }
    // Overpass can take half a minute: only when nobody's waiting.
    if !patient {
        return Err(Lookup::Error("Overpass not asked while someone waits".into()));
    }
    let points = overpass_corner(a, b, centre, km).await?;
    Ok(corner(&points, Some(centre)).map(|p| found(p, format!("{} & {}", a.name, b.name), "overpass")))
}

/// A place already looked up, or a cross street worked out from known
/// streets, without going online: works offline (LOCRES-055, LOCRES-057).
pub fn recall(memory: &Mutex<Memory>, text: &str, near: Option<(f64, f64)>) -> Option<Found> {
    let now = chrono::Utc::now().timestamp();
    let m = memory.lock().unwrap();
    m.places
        .get(&cache_key(text.trim(), near), now)
        .flatten()
        .or_else(|| known_crossing(&m.streets, text, near))
}

/// Places typed text: a cross street, else a search near the net, then
/// anywhere; the text as typed if the tidied form finds nothing. Remembered
/// either way (`memory`, kept in `dir`). `patient`: nobody is waiting (a
/// lookup after saving), so the slow Overpass may be asked too.
pub async fn find(memory: &Mutex<Memory>, dir: &Path, text: &str, near: Option<(f64, f64)>, patient: bool) -> Lookup {
    let text = text.trim();
    if text.is_empty() {
        return Lookup::NotFound;
    }
    let key = cache_key(text, near);
    let now = chrono::Utc::now().timestamp();
    // Remembered places, and crossings of known streets, answer offline too
    // and ask nobody.
    {
        let mut m = memory.lock().unwrap();
        if let Some(hit) = m.places.get(&key, now) {
            return hit.map(Lookup::Found).unwrap_or(Lookup::NotFound);
        }
        if let Some(f) = known_crossing(&m.streets, text, near) {
            m.places.put(key, Some(f.clone()), now);
            m.save(dir);
            return Lookup::Found(f);
        }
    }
    if crate::net::working_offline() {
        return Lookup::Offline;
    }
    // Whether every service gave a real answer: only then is the result kept
    // (a miss, or a fallback, could do better once a busy server answers).
    let mut definite = true;
    let result = async {
        if let Query::Crossing { a, b, place } = parse(text) {
            match find_crossing(memory, &a, &b, place.as_deref(), near, patient).await {
                Ok(Some(f)) => return Ok(Some(f)),
                Ok(None) => {}
                Err(Lookup::Offline) => return Err(Lookup::Offline),
                // Overpass busy: still try the plain search.
                Err(_) => definite = false,
            }
        }
        // The tidied text, then as typed in case tidying misread it; near the
        // net first each time.
        let tidied = normalize(text);
        let mut tries = vec![tidied.clone()];
        if !tidied.eq_ignore_ascii_case(text) {
            tries.push(text.to_string());
        }
        for q in &tries {
            if let Some(n) = near {
                if let Some((f, _)) = search(q, Some((n, NEAR_NET_KM))).await? {
                    return Ok(Some(f));
                }
            }
            if let Some((f, _)) = search(q, None).await? {
                return Ok(Some(f));
            }
        }
        Ok(None)
    }
    .await;
    let mut m = memory.lock().unwrap();
    let out = match result {
        Ok(found) => {
            if definite {
                m.places.put(key, found.clone(), now);
            }
            found.map(Lookup::Found).unwrap_or(Lookup::NotFound)
        }
        Err(e) => e,
    };
    // Streets fetched are kept even when the lookup itself failed.
    m.save(dir);
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    fn st(name: &str, typed: bool) -> Street {
        Street { name: name.into(), typed }
    }

    #[test]
    fn shorthand_becomes_the_names_map_data_uses() {
        assert_eq!(normalize("13700 sw 152 st miami fl"), "13700 Southwest 152nd Street Miami FL");
        assert_eq!(normalize("sw 152st"), "Southwest 152nd Street");
        assert_eq!(normalize("sw184st"), "Southwest 184th Street");
        assert_eq!(normalize("NW7AVE"), "Northwest 7th Avenue");
        // A highway number run into its prefix is pulled apart; other words stay whole.
        assert_eq!(normalize("i95"), "I 95");
        assert_eq!(normalize("US-1"), "US 1");
        assert_eq!(normalize("abc123"), "Abc123");
        assert_eq!(normalize("NW 21st Ter"), "Northwest 21st Terrace");
        assert_eq!(normalize("w 1 ave"), "West 1st Avenue");
        assert_eq!(normalize("Old Cutler Rd."), "Old Cutler Road");
        // A house number or a highway number isn't an ordinal.
        assert_eq!(normalize("12 main st"), "12 Main Street");
        assert_eq!(normalize("us 1"), "US 1");
        assert_eq!(ordinal(11), "11th");
        assert_eq!(ordinal(112), "112th");
        assert_eq!(ordinal(152), "152nd");
        assert_eq!(ordinal(23), "23rd");
    }

    #[test]
    fn typed_text_is_tidied_the_way_people_write_it() {
        // Periods, ordinal endings typed apart.
        assert_eq!(normalize("N.W. 27th Ave"), "Northwest 27th Avenue");
        assert_eq!(normalize("21 st ave"), "21st Avenue");
        assert_eq!(normalize("2 nd ave"), "2nd Avenue");
        assert_eq!(normalize("152 st"), "152nd Street", "a lone st is still Street");
        // After a comma it's the town and state.
        assert_eq!(normalize("Hartford, CT"), "Hartford, CT");
        assert_eq!(normalize("123 Main St, St Petersburg, FL"), "123 Main Street, Saint Petersburg, FL");
        assert_eq!(normalize("St Augustine FL"), "Saint Augustine FL");
        // Units and PO boxes aren't places.
        assert_eq!(
            normalize("9296 SW 183rd Ter Apt 4, Palmetto Bay, FL 33157"),
            "9296 Southwest 183rd Terrace, Palmetto Bay, FL 33157"
        );
        assert_eq!(normalize("12 Main St #4, Miami"), "12 Main Street, Miami");
        assert_eq!(normalize("PO BOX 298832, Pembroke Pines, FL 33029"), "Pembroke Pines, FL 33029");
        assert_eq!(normalize("P.O. Box 12, Miami"), "Miami");
    }

    #[test]
    fn cross_streets_are_read_with_or_without_a_town() {
        let crossing = |a: &str, b: &str, place: Option<&str>| Query::Crossing {
            a: st(a, true),
            b: st(b, true),
            place: place.map(String::from),
        };
        assert_eq!(
            parse("sw 152st & sw 137ave miami fl"),
            crossing("Southwest 152nd Street", "Southwest 137th Avenue", Some("Miami FL"))
        );
        assert_eq!(
            parse("sw184st  and sw112ave miami fl"),
            crossing("Southwest 184th Street", "Southwest 112th Avenue", Some("Miami FL"))
        );
        assert_eq!(
            parse("sw 152st & 137ave miami fl"),
            crossing("Southwest 152nd Street", "137th Avenue", Some("Miami FL"))
        );
        assert_eq!(
            parse("sw 152 st and sw 137 ave miami"),
            crossing("Southwest 152nd Street", "Southwest 137th Avenue", Some("Miami"))
        );
        assert_eq!(
            parse("Coral Way @ Douglas Rd, Coral Gables"),
            crossing("Coral Way", "Douglas Road", Some("Coral Gables"))
        );
        assert_eq!(parse("Main St / 5th Ave"), crossing("Main Street", "5th Avenue", None));
        // Notes in brackets and leading words dropped; highways; bare numbers.
        assert_eq!(
            parse("sw 40 st (bird rd) & sw 87 ave"),
            crossing("Southwest 40th Street", "Southwest 87th Avenue", None)
        );
        assert_eq!(
            parse("corner of sw 152 st and sw 137 ave"),
            crossing("Southwest 152nd Street", "Southwest 137th Avenue", None)
        );
        assert_eq!(
            parse("US-1 & sw 152 st"),
            Query::Crossing { a: st("US 1", false), b: st("Southwest 152nd Street", true), place: None }
        );
        assert_eq!(
            parse("152 and 137"),
            Query::Crossing { a: st("152nd", false), b: st("137th", false), place: None }
        );
        assert_eq!(
            parse("N.W. 27th Ave & N.W. 151st St, Opa-locka"),
            crossing("Northwest 27th Avenue", "Northwest 151st Street", Some("Opa-locka"))
        );
        // No street type on the second: the town starts after its number.
        assert_eq!(
            parse("nw 27 ave and nw 151st miami fl"),
            Query::Crossing {
                a: st("Northwest 27th Avenue", true),
                b: st("Northwest 151st", false),
                place: Some("Miami FL".into()),
            }
        );
        assert_eq!(
            parse("old cutler & coral reef"),
            Query::Crossing { a: st("Old Cutler", false), b: st("Coral Reef", false), place: None }
        );
        assert_eq!(parse("13700 sw 152 st miami"), Query::Text("13700 Southwest 152nd Street Miami".into()));
        assert_eq!(parse("& main st"), Query::Text("& Main Street".into()));
    }

    #[test]
    fn street_names_match_however_theyre_written() {
        let typed = st("Southwest 152nd Street", true);
        assert!(same_street(&typed, "SW 152nd St"));
        assert!(same_street(&typed, "Southwest 152 Street"));
        assert!(!same_street(&typed, "Southwest 152nd Avenue"));
        assert!(!same_street(&typed, "Southwest 15th Street"));
        // No direction typed: any direction matches.
        let bare = st("137th Avenue", true);
        assert!(same_street(&bare, "Southwest 137th Avenue"));
        assert!(same_street(&bare, "SW 137 Ave"));
        assert!(!same_street(&bare, "Southwest 137th Street"));
        assert!(!same_street(&typed, "152nd Street"), "a direction typed must match");
        let untyped = st("Coral Reef", false);
        assert!(same_street(&untyped, "Coral Reef Drive"));
        assert!(!same_street(&untyped, "Coral Reef Mall Road"));
    }

    #[test]
    fn overpass_patterns_take_either_spelling() {
        assert_eq!(
            overpass_pattern(&st("Southwest 152nd Street", true)),
            "^(Southwest|SW) 152(st|nd|rd|th)? (Street|St)$"
        );
        assert_eq!(
            overpass_pattern(&st("Coral Reef", false)),
            "^((North|South|East|West|Northeast|Northwest|Southeast|Southwest|N|S|E|W|NE|NW|SE|SW) )?Coral Reef( [A-Za-z]+)?$"
        );
        assert!(overpass_pattern(&st("137th Avenue", true)).ends_with(")?137(st|nd|rd|th)? (Avenue|Ave)$"));
    }

    #[test]
    fn a_crossing_is_one_corner_nearest_the_net() {
        // Two streets as (lon, lat) lines crossing at (25.62, -80.41).
        let a = vec![vec![(-80.42, 25.62), (-80.40, 25.62)]];
        let b = vec![vec![(-80.41, 25.61), (-80.41, 25.63)]];
        let p = crossings(&a, &b);
        assert_eq!(p.len(), 1);
        assert!((p[0].0 - 25.62).abs() < 1e-9 && (p[0].1 + 80.41).abs() < 1e-9);
        // A divided road crossing twice ~20 m apart is one corner; a far
        // crossing of the same names in another town loses to the near one.
        let near = (25.6261, -80.4144);
        let pts = [(25.6261, -80.4144), (25.6263, -80.4146), (26.10, -80.20)];
        let c = corner(&pts, Some(near)).unwrap();
        assert!(metres(c, near) < 30.0);
        assert!(corner(&[], None).is_none());
    }

    #[test]
    fn long_streets_point_to_where_they_meet() {
        // An east-west street and a north-south one, as pieces well away
        // from where they cross at (25.62, -80.41).
        let a = vec![vec![(-80.50, 25.6201), (-80.48, 25.6199)], vec![(-80.33, 25.6200), (-80.31, 25.6201)]];
        let b = vec![vec![(-80.4101, 25.55), (-80.4099, 25.57)], vec![(-80.4100, 25.68), (-80.4101, 25.70)]];
        assert!(crossings(&a, &b).is_empty());
        let m = likely_meeting(&a, &b).unwrap();
        assert!(metres(m, (25.62, -80.41)) < 100.0, "{m:?}");
        // Two streets running the same way don't meet.
        assert!(likely_meeting(&a, &a).is_none());
    }

    #[test]
    fn grid_squares_match_the_window() {
        assert_eq!(grid_square(25.6262, -80.4147), "EL95tp");
        assert_eq!(grid_square(41.714775, -72.72726), "FN31pr");
    }

    #[test]
    fn precision_comes_from_what_was_matched() {
        assert_eq!(Precision::from_rank(30), Precision::Address);
        assert_eq!(Precision::from_rank(26), Precision::Street);
        assert_eq!(Precision::from_rank(16), Precision::Town);
        assert_eq!(Precision::from_rank(12), Precision::Region);
    }

    /// Against the real services: `cargo test live_lookups -- --ignored --nocapture`.
    #[test]
    #[ignore]
    fn live_lookups() {
        let dir = std::env::temp_dir().join(format!("roc-geocode-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let cache = Mutex::new(Memory::default());
        // A repeater in south Miami-Dade.
        let near = Some((25.6261, -80.4155));
        for text in [
            "sw 152st & sw 137ave miami fl",
            "sw 152 st and sw 137 ave",
            "sw184st  and sw112ave miami fl",
            "sw 152st & 137ave miami fl",
            "nw 27 ave and nw 151st miami fl",
            "N.W. 27th Ave & N.W. 151st St",
            "US 1 & SW 152 St",
            "Kendall Dr & SW 117 Ave",
            "Biscayne Blvd & NE 79th",
            "sw 40 st (bird rd) & sw 87 ave",
            "corner of sw 117 ave and sw 88 st",
            "152 and 137",
            "9296 SW 183rd Ter Apt 4, Palmetto Bay, FL 33157",
            "PO BOX 298832, Pembroke Pines, FL 33029",
            "Coral Way & Douglas Rd, Miami",
            "old cutler rd & coral reef dr",
            "13700 sw 152 st miami fl",
            "Main St & 5th",
            "Winter Park",
        ] {
            let t = Instant::now();
            let r = tauri::async_runtime::block_on(find(&cache, &dir, text, near, true));
            let say = match r {
                Lookup::Found(f) => format!("{:.5},{:.5} {:?} via {} — {}", f.lat, f.lon, f.precision, f.source, f.label),
                Lookup::NotFound => "not found".into(),
                Lookup::Offline => "offline".into(),
                Lookup::Error(e) => format!("error: {e}"),
            };
            println!("{text:34} {:5.1}s  {say}", t.elapsed().as_secs_f64());
        }
        let t = Instant::now();
        let again = tauri::async_runtime::block_on(find(&cache, &dir, "SW 152 St & SW 137 Ave, Miami FL", near, true));
        println!("remembered: {:.3}s {}", t.elapsed().as_secs_f64(), matches!(again, Lookup::Found(_)));
        // A crossing never asked, of two streets already fetched: worked out here.
        crate::net::set_work_offline(true);
        let t = Instant::now();
        let known = recall(&cache, "sw 184 st & sw 137 ave", near);
        println!(
            "known streets ({} pieces): {:.3}s {:?}",
            cache.lock().unwrap().streets.len(),
            t.elapsed().as_secs_f64(),
            known.map(|f| (f.lat, f.lon, f.source))
        );
        crate::net::set_work_offline(false);
    }

    #[test]
    fn known_streets_place_new_crossings_without_asking_anyone() {
        let mut streets = Streets::default();
        // SW 152nd Street running east-west, with a second name; two avenues
        // crossing it, kept from earlier lookups.
        let names = |n: &[&str]| n.iter().map(|s| s.to_string()).collect::<Vec<_>>();
        assert!(streets.add("W1".into(), &names(&["Southwest 152nd Street", "Coral Reef Drive"]), vec![vec![(-80.45, 25.6262), (-80.30, 25.6262)]]));
        assert!(!streets.add("W1".into(), &names(&["Southwest 152nd Street"]), vec![vec![(0.0, 0.0), (1.0, 1.0)]]), "each piece once");
        streets.add("W2".into(), &names(&["SW 137th Ave"]), vec![vec![(-80.4145, 25.60), (-80.4145, 25.65)]]);
        streets.add("W3".into(), &names(&["Southwest 117th Avenue"]), vec![vec![(-80.3790, 25.60), (-80.3790, 25.65)]]);
        assert_eq!(streets.len(), 3);
        let near = Some((25.6261, -80.4155));
        let f = known_crossing(&streets, "sw 152 st & 117 ave", near).expect("both streets known");
        assert!(metres((f.lat, f.lon), (25.6262, -80.3790)) < 1.0);
        assert_eq!((f.precision, f.source.as_str()), (Precision::Crossing, "known streets"));
        // Another name for the same road works too.
        assert!(known_crossing(&streets, "coral reef dr & sw 137 ave", near).is_some());
        // A street never fetched, or not a crossing: nothing.
        assert!(known_crossing(&streets, "sw 152 st & sw 97 ave", near).is_none());
        assert!(known_crossing(&streets, "13700 sw 152 st", near).is_none());
        // Too far from this net.
        assert!(known_crossing(&streets, "sw 152 st & 117 ave", Some((28.5, -81.4))).is_none());
        // A numbered street said without a type is the Street, not a Terrace
        // of the same number a block away; any type when there's no Street.
        streets.add("W4".into(), &names(&["Northwest 151st Terrace"]), vec![vec![(-80.30, 25.9122), (-80.20, 25.9122)]]);
        streets.add("W5".into(), &names(&["Northwest 151st Street"]), vec![vec![(-80.30, 25.9115), (-80.20, 25.9115)]]);
        streets.add("W6".into(), &names(&["Northwest 27th Avenue"]), vec![vec![(-80.2439, 25.89), (-80.2439, 25.93)]]);
        streets.add("W7".into(), &names(&["Northwest 160th Terrace"]), vec![vec![(-80.30, 25.925), (-80.20, 25.925)]]);
        let miami_gardens = Some((25.91, -80.24));
        let f = known_crossing(&streets, "nw 27 ave & nw 151st", miami_gardens).unwrap();
        assert!((f.lat - 25.9115).abs() < 1e-6, "the Street: {f:?}");
        assert_eq!(f.label, "Northwest 27th Avenue & Northwest 151st Street");
        let t = known_crossing(&streets, "nw 27 ave & nw 160th", miami_gardens).unwrap();
        assert!((t.lat - 25.925).abs() < 1e-6, "no Street, so the Terrace");
        // Through recall, as the location boxes use it offline.
        let m = Mutex::new(Memory { streets, ..Default::default() });
        assert!(recall(&m, "SW 152nd St & SW 117th Ave", near).is_some());
    }

    fn found_at(lat: f64) -> Found {
        Found { lat, lon: -80.4, precision: Precision::Crossing, label: "x".into(), source: "nominatim".into() }
    }

    #[test]
    fn found_places_are_kept_and_misses_kept_a_day() {
        let found = Found { lat: 1.0, lon: 2.0, precision: Precision::Crossing, label: "x".into(), source: "nominatim".into() };
        let mut c = Cache::default();
        c.put("hit".into(), Some(found.clone()), 0);
        c.put("miss".into(), None, 0);
        let year = 365 * 24 * 3600;
        assert_eq!(c.get("hit", year), Some(Some(found)));
        assert_eq!(c.get("miss", 3600), Some(None));
        assert_eq!(c.get("miss", MISS_KEPT_SECS + 1), None);
        assert_eq!(c.get("never", 0), None);
        let m = Mutex::new(Memory { places: c, ..Default::default() });
        assert!(recall(&m, " Hit ", None).is_some(), "found however it's typed");
        assert!(recall(&m, "miss", None).is_none());
        m.lock().unwrap().places.put(cache_key("sw 152 st & sw 137 ave", None), Some(found_at(25.6)), 0);
        assert_eq!(recall(&m, "SW 152 St & SW 137 Ave", None).map(|f| f.lat), Some(25.6));
        // Near another net, the same words are another search.
        assert_ne!(cache_key("Main St & 5th", Some((25.6, -80.4))), cache_key("main st & 5th", Some((28.5, -81.4))));
        assert_eq!(cache_key("Main St & 5th", Some((25.61, -80.41))), cache_key("main st & 5th", Some((25.6, -80.4))));
    }
}



