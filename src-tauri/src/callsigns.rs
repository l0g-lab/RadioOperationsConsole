//! Offline U.S. call-sign directories, built from the FCC's public license
//! databases: one file for amateur licenses and one for GMRS, each
//! downloaded, built and removed on its own (see `Service`). Each record holds a call sign with its licensee's name,
//! street address, city, state and ZIP — enough to fill in a check-in when
//! QRZ isn't available (offline, or not configured). Map pins are still
//! placed by ZIP area: the street address is stored as text for the
//! check-in, not geocoded.
//!
//! The file is built on this computer by downloading the FCC's weekly full
//! database (a large one-time-per-refresh download) and boiling it down to
//! one record per active license. It isn't bundled with the app, so the
//! software stays light; operators download it when they want it.
//!
//! The on-disk format is versioned and each record carries an optional
//! coordinate pair. Nothing writes coordinates today, but files that include
//! them (say, if street addresses are ever geocoded) will load without any
//! change to the lookup code.

use crate::net::{self, FetchError, USER_AGENT};
use flate2::{read::GzDecoder, write::GzEncoder, Compression};
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::io::{BufRead, Read, Write};
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::Duration;

/// Which FCC license file a directory is built from. Both use the same ULS
/// record layout (HD for status, EN for the licensee), so they share the
/// download, build and lookup code and differ only in these names.
#[derive(Deserialize, Serialize, Debug, Clone, Copy, PartialEq, Eq, Hash)]
#[serde(rename_all = "lowercase")]
pub enum Service {
    Amateur,
    Gmrs,
}

impl Service {
    pub fn url(self) -> &'static str {
        match self {
            Service::Amateur => "https://data.fcc.gov/download/pub/uls/complete/l_amat.zip",
            Service::Gmrs => "https://data.fcc.gov/download/pub/uls/complete/l_gmrs.zip",
        }
    }

    /// The built directory. The amateur name predates GMRS and must not change,
    /// or existing installs would look missing.
    pub fn pack_file(self) -> &'static str {
        match self {
            Service::Amateur => "callsigns-us.bin.gz",
            Service::Gmrs => "callsigns-us-gmrs.bin.gz",
        }
    }

    /// Names the directory in `datapack-progress` events.
    pub fn pack_id(self) -> &'static str {
        match self {
            Service::Amateur => "callsigns-us",
            Service::Gmrs => "callsigns-us-gmrs",
        }
    }

    fn part_file(self) -> &'static str {
        match self {
            Service::Amateur => "fcc-l_amat.zip.part",
            Service::Gmrs => "fcc-l_gmrs.zip.part",
        }
    }

    fn source_credit(self) -> &'static str {
        match self {
            Service::Amateur => "FCC Universal Licensing System — amateur radio licenses (public)",
            Service::Gmrs => "FCC Universal Licensing System — GMRS licenses (public)",
        }
    }
}
const CONNECT_TIMEOUT: Duration = Duration::from_secs(10);
/// A big download is fine; a download that stops moving is not. If no data
/// arrives for this long the attempt fails (and can be resumed).
pub const STALL_TIMEOUT: Duration = Duration::from_secs(30);

const MAGIC: &[u8; 8] = b"ROCCALLS";
/// Version 2 added the street address; version 1 files still load (with no street).
const FORMAT_VERSION: u8 = 2;
const FLAG_COORDS: u8 = 1;

#[derive(Serialize, Debug, Clone, PartialEq)]
pub struct CallRecord {
    pub call: String,
    pub name: String,
    /// Street or PO box line; empty when the file predates street addresses
    /// or the FCC record has none.
    pub street: String,
    pub city: String,
    pub state: String,
    /// Five digits, or empty when the FCC record has none.
    pub zip: String,
    /// Reserved for files that carry geocoded positions (lat, lon).
    pub coords: Option<(f64, f64)>,
}

// ------------------------------------------------------------------- format

fn push_str8(out: &mut Vec<u8>, s: &str) {
    let mut end = s.len().min(255);
    while !s.is_char_boundary(end) {
        end -= 1;
    }
    out.push(end as u8);
    out.extend_from_slice(&s.as_bytes()[..end]);
}

fn push_str16(out: &mut Vec<u8>, s: &str) {
    let mut end = s.len().min(u16::MAX as usize);
    while !s.is_char_boundary(end) {
        end -= 1;
    }
    out.extend_from_slice(&(end as u16).to_le_bytes());
    out.extend_from_slice(&s.as_bytes()[..end]);
}

/// Serializes records (which must be sorted by call sign, one per call) into
/// the pack format: a small header, an offset index, then the record data.
pub fn encode(records: &[CallRecord], generated_at: &str, service: Service) -> Vec<u8> {
    encode_versioned(records, generated_at, FORMAT_VERSION, service)
}

fn encode_versioned(
    records: &[CallRecord],
    generated_at: &str,
    version: u8,
    service: Service,
) -> Vec<u8> {
    let mut blob: Vec<u8> = Vec::with_capacity(records.len() * 40);
    let mut offsets: Vec<u32> = Vec::with_capacity(records.len());
    for r in records {
        offsets.push(blob.len() as u32);
        push_str8(&mut blob, &r.call);
        push_str8(&mut blob, &r.name);
        if version >= 2 {
            push_str8(&mut blob, &r.street);
        }
        push_str8(&mut blob, &r.city);
        let st = r.state.as_bytes();
        blob.extend_from_slice(&[*st.first().unwrap_or(&b' '), *st.get(1).unwrap_or(&b' ')]);
        blob.extend_from_slice(&r.zip.parse::<u32>().unwrap_or(0).to_le_bytes());
        match r.coords {
            Some((lat, lon)) => {
                blob.push(FLAG_COORDS);
                blob.extend_from_slice(&((lat * 1e5).round() as i32).to_le_bytes());
                blob.extend_from_slice(&((lon * 1e5).round() as i32).to_le_bytes());
            }
            None => blob.push(0),
        }
    }
    let mut out = Vec::with_capacity(blob.len() + offsets.len() * 4 + 128);
    out.extend_from_slice(MAGIC);
    out.push(version);
    out.extend_from_slice(&(records.len() as u32).to_le_bytes());
    push_str16(&mut out, generated_at);
    push_str16(&mut out, service.source_credit());
    for o in &offsets {
        out.extend_from_slice(&o.to_le_bytes());
    }
    out.extend_from_slice(&blob);
    out
}

struct Reader<'a> {
    b: &'a [u8],
    pos: usize,
}

impl<'a> Reader<'a> {
    fn take(&mut self, n: usize) -> Option<&'a [u8]> {
        let s = self.b.get(self.pos..self.pos.checked_add(n)?)?;
        self.pos += n;
        Some(s)
    }
    fn u8(&mut self) -> Option<u8> {
        self.take(1).map(|s| s[0])
    }
    fn u16(&mut self) -> Option<u16> {
        self.take(2).map(|s| u16::from_le_bytes([s[0], s[1]]))
    }
    fn u32(&mut self) -> Option<u32> {
        self.take(4)
            .map(|s| u32::from_le_bytes([s[0], s[1], s[2], s[3]]))
    }
    fn i32(&mut self) -> Option<i32> {
        self.u32().map(|v| v as i32)
    }
    fn str8(&mut self) -> Option<&'a str> {
        let n = self.u8()? as usize;
        std::str::from_utf8(self.take(n)?).ok()
    }
    fn str16(&mut self) -> Option<&'a str> {
        let n = self.u16()? as usize;
        std::str::from_utf8(self.take(n)?).ok()
    }
}

#[derive(Serialize, Debug, Clone, PartialEq)]
pub struct DbInfo {
    pub version: u8,
    pub record_count: u32,
    pub generated_at: String,
    pub source: String,
}

fn parse_header(b: &[u8]) -> Result<(DbInfo, usize), String> {
    let mut r = Reader { b, pos: 0 };
    if r.take(8) != Some(&MAGIC[..]) {
        return Err("not a call-sign file".into());
    }
    let version = r.u8().ok_or("truncated file")?;
    if version == 0 || version > FORMAT_VERSION {
        return Err(format!("unsupported call-sign file version {version}"));
    }
    let record_count = r.u32().ok_or("truncated file")?;
    let generated_at = r.str16().ok_or("truncated file")?.to_string();
    let source = r.str16().ok_or("truncated file")?.to_string();
    Ok((
        DbInfo {
            version,
            record_count,
            generated_at,
            source,
        },
        r.pos,
    ))
}

/// A loaded call-sign directory: the file's bytes plus an offset index, so
/// lookups are a binary search without unpacking ~800,000 records.
pub struct CallDb {
    bytes: Vec<u8>,
    blob_start: usize,
    offsets: Vec<u32>,
    pub info: DbInfo,
}

// A derived Debug would print the whole file; show just the summary.
impl std::fmt::Debug for CallDb {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(
            f,
            "CallDb({} records, {})",
            self.info.record_count, self.info.generated_at
        )
    }
}

impl CallDb {
    pub fn from_bytes(bytes: Vec<u8>) -> Result<CallDb, String> {
        let (info, after_header) = parse_header(&bytes)?;
        let n = info.record_count as usize;
        let blob_start = after_header + n * 4;
        if blob_start > bytes.len() {
            return Err("truncated file".into());
        }
        let offsets: Vec<u32> = bytes[after_header..blob_start]
            .chunks_exact(4)
            .map(|c| u32::from_le_bytes([c[0], c[1], c[2], c[3]]))
            .collect();
        Ok(CallDb {
            bytes,
            blob_start,
            offsets,
            info,
        })
    }

    fn call_at(&self, i: usize) -> Option<&str> {
        let mut r = Reader {
            b: &self.bytes,
            pos: self.blob_start + *self.offsets.get(i)? as usize,
        };
        r.str8()
    }

    fn record_at(&self, i: usize) -> Option<CallRecord> {
        let mut r = Reader {
            b: &self.bytes,
            pos: self.blob_start + *self.offsets.get(i)? as usize,
        };
        let call = r.str8()?.to_string();
        let name = r.str8()?.to_string();
        let street = if self.info.version >= 2 {
            r.str8()?.to_string()
        } else {
            String::new()
        };
        let city = r.str8()?.to_string();
        let state = std::str::from_utf8(r.take(2)?).ok()?.trim().to_string();
        let zip = match r.u32()? {
            0 => String::new(),
            z => format!("{z:05}"),
        };
        let coords = if r.u8()? & FLAG_COORDS != 0 {
            Some((r.i32()? as f64 / 1e5, r.i32()? as f64 / 1e5))
        } else {
            None
        };
        Some(CallRecord {
            call,
            name,
            street,
            city,
            state,
            zip,
            coords,
        })
    }

    fn find(&self, key: &str) -> Option<CallRecord> {
        let (mut lo, mut hi) = (0usize, self.offsets.len());
        while lo < hi {
            let mid = (lo + hi) / 2;
            match self.call_at(mid)?.cmp(key) {
                std::cmp::Ordering::Equal => return self.record_at(mid),
                std::cmp::Ordering::Less => lo = mid + 1,
                std::cmp::Ordering::Greater => hi = mid,
            }
        }
        None
    }

    /// Looks a call sign up. Operators often say portable/mobile suffixes
    /// ("W4TST/M", "KC1TST/P") that aren't part of the license, so if the
    /// whole thing isn't found each slash-separated part is tried.
    pub fn lookup(&self, call: &str) -> Option<CallRecord> {
        let key = call.trim().to_uppercase();
        if key.is_empty() {
            return None;
        }
        if let Some(r) = self.find(&key) {
            return Some(r);
        }
        key.split('/')
            .filter(|p| p.len() >= 3 && p.chars().any(|c| c.is_ascii_digit()))
            .find_map(|p| self.find(p))
    }
}

pub fn compress(raw: &[u8]) -> Result<Vec<u8>, String> {
    let mut enc = GzEncoder::new(Vec::new(), Compression::new(6));
    enc.write_all(raw).map_err(|e| e.to_string())?;
    enc.finish().map_err(|e| e.to_string())
}

pub fn load_file(path: &Path) -> Result<CallDb, String> {
    let file = std::fs::File::open(path).map_err(|e| e.to_string())?;
    let mut raw = Vec::new();
    GzDecoder::new(std::io::BufReader::new(file))
        .read_to_end(&mut raw)
        .map_err(|e| format!("couldn't read the call-sign file: {e}"))?;
    CallDb::from_bytes(raw)
}

/// Reads just the header (record count, date) without unpacking the whole
/// file, so showing the file's status in Settings is instant.
pub fn read_info(path: &Path) -> Option<DbInfo> {
    let file = std::fs::File::open(path).ok()?;
    let mut head = Vec::new();
    GzDecoder::new(file)
        .take(4096)
        .read_to_end(&mut head)
        .ok()?;
    parse_header(&head).ok().map(|(i, _)| i)
}

pub fn save_file(path: &Path, raw: &[u8]) -> Result<u64, String> {
    if let Some(dir) = path.parent() {
        std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    }
    let gz = compress(raw)?;
    let tmp = path.with_extension("gz.tmp");
    std::fs::write(&tmp, &gz).map_err(|e| e.to_string())?;
    std::fs::rename(&tmp, path).map_err(|e| e.to_string())?;
    Ok(gz.len() as u64)
}

// ------------------------------------------------------------ FCC data files

/// Reads FCC pipe-delimited lines. The files are Latin-1, not UTF-8.
fn for_each_line<R: BufRead>(
    mut reader: R,
    mut f: impl FnMut(&[String], u64),
) -> Result<(), String> {
    let mut buf = Vec::new();
    let mut consumed = 0u64;
    loop {
        buf.clear();
        let n = reader
            .read_until(b'\n', &mut buf)
            .map_err(|e| e.to_string())?;
        if n == 0 {
            return Ok(());
        }
        consumed += n as u64;
        let line: String = buf.iter().map(|&b| b as char).collect();
        let fields: Vec<String> = line
            .trim_end_matches(['\r', '\n'])
            .split('|')
            .map(String::from)
            .collect();
        f(&fields, consumed);
    }
}

/// "SMITH" -> "Smith", "O'BRIEN" -> "O'Brien", "MARY-ANN" -> "Mary-Ann";
/// roman-numeral suffixes stay upper-case.
fn title_case(s: &str) -> String {
    s.split(' ')
        .filter(|w| !w.is_empty())
        .map(|w| {
            if matches!(w, "II" | "III" | "IV" | "VI") {
                return w.to_string();
            }
            let mut out = String::with_capacity(w.len());
            let mut start = true;
            for ch in w.chars() {
                if start {
                    out.extend(ch.to_uppercase());
                } else {
                    out.extend(ch.to_lowercase());
                }
                start = matches!(ch, '-' | '\'' | '.');
            }
            out
        })
        .collect::<Vec<_>>()
        .join(" ")
}

fn build_name(first: &str, last: &str, entity: &str) -> String {
    if !first.trim().is_empty() && !last.trim().is_empty() {
        format!("{} {}", title_case(first.trim()), title_case(last.trim()))
    } else {
        title_case(entity.trim())
    }
}

fn is_ordinal(w: &str) -> bool {
    let digits = w.chars().take_while(|c| c.is_ascii_digit()).count();
    digits > 0
        && matches!(
            &w[digits..],
            "ST" | "ND" | "RD" | "TH" | "st" | "nd" | "rd" | "th"
        )
}

/// The FCC's street lines are usually already mixed-case ("214 S. Main
/// St"); some are ALL CAPS. Leave good ones alone and tidy the shouting
/// ones without mangling directionals or ordinals ("NW 33RD CT" ->
/// "NW 33rd Ct").
fn tidy_street(s: &str) -> String {
    if s.chars().any(|c| c.is_lowercase()) {
        return s.to_string();
    }
    s.split(' ')
        .filter(|w| !w.is_empty())
        .map(|w| {
            if matches!(
                w,
                "NE" | "NW" | "SE" | "SW" | "PO" | "PMB" | "II" | "III" | "IV"
            ) {
                w.to_string()
            } else if is_ordinal(w) {
                w.to_lowercase()
            } else if w.chars().next().is_some_and(|c| c.is_ascii_digit()) {
                w.to_string()
            } else {
                title_case(w)
            }
        })
        .collect::<Vec<_>>()
        .join(" ")
}

/// A street line, or a PO box line when that's all the licensee gave.
fn build_street(street: &str, po_box: &str) -> String {
    let street = street.trim();
    let po = po_box.trim();
    if !street.is_empty() {
        tidy_street(street)
    } else if po.is_empty() {
        String::new()
    } else if po.to_uppercase().starts_with("PO") || po.to_uppercase().starts_with("P.O") {
        tidy_street(po)
    } else {
        format!("PO Box {po}")
    }
}

/// Builds one record per *active* license from the FCC's two files:
/// `HD.dat` says which licenses (by USI) are active, `EN.dat` holds each
/// licensee's name and address. Joining on the license, not the call sign,
/// keeps a call sign's old expired licenses from shadowing its current one.
/// `progress` receives the bytes of EN.dat read so far.
pub fn parse_fcc<H: BufRead, E: BufRead>(
    hd: H,
    en: E,
    mut progress: impl FnMut(u64),
) -> Result<Vec<CallRecord>, String> {
    let mut active: HashSet<u64> = HashSet::new();
    for_each_line(hd, |f, _| {
        // HD: record type | USI | ULS file# | EBF# | call sign | license status ...
        if f.len() > 5 && f[5] == "A" {
            if let Ok(usi) = f[1].trim().parse::<u64>() {
                active.insert(usi);
            }
        }
    })?;
    if active.is_empty() {
        return Err(
            "The FCC data had no active licenses — the file's format may have changed.".into(),
        );
    }

    let mut by_call: HashMap<String, CallRecord> = HashMap::with_capacity(active.len());
    let mut last_report = 0u64;
    for_each_line(en, |f, consumed| {
        if consumed - last_report >= 4_000_000 {
            last_report = consumed;
            progress(consumed);
        }
        // EN: record type | USI | ULS file# | EBF# | call sign | entity type |
        //     licensee id | entity name | first | MI | last | suffix | phone |
        //     fax | email | street | city | state | zip | PO box ...
        if f.len() < 19 || f[5] != "L" {
            return;
        }
        let Ok(usi) = f[1].trim().parse::<u64>() else { return };
        if !active.contains(&usi) {
            return;
        }
        let call = f[4].trim().to_uppercase();
        if call.is_empty() || by_call.contains_key(&call) {
            return;
        }
        let zip_digits: String = f[18]
            .chars()
            .take_while(|c| c.is_ascii_digit())
            .take(5)
            .collect();
        let zip = if zip_digits.len() == 5 {
            zip_digits
        } else {
            String::new()
        };
        by_call.insert(
            call.clone(),
            CallRecord {
                call,
                name: build_name(&f[8], &f[10], &f[7]),
                street: build_street(&f[15], f.get(19).map(String::as_str).unwrap_or("")),
                city: title_case(f[16].trim()),
                state: f[17].trim().to_uppercase(),
                zip,
                coords: None,
            },
        );
    })?;
    let mut records: Vec<CallRecord> = by_call.into_values().collect();
    if records.is_empty() {
        return Err("No licensee records were found in the FCC data.".into());
    }
    records.sort_by(|a, b| a.call.cmp(&b.call));
    Ok(records)
}

// ----------------------------------------------------------------- download

fn part_path(dir: &Path, service: Service) -> PathBuf {
    dir.join(service.part_file())
}

fn meta_path(dir: &Path, service: Service) -> PathBuf {
    dir.join(format!("{}.meta", service.part_file()))
}

const TIMED_OUT_MESSAGE: &str =
    "The connection stalled — run the update again to pick up where it left off.";

fn timed_out() -> FetchError {
    FetchError::Other(TIMED_OUT_MESSAGE.into())
}

fn map_send_error(e: reqwest::Error) -> FetchError {
    net::map_send_error(e, TIMED_OUT_MESSAGE)
}

/// Downloads the FCC file to a `.part` file in `dir`, resuming where an
/// earlier attempt stopped when the server still has the same version of the
/// file (checked with `If-Range`, so half of last week's file is never glued
/// onto this week's). `progress` gets (bytes so far, total bytes).
pub async fn download_fcc(
    service: Service,
    url: &str,
    dir: &Path,
    stall: Duration,
    progress: &(dyn Fn(u64, u64) + Sync),
    cancelled: &(dyn Fn() -> bool + Sync),
) -> Result<PathBuf, FetchError> {
    use tokio::io::AsyncWriteExt;
    if net::working_offline() {
        return Err(FetchError::Offline);
    }
    std::fs::create_dir_all(dir).map_err(|e| FetchError::Other(e.to_string()))?;
    let part = part_path(dir, service);
    let meta = meta_path(dir, service);
    let client =
        net::client(CONNECT_TIMEOUT, None).map_err(|e| FetchError::Other(e.to_string()))?;

    for attempt in 0..2 {
        let existing = std::fs::metadata(&part).map(|m| m.len()).unwrap_or(0);
        let validator = std::fs::read_to_string(&meta)
            .unwrap_or_default()
            .trim()
            .to_string();
        let mut req = client.get(url).header("User-Agent", USER_AGENT);
        if existing > 0 && !validator.is_empty() {
            req = req
                .header("Range", format!("bytes={existing}-"))
                .header("If-Range", validator);
        }
        let mut resp = tokio::time::timeout(stall, req.send())
            .await
            .map_err(|_| timed_out())?
            .map_err(map_send_error)?;

        let (mut written, total, append) = match resp.status().as_u16() {
            206 => {
                let remaining = resp.content_length().unwrap_or(0);
                (existing, existing + remaining, true)
            }
            200 => {
                let total = resp.content_length().unwrap_or(0);
                let tag = resp
                    .headers()
                    .get("etag")
                    .or_else(|| resp.headers().get("last-modified"))
                    .and_then(|v| v.to_str().ok())
                    .unwrap_or("")
                    .to_string();
                let _ = std::fs::write(&meta, tag);
                (0, total, false)
            }
            416 if attempt == 0 => {
                // Our partial file doesn't fit what the server has: start over.
                let _ = std::fs::remove_file(&part);
                let _ = std::fs::remove_file(&meta);
                continue;
            }
            code => {
                return Err(FetchError::Other(format!(
                    "The FCC server returned HTTP {code}."
                )))
            }
        };

        let mut file = tokio::fs::OpenOptions::new()
            .create(true)
            .write(true)
            .append(append)
            .truncate(!append)
            .open(&part)
            .await
            .map_err(|e| FetchError::Other(format!("Couldn't write the download: {e}")))?;
        progress(written, total);
        loop {
            // Turning "Work offline" on stops the download; what arrived is
            // kept so running the update again resumes (UX-023).
            if net::working_offline() {
                let _ = file.flush().await;
                return Err(FetchError::Other(
                    "Stopped because you're working offline — run the update again when back online to pick up where it left off.".into(),
                ));
            }
            // Cancelled by the operator (CALLDIR-037): kept, like a dropped connection.
            if cancelled() {
                let _ = file.flush().await;
                return Err(FetchError::Other(
                    "Cancelled — downloading again picks up where it left off.".into(),
                ));
            }
            match tokio::time::timeout(stall, resp.chunk()).await {
                Err(_) => return Err(timed_out()),
                Ok(Err(e)) => {
                    let _ = file.flush().await;
                    return Err(FetchError::Other(format!(
                        "The connection dropped ({e}) — run the update again to pick up where it left off."
                    )));
                }
                Ok(Ok(None)) => break,
                Ok(Ok(Some(chunk))) => {
                    file.write_all(&chunk).await.map_err(|e| {
                        FetchError::Other(format!("Couldn't write the download: {e}"))
                    })?;
                    written += chunk.len() as u64;
                    progress(written, total.max(written));
                }
            }
        }
        file.flush()
            .await
            .map_err(|e| FetchError::Other(e.to_string()))?;
        if total > 0 && written < total {
            return Err(FetchError::Other(
                "The download ended early — run the update again to pick up where it left off."
                    .into(),
            ));
        }
        let _ = std::fs::remove_file(&meta);
        return Ok(part);
    }
    Err(FetchError::Other(
        "The download couldn't be resumed — try again.".into(),
    ))
}

/// Reads EN.dat and HD.dat out of the downloaded FCC zip and builds the
/// finished, sorted record list.
pub fn read_fcc_zip(
    zip_path: &Path,
    progress: impl FnMut(u64, u64),
) -> Result<Vec<CallRecord>, String> {
    let mut progress = progress;
    let open = |name: &str| -> Result<Vec<u8>, String> {
        // HD.dat is only needed for its status column; read it whole (small
        // once reduced) but stream EN.dat.
        let file = std::fs::File::open(zip_path).map_err(|e| e.to_string())?;
        let mut zip = zip::ZipArchive::new(file).map_err(|_| {
            "The downloaded file wasn't a valid zip — try the update again.".to_string()
        })?;
        let mut entry = zip.by_name(name).map_err(|_| {
            format!("The FCC file didn't contain {name} — its format may have changed.")
        })?;
        let mut v = Vec::with_capacity(entry.size() as usize);
        entry.read_to_end(&mut v).map_err(|e| e.to_string())?;
        Ok(v)
    };
    let hd = open("HD.dat")?;
    let file = std::fs::File::open(zip_path).map_err(|e| e.to_string())?;
    let mut zip = zip::ZipArchive::new(file).map_err(|_| {
        "The downloaded file wasn't a valid zip — try the update again.".to_string()
    })?;
    let en_entry = zip.by_name("EN.dat").map_err(|_| {
        "The FCC file didn't contain EN.dat — its format may have changed.".to_string()
    })?;
    let en_size = en_entry.size();
    parse_fcc(
        std::io::BufReader::new(&hd[..]),
        std::io::BufReader::new(en_entry),
        |done| progress(done, en_size),
    )
}

pub type ProgressFn = Arc<dyn Fn(&'static str, u64, u64) + Send + Sync>;

/// The whole update: download the FCC database, boil it down, save it. The
/// finished file replaces the old one only once it's complete and valid.
pub async fn build_and_install(
    service: Service,
    url: &str,
    dir: &Path,
    progress: ProgressFn,
    cancelled: &(dyn Fn() -> bool + Sync),
) -> Result<CallDb, FetchError> {
    let p = progress.clone();
    let zip_path = download_fcc(
        service,
        url,
        dir,
        STALL_TIMEOUT,
        &move |d, t| p("downloading", d, t),
        cancelled,
    )
    .await?;

    let p = progress.clone();
    let zp = zip_path.clone();
    let records =
        tauri::async_runtime::spawn_blocking(move || read_fcc_zip(&zp, |d, t| p("reading", d, t)))
            .await
            .map_err(|e| FetchError::Other(e.to_string()))?
            .map_err(|e| {
                // A file that won't parse is useless to resume; clear it.
                let _ = std::fs::remove_file(&zip_path);
                FetchError::Other(e)
            })?;

    progress("saving", 0, 0);
    let dir = dir.to_path_buf();
    let db = tauri::async_runtime::spawn_blocking(move || -> Result<CallDb, String> {
        let raw = encode(&records, &chrono::Utc::now().to_rfc3339(), service);
        save_file(&dir.join(service.pack_file()), &raw)?;
        let _ = std::fs::remove_file(part_path(&dir, service));
        CallDb::from_bytes(raw)
    })
    .await
    .map_err(|e| FetchError::Other(e.to_string()))?
    .map_err(FetchError::Other)?;
    Ok(db)
}

#[cfg(test)]
mod tests {
    use super::*;
    use tokio::io::{AsyncReadExt, AsyncWriteExt};
    use tokio::net::TcpListener;

    fn rec(call: &str, name: &str, city: &str, state: &str, zip: &str) -> CallRecord {
        CallRecord {
            call: call.into(),
            name: name.into(),
            street: format!("{} Test St", call.len()),
            city: city.into(),
            state: state.into(),
            zip: zip.into(),
            coords: None,
        }
    }

    fn sample() -> Vec<CallRecord> {
        vec![
            rec("K1TST", "Jamie Example", "Lakeside", "FL", "33101"),
            rec("KC1TST", "Pat Sample", "Fairview", "FL", "33199"),
            rec("W1AW", "Arrl Hq Station", "Newington", "CT", "06111"),
            rec("W4TST", "Chris Tester", "Rivertown", "FL", "33055"),
        ]
    }

    fn temp_dir(tag: &str) -> PathBuf {
        let d = std::env::temp_dir().join(format!("roc-calls-{tag}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&d);
        d
    }

    // ---- format ----

    #[test]
    fn round_trips_and_looks_up() {
        let db = CallDb::from_bytes(encode(&sample(), "2026-09-20T00:00:00Z", Service::Amateur))
            .unwrap();
        assert_eq!(db.info.record_count, 4);
        assert_eq!(db.info.generated_at, "2026-09-20T00:00:00Z");
        assert_eq!(db.lookup("W4TST").unwrap(), sample()[3]);
        assert_eq!(db.lookup("  w1aw ").unwrap().city, "Newington");
        assert_eq!(db.lookup("W1AW").unwrap().zip, "06111", "leading zero kept");
        assert!(db.lookup("N0PE").is_none());
        assert!(db.lookup("").is_none());
        for r in sample() {
            assert_eq!(db.lookup(&r.call).unwrap(), r, "{}", r.call);
        }
    }

    #[test]
    fn portable_and_mobile_suffixes_still_find_the_license() {
        let db = CallDb::from_bytes(encode(&sample(), "t", Service::Amateur)).unwrap();
        assert_eq!(db.lookup("W4TST/M").unwrap().call, "W4TST");
        assert_eq!(db.lookup("kc1tst/p").unwrap().call, "KC1TST");
        assert_eq!(db.lookup("VE3/W4TST").unwrap().call, "W4TST");
        assert!(db.lookup("/M").is_none());
    }

    #[test]
    fn a_missing_zip_and_unicode_survive() {
        let r = vec![rec("W1AB", "José Peña", "Añasco", "PR", "")];
        let db = CallDb::from_bytes(encode(&r, "t", Service::Amateur)).unwrap();
        assert_eq!(db.lookup("W1AB").unwrap(), r[0]);
    }

    #[test]
    fn files_with_coordinates_load_without_lookup_changes() {
        // Nothing writes coordinates today; this is what a future geocoded
        // file would look like, and it must load with the same lookup code.
        let mut with = sample();
        with[1].coords = Some((25.61510, -80.33986));
        let db = CallDb::from_bytes(encode(&with, "t", Service::Amateur)).unwrap();
        let got = db.lookup("KC1TST").unwrap();
        let (lat, lon) = got.coords.unwrap();
        assert!((lat - 25.61510).abs() < 1e-5 && (lon - -80.33986).abs() < 1e-5);
        assert!(db.lookup("W4TST").unwrap().coords.is_none());
    }

    #[test]
    fn corrupt_files_are_rejected_not_trusted() {
        assert!(CallDb::from_bytes(b"nonsense".to_vec()).is_err());
        let good = encode(&sample(), "t", Service::Amateur);
        assert!(
            CallDb::from_bytes(good[..20].to_vec()).is_err(),
            "truncated"
        );
        let mut future = good.clone();
        future[8] = 99;
        assert!(CallDb::from_bytes(future).unwrap_err().contains("version"));
        // Bad offsets can't make lookups panic.
        let mut bad = good.clone();
        let db = CallDb::from_bytes(good).unwrap();
        let hdr = bad.len() - db.bytes.len() + db.blob_start - db.offsets.len() * 4;
        bad[hdr..hdr + 4].copy_from_slice(&u32::MAX.to_le_bytes());
        let db = CallDb::from_bytes(bad).unwrap();
        let _ = db.lookup("K1TST");
        let _ = db.lookup("W4TST");
    }

    #[test]
    fn saved_files_reload_and_report_their_info_quickly() {
        let dir = temp_dir("save");
        let path = dir.join(Service::Amateur.pack_file());
        let size = save_file(
            &path,
            &encode(&sample(), "2026-01-02T03:04:05Z", Service::Amateur),
        )
        .unwrap();
        assert!(size > 0 && path.exists());
        let info = read_info(&path).unwrap();
        assert_eq!(
            (info.record_count, info.generated_at.as_str()),
            (4, "2026-01-02T03:04:05Z")
        );
        assert_eq!(
            load_file(&path).unwrap().lookup("W1AW").unwrap().state,
            "CT"
        );
        assert!(read_info(&dir.join("missing.gz")).is_none());
        let _ = std::fs::remove_dir_all(&dir);
    }

    // ---- reading the FCC's files ----

    fn fixture() -> (String, String) {
        // HD: USI 1 active, USI 2 expired, USI 3 active (club), USI 4 active,
        //     USI 5 active (older license for a call whose newer one is USI 4)
        let hd = "HD|1|||W4TST|A
HD|2|||K9OLD|E
HD|3|||W4ARC|A
HD|4|||KC1TST|A
HD|5|||KC1TST|C
";
        // EN: EN|usi|||call|type|id|entity|first|mi|last|suffix|phone|fax|email|street|city|state|zip
        let en = [
            "EN|1|||W4TST|L|L1|TESTER, CHRIS|CHRIS||TESTER||||| 1 Main St|RIVERTOWN|FL|33055|",
            "EN|1|||W4TST|CL|L1|SOMEONE ELSE|X||Y||||| PO Box 1|ELSEWHERE|TX|75001|",
            "EN|2|||K9OLD|L|L2|OLD, TIMER|TIMER||OLD||||| 2 Oak|CHICAGO|IL|60601|",
            "EN|3|||W4ARC|L|L3|MIAMI AMATEUR RADIO CLUB|||||||| 3 Elm|MIAMI|FL|331570000|",
            "EN|4|||KC1TST|L|L4|SAMPLE, PAT|PAT||SAMPLE|III|||| 4 Pine|FAIRVIEW|FL|33199-1234|",
            "EN|5|||KC1TST|L|L4|SAMPLE, PAT|PAT||SAMPLE||||| 9 Stale Rd|OLD TOWN|GA|30301|",
            "EN|6|||N0ZIP|L|L6|NO, ZIP|NO||ZIP||||| 5 Rd|HONOLULU|HI||",
        ]
        .join("\r\n");
        (hd.to_string(), en)
    }

    #[test]
    fn keeps_one_current_record_per_active_license() {
        let (hd, en) = fixture();
        let recs = parse_fcc(hd.as_bytes(), en.as_bytes(), |_| {}).unwrap();
        let calls: Vec<&str> = recs.iter().map(|r| r.call.as_str()).collect();
        assert_eq!(
            calls,
            vec!["KC1TST", "W4ARC", "W4TST"],
            "expired, cancelled and contact rows dropped; sorted"
        );
        let tst = recs.iter().find(|r| r.call == "W4TST").unwrap();
        assert_eq!(
            (
                tst.name.as_str(),
                tst.city.as_str(),
                tst.state.as_str(),
                tst.zip.as_str()
            ),
            ("Chris Tester", "Rivertown", "FL", "33055")
        );
        let club = recs.iter().find(|r| r.call == "W4ARC").unwrap();
        assert_eq!(
            club.name, "Miami Amateur Radio Club",
            "clubs use the entity name"
        );
        assert_eq!(club.zip, "33157", "ZIP+4 trimmed to five digits");
        let kc = recs.iter().find(|r| r.call == "KC1TST").unwrap();
        assert_eq!(
            kc.city, "Fairview",
            "the active license's address, not the stale one"
        );
        assert_eq!(kc.zip, "33199");
    }

    #[test]
    fn keeps_the_street_address() {
        let (hd, en) = fixture();
        let recs = parse_fcc(hd.as_bytes(), en.as_bytes(), |_| {}).unwrap();
        let street = |c: &str| recs.iter().find(|r| r.call == c).unwrap().street.clone();
        assert_eq!(street("W4TST"), "1 Main St", "trimmed");
        assert_eq!(
            street("KC1TST"),
            "4 Pine",
            "the active license's street, not the stale one"
        );
        assert_eq!(street("W4ARC"), "3 Elm");
    }

    #[test]
    fn a_po_box_stands_in_when_there_is_no_street() {
        let hd = "HD|8|||W1PO|A\nHD|9|||W1P2|A\nHD|10|||W1P3|A\n";
        let en = [
            "EN|8|||W1PO|L|L8|X|PAT||BOX||||||ANYTOWN|FL|33101|298832",
            "EN|9|||W1P2|L|L9|X|PAT||BOX||||||ANYTOWN|FL|33101|PO BOX 77",
            "EN|10|||W1P3|L|L10|X|PAT||BOX||||||CITY|FL|33101|",
        ]
        .join("\n");
        let recs = parse_fcc(hd.as_bytes(), en.as_bytes(), |_| {}).unwrap();
        let street = |c: &str| recs.iter().find(|r| r.call == c).unwrap().street.clone();
        assert_eq!(street("W1PO"), "PO Box 298832");
        assert_eq!(street("W1P2"), "PO Box 77", "already labeled: not doubled");
        assert_eq!(street("W1P3"), "", "nothing to show");
    }

    #[test]
    fn street_casing_is_tidied_only_when_shouting() {
        assert_eq!(
            tidy_street("214 S. Main St"),
            "214 S. Main St",
            "already fine: untouched"
        );
        assert_eq!(tidy_street("15401 NW 33RD CT"), "15401 NW 33rd Ct");
        assert_eq!(tidy_street("1032 NE 35TH AVE"), "1032 NE 35th Ave");
        assert_eq!(tidy_street("PO BOX 298832"), "PO Box 298832");
        assert_eq!(
            tidy_street("12321 SW 99TH ST APT 12A"),
            "12321 SW 99th St Apt 12A"
        );
        assert_eq!(
            tidy_street("100 MARTIN LUTHER KING JR BLVD"),
            "100 Martin Luther King Jr Blvd"
        );
    }

    #[test]
    fn files_from_before_street_addresses_still_load() {
        // A version-1 file (an earlier download) has no street field.
        let recs = sample();
        let db = CallDb::from_bytes(encode_versioned(
            &recs,
            "2026-01-01T00:00:00Z",
            1,
            Service::Amateur,
        ))
        .unwrap();
        assert_eq!(db.info.version, 1);
        let got = db.lookup("W4TST").unwrap();
        assert_eq!(got.street, "", "no street in an old file");
        assert_eq!(
            (got.name.as_str(), got.city.as_str(), got.zip.as_str()),
            ("Chris Tester", "Rivertown", "33055")
        );
        let db2 = CallDb::from_bytes(encode(&recs, "t", Service::Amateur)).unwrap();
        assert_eq!(db2.info.version, 2);
        assert_eq!(db2.lookup("W4TST").unwrap().street, recs[3].street);
    }

    #[test]
    fn a_missing_zip_is_left_empty() {
        let hd = "HD|6|||N0ZIP|A\n";
        let en = "EN|6|||N0ZIP|L|L6|NO, ZIP|NO||ZIP||||| 5 Rd|HONOLULU|HI||\n";
        let recs = parse_fcc(hd.as_bytes(), en.as_bytes(), |_| {}).unwrap();
        assert_eq!(recs[0].zip, "");
        assert_eq!(recs[0].city, "Honolulu");
    }

    #[test]
    fn latin1_names_decode() {
        let hd = "HD|7|||W1AB|A\n".to_string();
        let mut en: Vec<u8> = b"EN|7|||W1AB|L|L7|X|JOS".to_vec();
        en.push(0xC9); // 'É' in Latin-1
        en.extend_from_slice(b"||PE\xD1A||||| 1 St|ANASCO|PR|00610|\n");
        let recs = parse_fcc(hd.as_bytes(), &en[..], |_| {}).unwrap();
        assert_eq!(recs[0].name, "José Peña");
    }

    #[test]
    fn an_fcc_format_change_is_reported_not_swallowed() {
        assert!(parse_fcc(&b""[..], &b""[..], |_| {})
            .unwrap_err()
            .contains("no active licenses"));
        assert!(parse_fcc(&b"HD|1|||A1B|A\n"[..], &b"garbage\n"[..], |_| {})
            .unwrap_err()
            .contains("No licensee"));
    }

    #[test]
    fn title_casing() {
        assert_eq!(title_case("O'BRIEN"), "O'Brien");
        assert_eq!(title_case("MARY-ANN SMITH"), "Mary-Ann Smith");
        assert_eq!(title_case("JOHN III"), "John III");
        assert_eq!(title_case("  "), "");
    }

    fn zip_with(files: &[(&str, &str)]) -> Vec<u8> {
        use std::io::Write as _;
        let mut w = zip::ZipWriter::new(std::io::Cursor::new(Vec::new()));
        for (name, body) in files {
            w.start_file(*name, zip::write::SimpleFileOptions::default())
                .unwrap();
            w.write_all(body.as_bytes()).unwrap();
        }
        w.finish().unwrap().into_inner()
    }

    #[test]
    fn reads_records_out_of_a_zip() {
        let dir = temp_dir("zip");
        std::fs::create_dir_all(&dir).unwrap();
        let (hd, en) = fixture();
        let path = dir.join("l_amat.zip");
        std::fs::write(
            &path,
            zip_with(&[("HD.dat", &hd), ("EN.dat", &en), ("AM.dat", "x")]),
        )
        .unwrap();
        assert_eq!(read_fcc_zip(&path, |_, _| {}).unwrap().len(), 3);
        std::fs::write(&path, zip_with(&[("HD.dat", &hd)])).unwrap();
        assert!(read_fcc_zip(&path, |_, _| {})
            .unwrap_err()
            .contains("EN.dat"));
        std::fs::write(&path, b"this is not a zip").unwrap();
        assert!(read_fcc_zip(&path, |_, _| {})
            .unwrap_err()
            .contains("valid zip"));
        let _ = std::fs::remove_dir_all(&dir);
    }

    // ---- the download, against a throwaway local server ----

    struct Resp {
        status: &'static str,
        headers: Vec<(&'static str, String)>,
        body: Vec<u8>,
        /// Claim this many bytes but send only `body` (a dropped connection).
        claim_len: Option<usize>,
        /// Send headers, then never send the body.
        hang: bool,
    }

    impl Resp {
        fn ok(body: Vec<u8>, validator: &str) -> Resp {
            Resp {
                status: "200 OK",
                headers: vec![("ETag", validator.to_string())],
                body,
                claim_len: None,
                hang: false,
            }
        }
    }

    async fn serve<F>(handler: F) -> String
    where
        F: Fn(&str) -> Resp + Send + Sync + 'static,
    {
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr = listener.local_addr().unwrap();
        let handler = Arc::new(handler);
        tokio::spawn(async move {
            loop {
                let Ok((mut sock, _)) = listener.accept().await else { return };
                let handler = handler.clone();
                tokio::spawn(async move {
                    let mut buf = [0u8; 4096];
                    let n = sock.read(&mut buf).await.unwrap_or(0);
                    let req = String::from_utf8_lossy(&buf[..n]).to_string();
                    let r = handler(&req);
                    let mut head = format!(
                        "HTTP/1.1 {}\r\nContent-Length: {}\r\nConnection: close\r\n",
                        r.status,
                        r.claim_len.unwrap_or(r.body.len())
                    );
                    for (k, v) in &r.headers {
                        head.push_str(&format!("{k}: {v}\r\n"));
                    }
                    head.push_str("\r\n");
                    let _ = sock.write_all(head.as_bytes()).await;
                    if r.hang {
                        tokio::time::sleep(Duration::from_secs(60)).await;
                    } else {
                        let _ = sock.write_all(&r.body).await;
                    }
                });
            }
        });
        format!("http://{addr}/l_amat.zip")
    }

    fn run<T>(f: impl std::future::Future<Output = T>) -> T {
        tauri::async_runtime::block_on(f)
    }

    fn header_value(req: &str, name: &str) -> Option<String> {
        req.lines()
            .find(|l| {
                l.to_lowercase()
                    .starts_with(&format!("{}:", name.to_lowercase()))
            })
            .map(|l| l.split_once(':').unwrap().1.trim().to_string())
    }

    fn payload() -> Vec<u8> {
        (0..200_000u32).map(|i| (i % 251) as u8).collect()
    }

    fn get(url: &str, dir: &Path, stall: Duration) -> Result<PathBuf, String> {
        run(download_fcc(
            Service::Amateur,
            url,
            dir,
            stall,
            &|_, _| {},
            &|| false,
        ))
        .map_err(|e| match e {
            FetchError::Offline => "offline".into(),
            FetchError::Other(s) => s,
        })
    }

    #[test]
    fn downloads_the_whole_file_and_reports_progress() {
        let dir = temp_dir("dl");
        let data = payload();
        let d = data.clone();
        let url = run(serve(move |_| Resp::ok(d.clone(), "\"v1\"")));
        let seen = std::sync::Mutex::new(Vec::new());
        let path = run(download_fcc(
            Service::Amateur,
            &url,
            &dir,
            Duration::from_secs(5),
            &|d, t| seen.lock().unwrap().push((d, t)),
            &|| false,
        ))
        .ok()
        .unwrap();
        assert_eq!(std::fs::read(&path).unwrap(), data);
        let seen = seen.lock().unwrap();
        assert_eq!(seen.last().unwrap(), &(200_000, 200_000));
        assert!(
            seen.windows(2).all(|w| w[0].0 <= w[1].0),
            "progress only moves forward"
        );
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn resumes_a_partial_download_of_the_same_file() {
        let dir = temp_dir("resume");
        std::fs::create_dir_all(&dir).unwrap();
        let data = payload();
        std::fs::write(part_path(&dir, Service::Amateur), &data[..80_000]).unwrap();
        std::fs::write(meta_path(&dir, Service::Amateur), "\"v1\"").unwrap();
        let d = data.clone();
        let url = run(serve(move |req| {
            match (header_value(req, "range"), header_value(req, "if-range")) {
                (Some(r), Some(v)) if v == "\"v1\"" && r == "bytes=80000-" => Resp {
                    status: "206 Partial Content",
                    headers: vec![("Content-Range", "bytes 80000-199999/200000".into())],
                    body: d[80_000..].to_vec(),
                    claim_len: None,
                    hang: false,
                },
                _ => Resp::ok(vec![0; 10], "\"wrong\""),
            }
        }));
        let path = get(&url, &dir, Duration::from_secs(5)).unwrap();
        assert_eq!(
            std::fs::read(path).unwrap(),
            data,
            "second half appended to the first"
        );
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn a_changed_file_restarts_instead_of_gluing_versions_together() {
        let dir = temp_dir("changed");
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(part_path(&dir, Service::Amateur), vec![7u8; 50_000]).unwrap();
        std::fs::write(meta_path(&dir, Service::Amateur), "\"last-weeks-version\"").unwrap();
        let data = payload();
        let d = data.clone();
        // The server ignores the stale If-Range and sends the new file whole.
        let url = run(serve(move |_| {
            Resp::ok(d.clone(), "\"this-weeks-version\"")
        }));
        let path = get(&url, &dir, Duration::from_secs(5)).unwrap();
        assert_eq!(std::fs::read(path).unwrap(), data);
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn a_dropped_connection_keeps_the_partial_file_for_resuming() {
        let dir = temp_dir("drop");
        let data = payload();
        let half = data[..90_000].to_vec();
        let url = run(serve(move |_| Resp {
            status: "200 OK",
            headers: vec![("ETag", "\"v1\"".into())],
            body: half.clone(),
            claim_len: Some(200_000),
            hang: false,
        }));
        let err = get(&url, &dir, Duration::from_secs(5)).unwrap_err();
        assert!(err.contains("again"), "{err}");
        assert_eq!(
            std::fs::metadata(part_path(&dir, Service::Amateur))
                .unwrap()
                .len(),
            90_000,
            "progress kept"
        );
        assert_eq!(
            std::fs::read_to_string(meta_path(&dir, Service::Amateur)).unwrap(),
            "\"v1\"",
            "so it can resume the same version"
        );
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn a_stalled_connection_gives_up_instead_of_hanging() {
        let dir = temp_dir("stall");
        let url = run(serve(|_| Resp {
            status: "200 OK",
            headers: vec![],
            body: vec![],
            claim_len: Some(1_000_000),
            hang: true,
        }));
        let started = std::time::Instant::now();
        let err = get(&url, &dir, Duration::from_secs(1)).unwrap_err();
        assert!(err.contains("stalled"), "{err}");
        assert!(
            started.elapsed() < Duration::from_secs(5),
            "took {:?}",
            started.elapsed()
        );
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn server_trouble_and_no_connection_are_explained() {
        let dir = temp_dir("err");
        let url = run(serve(|_| Resp {
            status: "503 Service Unavailable",
            headers: vec![],
            body: b"busy".to_vec(),
            claim_len: None,
            hang: false,
        }));
        assert!(get(&url, &dir, Duration::from_secs(2))
            .unwrap_err()
            .contains("HTTP 503"));
        let dead = run(async {
            let l = TcpListener::bind("127.0.0.1:0").await.unwrap();
            let u = format!("http://{}/x", l.local_addr().unwrap());
            drop(l);
            u
        });
        assert_eq!(
            get(&dead, &dir, Duration::from_secs(2)).unwrap_err(),
            "offline"
        );
        let _ = std::fs::remove_dir_all(&dir);
    }

    // ---- working offline (UX-022, UX-023) ----

    #[test]
    fn working_offline_refuses_a_download_without_contacting_the_server() {
        let dir = temp_dir("work-offline");
        let hits = Arc::new(std::sync::atomic::AtomicUsize::new(0));
        let h = hits.clone();
        let url = run(serve(move |_| {
            h.fetch_add(1, std::sync::atomic::Ordering::SeqCst);
            Resp {
                status: "200 OK",
                headers: vec![],
                body: payload(),
                claim_len: None,
                hang: false,
            }
        }));
        crate::net::set_work_offline(true);
        let result = run(download_fcc(
            Service::Amateur,
            &url,
            &dir,
            Duration::from_secs(5),
            &|_, _| {},
            &|| false,
        ));
        crate::net::set_work_offline(false);
        assert!(matches!(result, Err(FetchError::Offline)));
        assert_eq!(hits.load(std::sync::atomic::Ordering::SeqCst), 0);
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn going_offline_mid_download_stops_it_and_keeps_the_part_to_resume() {
        let dir = temp_dir("work-offline-mid");
        let url = run(serve(move |_| Resp {
            status: "200 OK",
            headers: vec![],
            body: payload(),
            claim_len: None,
            hang: false,
        }));
        let result = run(download_fcc(
            Service::Amateur,
            &url,
            &dir,
            Duration::from_secs(5),
            &|done, _| {
                if done > 0 {
                    crate::net::set_work_offline(true);
                }
            },
            &|| false,
        ));
        crate::net::set_work_offline(false);
        let err = match result {
            Err(FetchError::Other(e)) => e,
            other => panic!("expected a stop, got ok={}", other.is_ok()),
        };
        assert!(err.contains("offline"), "{err}");
        assert!(
            std::fs::metadata(part_path(&dir, Service::Amateur))
                .unwrap()
                .len()
                > 0,
            "partial kept"
        );
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn cancelling_stops_the_download_and_keeps_the_part_to_resume() {
        let dir = temp_dir("cancel");
        let url = run(serve(move |_| Resp {
            status: "200 OK",
            headers: vec![],
            body: payload(),
            claim_len: None,
            hang: false,
        }));
        let cancelled = std::sync::atomic::AtomicBool::new(false);
        let result = run(download_fcc(
            Service::Amateur,
            &url,
            &dir,
            Duration::from_secs(5),
            &|done, _| {
                if done > 0 {
                    cancelled.store(true, std::sync::atomic::Ordering::SeqCst);
                }
            },
            &|| cancelled.load(std::sync::atomic::Ordering::SeqCst),
        ));
        match result {
            Err(FetchError::Other(e)) => assert!(e.contains("Cancelled"), "{e}"),
            other => panic!("expected a cancel, got ok={}", other.is_ok()),
        }
        assert!(
            std::fs::metadata(part_path(&dir, Service::Amateur))
                .unwrap()
                .len()
                > 0,
            "partial kept"
        );
        let _ = std::fs::remove_dir_all(&dir);
    }

    // ---- GMRS (CALLDIR-040) ----

    #[test]
    fn each_service_has_its_own_files_and_the_amateur_names_are_unchanged() {
        assert_eq!(
            Service::Amateur.pack_file(),
            "callsigns-us.bin.gz",
            "existing installs keep loading"
        );
        assert_ne!(Service::Gmrs.pack_file(), Service::Amateur.pack_file());
        assert_ne!(
            part_path(Path::new("d"), Service::Gmrs),
            part_path(Path::new("d"), Service::Amateur)
        );
        assert_ne!(
            meta_path(Path::new("d"), Service::Gmrs),
            meta_path(Path::new("d"), Service::Amateur)
        );
        assert!(Service::Gmrs.url().ends_with("/l_gmrs.zip"));
        assert!(Service::Amateur.url().ends_with("/l_amat.zip"));
    }

    #[test]
    fn services_are_named_as_the_interface_sends_them() {
        assert_eq!(
            serde_json::from_str::<Service>("\"gmrs\"").unwrap(),
            Service::Gmrs
        );
        assert_eq!(
            serde_json::from_str::<Service>("\"amateur\"").unwrap(),
            Service::Amateur
        );
        assert!(serde_json::from_str::<Service>("\"cb\"").is_err());
    }

    #[test]
    fn a_built_file_says_which_licenses_it_holds() {
        let gmrs = CallDb::from_bytes(encode(&sample(), "t", Service::Gmrs)).unwrap();
        assert!(gmrs.info.source.contains("GMRS"), "{}", gmrs.info.source);
        let ham = CallDb::from_bytes(encode(&sample(), "t", Service::Amateur)).unwrap();
        assert!(ham.info.source.contains("amateur"), "{}", ham.info.source);
    }

    #[test]
    fn reads_the_gmrs_file_which_has_no_operator_class_records() {
        // The GMRS zip has HD and EN like the amateur one, service code ZA, no AM.dat.
        let hd = "HD|10|||WRAB123|A|ZA|01/02/2024\nHD|11|||KAE1234|A|ZA|01/02/2020\nHD|12|||WROX999|E|ZA|01/02/2015\n";
        let en = [
            "EN|10|||WRAB123|L|L10|EXAMPLE, PAT|PAT||EXAMPLE||||| 1 Main St|ROSCOMMON|MI|486530000|",
            "EN|11|||KAE1234|L|L11|SAMPLE, LEE|LEE||SAMPLE||||| 2 Oak Ave|FLORENCE|AL|35630|",
            "EN|12|||WROX999|L|L12|GONE, OLD|OLD||GONE||||| 3 Elm|NOWHERE|TX|75001|",
        ]
        .join("\n");
        let recs = parse_fcc(hd.as_bytes(), en.as_bytes(), |_| {}).unwrap();
        let calls: Vec<&str> = recs.iter().map(|r| r.call.as_str()).collect();
        assert_eq!(calls, vec!["KAE1234", "WRAB123"], "expired license dropped");
        let pat = &recs[1];
        assert_eq!(
            (
                pat.name.as_str(),
                pat.street.as_str(),
                pat.city.as_str(),
                pat.zip.as_str()
            ),
            ("Pat Example", "1 Main St", "Roscommon", "48653")
        );
    }

    #[test]
    fn a_gmrs_download_leaves_a_half_finished_amateur_download_alone() {
        let dir = temp_dir("gmrs-separate");
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(part_path(&dir, Service::Amateur), vec![7u8; 1_000]).unwrap();
        std::fs::write(meta_path(&dir, Service::Amateur), "\"amat-v1\"").unwrap();
        let data = payload();
        let body = data.clone();
        let url = run(serve(move |_| Resp {
            status: "200 OK",
            headers: vec![],
            body: body.clone(),
            claim_len: None,
            hang: false,
        }));
        let path = run(download_fcc(
            Service::Gmrs,
            &url,
            &dir,
            Duration::from_secs(5),
            &|_, _| {},
            &|| false,
        ))
        .ok()
        .unwrap();
        assert_eq!(std::fs::read(path).unwrap(), data);
        assert_eq!(
            std::fs::metadata(part_path(&dir, Service::Amateur))
                .unwrap()
                .len(),
            1_000,
            "amateur partial kept"
        );
        assert_eq!(
            std::fs::read_to_string(meta_path(&dir, Service::Amateur)).unwrap(),
            "\"amat-v1\""
        );
        let _ = std::fs::remove_dir_all(&dir);
    }

    /// Not a real test: builds the GMRS directory from a downloaded
    /// `l_gmrs.zip` named by `ROC_GMRS_ZIP`, with no network involved.
    #[test]
    #[ignore]
    fn real_gmrs_zip() {
        let path =
            std::env::var("ROC_GMRS_ZIP").expect("set ROC_GMRS_ZIP to a downloaded l_gmrs.zip");
        let records = read_fcc_zip(Path::new(&path), |_, _| {}).expect("read failed");
        let db = CallDb::from_bytes(encode(&records, "t", Service::Gmrs)).unwrap();
        println!("{} GMRS licensees", db.info.record_count);
        assert!(db.info.record_count > 300_000);
        let first = &records[0];
        assert_eq!(
            db.lookup(&format!("{}/2", first.call)).as_ref(),
            Some(first),
            "unit suffix ignored"
        );
    }

    // ---- against the real FCC (needs internet; run by hand) ----

    /// Not a real test: the full update against the live FCC database —
    /// download (~200 MB), build, save, reload, look a few calls up.
    #[test]
    #[ignore]
    fn live_build() {
        let dir = std::env::temp_dir().join("roc-calls-live");
        let started = std::time::Instant::now();
        let progress: ProgressFn = Arc::new(|phase, d, t| {
            if t > 0 && d % 20_000_000 < 300_000 {
                println!("  {phase}: {} / {} MB", d / 1_000_000, t / 1_000_000);
            }
        });
        let db = run(build_and_install(
            Service::Amateur,
            Service::Amateur.url(),
            &dir,
            progress,
            &|| false,
        ))
        .ok()
        .expect("update failed");
        let size = std::fs::metadata(dir.join(Service::Amateur.pack_file()))
            .unwrap()
            .len();
        println!(
            "{} records, {:.1} MB on disk, {:.0}s total",
            db.info.record_count,
            size as f64 / 1e6,
            started.elapsed().as_secs_f32()
        );
        for call in ["W1AW", "N0CALL"] {
            println!("  {call}: {:?}", db.lookup(call));
        }
        assert!(db.info.record_count > 500_000);
        assert!(db.lookup("W1AW").is_some());
    }
}
