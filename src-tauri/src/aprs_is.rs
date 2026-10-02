use chrono::Utc;
use serde::Serialize;
use std::time::Duration;
use tauri::{AppHandle, Emitter};
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::net::TcpStream;
use tokio::sync::watch;

// A public APRS-IS access point for North America — no account or dedicated
// server needed, same tier of service aprs.fi itself is fed by. Was
// rotate.aprs2.net, which round-robins across many backend nodes; switched
// to this fixed regional one after rotate landed us on a node that rejected
// the login outright ("Login by user not allowed") for an unverified call
// sign, which noam.aprs2.net does not do (confirmed live).
const APRS_IS_SERVER: &str = "noam.aprs2.net:14580";
// APRS-IS logins normally need a passcode derived from the call sign to
// transmit, but -1 explicitly requests a read-only session (no ability to
// inject packets) and is accepted for any call sign — this is documented,
// sanctioned behavior for exactly this "just listen" use case, not a
// workaround.
const READONLY_PASSCODE: &str = "-1";
const CONNECT_TIMEOUT: Duration = Duration::from_secs(10);
const HANDSHAKE_TIMEOUT: Duration = Duration::from_secs(8);

#[derive(Serialize, Debug, Clone)]
pub struct AprsIsPacket {
    pub source: String,
    pub dest: String,
    pub path: String,
    pub raw: String,
    pub lat: Option<f64>,
    pub lon: Option<f64>,
    pub comment: Option<String>,
    pub symbol: Option<String>,
    pub received_at: String,
}

/// Handle to a running APRS-IS stream task. The task keeps running until
/// `stop()` is called (or the connection drops on its own) — dropping this
/// handle without calling `stop()` does not stop it.
pub struct AprsIsStreamHandle {
    stop_tx: watch::Sender<bool>,
}

impl AprsIsStreamHandle {
    pub fn stop(&self) {
        let _ = self.stop_tx.send(true);
    }
}

/// Connects to APRS-IS read-only, applies a radius filter around (lat, lon)
/// (APRS-IS has no county/state boundary concept — a radius around a point
/// is the closest equivalent it supports), and emits a Tauri `aprs-is-packet`
/// event for every packet received until `stop()` is called on the returned
/// handle. Entirely free of the app's other network dependencies (no API
/// key), but it's a live feed, not a historical query — packets only start
/// arriving from the moment this connects, same as tuning in a radio.
pub async fn start_stream(
    app: AppHandle,
    login_call: String,
    lat: f64,
    lon: f64,
    radius_km: u32,
) -> Result<AprsIsStreamHandle, String> {
    // Some APRS-IS nodes reject well-known junk placeholder call signs
    // (N0CALL, NOCALL, ...) as abuse-prone — hit this live on a node behind
    // rotate.aprs2.net ("Login by user not allowed"), which is part of why
    // this now targets noam.aprs2.net specifically. Requiring a real call
    // sign here sidesteps the whole question and is better etiquette
    // regardless; the caller (start_aprs_is_stream) enforces it isn't empty.
    let login_call = login_call.trim().to_uppercase();

    let stream = tokio::time::timeout(CONNECT_TIMEOUT, TcpStream::connect(APRS_IS_SERVER))
        .await
        .map_err(|_| "Timed out connecting to APRS-IS".to_string())?
        .map_err(|e| format!("Couldn't connect to APRS-IS: {e}"))?;

    let (read_half, mut write_half) = stream.into_split();
    let mut reader = BufReader::new(read_half);

    let login_line = build_login_line(&login_call, lat, lon, radius_km);
    write_half
        .write_all(login_line.as_bytes())
        .await
        .map_err(|e| format!("Couldn't send APRS-IS login: {e}"))?;

    // Writing the login line always succeeds even if the server is about to
    // reject it outright (e.g. "Login by user not allowed" for a
    // blocklisted call sign, seen live on a rotate.aprs2.net node) — without
    // checking the response, that would silently look like a successful,
    // permanently-empty stream instead of an error. The server also sends
    // its own software banner ("# aprsc ...") immediately on connect,
    // before it's even seen our login, so that alone isn't a pass/fail
    // signal — wait specifically for the "logresp" line that answers it.
    let mut line = String::new();
    loop {
        line.clear();
        let read = tokio::time::timeout(HANDSHAKE_TIMEOUT, reader.read_line(&mut line))
            .await
            .map_err(|_| "Timed out waiting for APRS-IS to respond to login".to_string())?
            .map_err(|e| format!("Error reading APRS-IS response: {e}"))?;
        if read == 0 {
            return Err("APRS-IS closed the connection before responding to login".to_string());
        }
        let trimmed = line.trim_end_matches(['\r', '\n']);
        let lower = trimmed.to_ascii_lowercase();
        if lower.contains("logresp") {
            // "unverified" here is normal and expected for a read-only
            // (-1 passcode) login, not a failure.
            break;
        }
        if lower.contains("not allowed") || lower.contains("invalid") {
            return Err(format!("APRS-IS rejected the login: {trimmed}"));
        }
        // Anything else at this point is the server's own banner/comment
        // text — keep reading until we get an actual answer to our login.
    }

    let (stop_tx, mut stop_rx) = watch::channel(false);

    tauri::async_runtime::spawn(async move {
        // Never written to again, but held here for the task's lifetime on
        // purpose: dropping a tokio `OwnedWriteHalf` half-closes that side
        // of the socket (sends a TCP FIN), and aprsc treats that as "the
        // client is gone" and tears down the whole connection within a
        // packet or two of it happening — exactly the "got one packet, then
        // APRS-IS closed the connection" symptom this fixes.
        let _write_half = write_half;
        let mut line = String::new();
        let mut ended_reason: Option<String> = None;
        loop {
            line.clear();
            tokio::select! {
                _ = stop_rx.changed() => break,
                result = reader.read_line(&mut line) => {
                    match result {
                        Ok(0) => {
                            ended_reason = Some("APRS-IS closed the connection".to_string());
                            break;
                        }
                        Ok(_) => {
                            let trimmed = line.trim_end_matches(['\r', '\n']);
                            // Server comment/keepalive lines start with '#'.
                            if trimmed.is_empty() || trimmed.starts_with('#') {
                                continue;
                            }
                            if let Some(packet) = parse_packet(trimmed) {
                                let _ = app.emit("aprs-is-packet", packet);
                            }
                        }
                        Err(e) => {
                            ended_reason = Some(format!("APRS-IS connection error: {e}"));
                            break;
                        }
                    }
                }
            }
        }
        // Only announce this if the connection ended on its own — an
        // explicit stop() already means the frontend knows it stopped.
        if let Some(reason) = ended_reason {
            let _ = app.emit("aprs-is-stream-ended", reason);
        }
    });

    Ok(AprsIsStreamHandle { stop_tx })
}

/// Builds the APRS-IS login line: `user CALL pass PASS vers NAME VER filter
/// FILTER`, terminated `\r\n` per the protocol. `login_call` is expected to
/// already be trimmed/uppercased. The radius filter (`r/lat/lon/km`) is what
/// keeps this to a chosen area — APRS-IS has no county/state filter type, so
/// this is the closest equivalent it supports, and dropping it would mean
/// receiving the entire network's traffic instead.
fn build_login_line(login_call: &str, lat: f64, lon: f64, radius_km: u32) -> String {
    format!(
        "user {login_call} pass {READONLY_PASSCODE} vers RadioOpsConsole {} filter r/{lat:.4}/{lon:.4}/{radius_km}\r\n",
        crate::net::APP_VERSION
    )
}

/// Parses one line of APRS-IS traffic (TNC2 format: `SRC>DEST,PATH:payload`)
/// into a packet, tolerant of anything malformed or unrecognized rather than
/// erroring, since this is untrusted data straight off the network.
fn parse_packet(line: &str) -> Option<AprsIsPacket> {
    let (header, payload) = line.split_once(':')?;
    let (source, rest) = header.split_once('>')?;
    let mut path_parts = rest.splitn(2, ',');
    let dest = path_parts.next().unwrap_or_default().to_string();
    let path = path_parts.next().unwrap_or_default().to_string();

    let (lat, lon, comment, symbol) = parse_position(payload);

    Some(AprsIsPacket {
        source: source.to_string(),
        dest,
        path,
        raw: line.to_string(),
        lat,
        lon,
        comment,
        symbol,
        received_at: Utc::now().to_rfc3339(),
    })
}

type PositionFields = (Option<f64>, Option<f64>, Option<String>, Option<String>);

/// Extracts a position from an APRS payload if it's an uncompressed position
/// report. Compressed and Mic-E position encodings aren't decoded here, and
/// other data types (telemetry, status, weather, objects, messages, ...)
/// aren't parsed at all — in every case the packet still comes through (for
/// the raw feed), with the undecoded payload text as its comment so there's
/// still something to show, just without lat/lon.
fn parse_position(payload: &str) -> PositionFields {
    let mut chars = payload.chars();
    let dti = match chars.next() {
        Some(c) => c,
        None => return (None, None, None, None),
    };
    let body = chars.as_str();

    match dti {
        '!' | '=' => parse_position_body(body),
        // Position-with-timestamp formats carry a fixed 7-character
        // timestamp (e.g. "092345z") before the position data.
        '/' | '@' => match body.get(7..) {
            Some(rest) => parse_position_body(rest),
            None => (None, None, Some(body.to_string()), None),
        },
        _ if !body.is_empty() => (None, None, Some(body.to_string()), None),
        _ => (None, None, None, None),
    }
}

fn parse_position_body(body: &str) -> PositionFields {
    if body.is_empty() {
        return (None, None, None, None);
    }
    if !body.as_bytes()[0].is_ascii_digit() {
        // Compressed or Mic-E encoding — not decoded (yet); still surface
        // the packet without a plottable position.
        return (None, None, Some(body.to_string()), None);
    }
    match parse_uncompressed_coords(body) {
        Some((lat, lon)) => {
            let symbol = body.get(18..19).map(|s| s.to_string());
            let comment = body
                .get(19..)
                .filter(|s| !s.is_empty())
                .map(|s| s.to_string());
            (Some(lat), Some(lon), comment, symbol)
        }
        None => (None, None, Some(body.to_string()), None),
    }
}

/// Decodes the fixed-width uncompressed position format:
/// `DDMM.mmN` + symbol table char + `DDDMM.mmW` (19 bytes total).
fn parse_uncompressed_coords(body: &str) -> Option<(f64, f64)> {
    let bytes = body.as_bytes();
    if bytes.len() < 19 || !bytes[..19].is_ascii() {
        return None;
    }

    let field = |range: std::ops::Range<usize>| std::str::from_utf8(&bytes[range]).ok();

    let lat_deg: f64 = field(0..2)?.parse().ok()?;
    let lat_min: f64 = field(2..7)?.parse().ok()?;
    let lat_hemi = bytes[7] as char;
    let lon_deg: f64 = field(9..12)?.parse().ok()?;
    let lon_min: f64 = field(12..17)?.parse().ok()?;
    let lon_hemi = bytes[17] as char;

    if !matches!(lat_hemi, 'N' | 'S') || !matches!(lon_hemi, 'E' | 'W') {
        return None;
    }

    let mut lat = lat_deg + lat_min / 60.0;
    if lat_hemi == 'S' {
        lat = -lat;
    }
    let mut lon = lon_deg + lon_min / 60.0;
    if lon_hemi == 'W' {
        lon = -lon;
    }

    if !(-90.0..=90.0).contains(&lat) || !(-180.0..=180.0).contains(&lon) {
        return None;
    }
    Some((lat, lon))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn login_line_matches_the_known_good_wire_format() {
        // Same shape as `user N0CALL pass -1 vers netcat 1.0 filter
        // r/39/-98/3000`, hand-verified against noam.aprs2.net with netcat —
        // just our own app identity in the vers field instead of netcat's.
        let line = build_login_line("N0CALL", 39.0, -98.0, 3000);
        assert_eq!(
            line,
            format!(
                "user N0CALL pass -1 vers RadioOpsConsole {} filter r/39.0000/-98.0000/3000\r\n",
                env!("CARGO_PKG_VERSION")
            )
        );
    }

    #[test]
    fn parses_uncompressed_position_without_timestamp() {
        let packet =
            parse_packet("W0LAB-9>APRS,TCPIP*,qAC,T2TEXAS:!3959.00N/09832.00W>Test comment")
                .expect("should parse");
        assert_eq!(packet.source, "W0LAB-9");
        assert_eq!(packet.dest, "APRS");
        assert_eq!(packet.path, "TCPIP*,qAC,T2TEXAS");
        assert!((packet.lat.unwrap() - 39.9833).abs() < 1e-3);
        assert!((packet.lon.unwrap() - -98.5333).abs() < 1e-3);
        assert_eq!(packet.symbol.as_deref(), Some(">"));
        assert_eq!(packet.comment.as_deref(), Some("Test comment"));
    }

    #[test]
    fn parses_uncompressed_position_with_timestamp() {
        let packet = parse_packet("N0CALL>APRS,WIDE1-1:/092345z4903.50N/07201.75W-Test")
            .expect("should parse");
        assert!((packet.lat.unwrap() - 49.0583).abs() < 1e-3);
        assert!((packet.lon.unwrap() - -72.0292).abs() < 1e-3);
        assert_eq!(packet.symbol.as_deref(), Some("-"));
        assert_eq!(packet.comment.as_deref(), Some("Test"));
    }

    #[test]
    fn south_and_east_hemispheres_negate_correctly() {
        let packet = parse_packet("VK2ABC>APRS:!3352.00S/15112.00E-Sydney").expect("should parse");
        assert!(packet.lat.unwrap() < 0.0);
        assert!(packet.lon.unwrap() > 0.0);
    }

    #[test]
    fn compressed_or_unrecognized_position_has_no_coords_but_still_parses() {
        let packet = parse_packet("W1AW>APRS:!/5L!!<*e7>7P[Test").expect("should parse");
        assert_eq!(packet.source, "W1AW");
        assert!(packet.lat.is_none());
        assert!(packet.lon.is_none());
    }

    #[test]
    fn non_position_packet_still_parses_without_coords() {
        let packet = parse_packet("W1AW>APRS::BLN1     :Test bulletin").expect("should parse");
        assert!(packet.lat.is_none());
        assert!(packet.lon.is_none());
    }

    #[test]
    fn malformed_line_returns_none() {
        assert!(parse_packet("not a valid aprs line").is_none());
    }

    /// Real lines captured live from rotate.aprs2.net (Mic-E, telemetry,
    /// weather, object, and non-ASCII-adjacent formats) — regression
    /// coverage against actual network mess, not just hand-built samples.
    /// The only requirement here is "doesn't panic and gets the callsign
    /// right"; several of these intentionally have no decoded position.
    #[test]
    fn real_world_captured_lines_do_not_panic() {
        let lines = [
            (
                "K0TOC-9>S9STWQ,qAR,KK0X-10:`q.boguv/`\"MY}White 4Runner_1",
                "K0TOC-9",
            ),
            (
                "KC0FRM>APFII0,TCPIP*,qAC,APRSFI:@011015h3851.93N/10447.93W-236/000/A=006188aprs.fi iOS!w#T!",
                "KC0FRM",
            ),
            (
                "SNOWMS>APMI04,TCPIP*,qAC,T2LANE:T#228,181,014,002,061,000,00000000",
                "SNOWMS",
            ),
            (
                "MNARCH>APMI04,TCPIP*,qAC,T2VAN:@010024z3830.37NT10620.72W&WX3in1Mini U=12.3V.   Monarch Igate n0nhj",
                "MNARCH",
            ),
            (
                "KC0QXX>APIN22,TCPIP*,qAC,T2RDU:!3852.28N\\10735.19W-PinPoint APRS v2.2",
                "KC0QXX",
            ),
            (
                "N2XGL-5>APRX29,TCPIP*,qAC,T2USANW:;147.270CO*111111z4009.79N/10506.07WrT100 R65m Net Th8PM",
                "N2XGL-5",
            ),
        ];
        for (line, expected_source) in lines {
            let packet = parse_packet(line).unwrap_or_else(|| panic!("should parse: {line}"));
            assert_eq!(packet.source, expected_source);
        }
    }

    #[test]
    fn kc0frm_timestamped_position_decodes_correctly() {
        // The one line above with a clean, standard uncompressed position —
        // worth pinning down exactly, not just "didn't panic".
        let packet = parse_packet(
            "KC0FRM>APFII0,TCPIP*,qAC,APRSFI:@011015h3851.93N/10447.93W-236/000/A=006188aprs.fi iOS!w#T!",
        )
        .unwrap();
        assert!((packet.lat.unwrap() - 38.8655).abs() < 1e-3);
        assert!((packet.lon.unwrap() - -104.7988).abs() < 1e-3);
    }
}
