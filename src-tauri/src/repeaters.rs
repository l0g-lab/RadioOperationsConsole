//! The repeater directory (docs/features/repeater-directory.md): each
//! repeater kept once, with its offset and tones, so activities can be set up
//! from it. Retired repeaters are hidden, never deleted.

use crate::repo::Repository;
use chrono::Utc;
use rusqlite::params;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

/// The standard CTCSS (PL) tones, in Hz (RPT-003). The same list CHIRP uses.
pub const CTCSS_TONES: [&str; 50] = [
    "67.0", "69.3", "71.9", "74.4", "77.0", "79.7", "82.5", "85.4", "88.5", "91.5", "94.8", "97.4",
    "100.0", "103.5", "107.2", "110.9", "114.8", "118.8", "123.0", "127.3", "131.8", "136.5",
    "141.3", "146.2", "151.4", "156.7", "159.8", "162.2", "165.5", "167.9", "171.3", "173.8",
    "177.3", "179.9", "183.5", "186.2", "189.9", "192.8", "196.6", "199.5", "203.5", "206.5",
    "210.7", "218.1", "225.7", "229.1", "233.6", "241.8", "250.3", "254.1",
];

/// The standard DCS codes (RPT-003). The same list CHIRP uses.
pub const DCS_CODES: [&str; 104] = [
    "023", "025", "026", "031", "032", "036", "043", "047", "051", "053", "054", "065", "071",
    "072", "073", "074", "114", "115", "116", "122", "125", "131", "132", "134", "143", "145",
    "152", "155", "156", "162", "165", "172", "174", "205", "212", "223", "225", "226", "243",
    "244", "245", "246", "251", "252", "255", "261", "263", "265", "266", "271", "274", "306",
    "311", "315", "325", "331", "332", "343", "346", "351", "356", "364", "365", "371", "411",
    "412", "413", "423", "431", "432", "445", "446", "452", "454", "455", "462", "464", "465",
    "466", "503", "506", "516", "523", "526", "532", "546", "565", "606", "612", "624", "627",
    "631", "632", "654", "662", "664", "703", "712", "723", "731", "732", "734", "743", "754",
];

/// A repeater as stored and listed.
#[derive(Serialize, Debug, Clone, PartialEq)]
pub struct Repeater {
    pub id: String,
    #[serde(flatten)]
    pub details: RepeaterDetails,
    /// When it was retired, or empty while in use.
    pub retired_at: String,
}

/// What the operator enters for a repeater.
#[derive(Deserialize, Serialize, Debug, Clone, PartialEq, Default)]
pub struct RepeaterDetails {
    pub name: String,
    pub output_mhz: f64,
    /// Signed: the input is output + offset. 0 is simplex.
    pub offset_mhz: f64,
    /// "none", "pl" or "dcs".
    pub tone_in_kind: String,
    /// "100.0" for PL, "023N" / "023I" for DCS, empty for none.
    pub tone_in: String,
    pub tone_out_kind: String,
    pub tone_out: String,
    pub mode: String,
    pub location_label: String,
    pub location_lat: Option<f64>,
    pub location_lon: Option<f64>,
    pub notes: String,
}

fn check_tone(kind: &str, value: &str, which: &str) -> Result<(), String> {
    match kind {
        "none" => Ok(()),
        "pl" if CTCSS_TONES.contains(&value) => Ok(()),
        "pl" => Err(format!("{which} tone \"{value}\" isn't a standard PL tone.")),
        "dcs" => {
            let (code, polarity) = value.split_at(value.len().saturating_sub(1));
            if DCS_CODES.contains(&code) && (polarity == "N" || polarity == "I") {
                Ok(())
            } else {
                Err(format!("{which} tone \"{value}\" isn't a standard DCS code with N or I polarity."))
            }
        }
        _ => Err(format!("{which} tone type \"{kind}\" should be none, PL or DCS.")),
    }
}

/// Checks and tidies what was entered (RPT-001–004).
pub fn clean(mut d: RepeaterDetails) -> Result<RepeaterDetails, String> {
    d.name = d.name.trim().to_string();
    d.mode = d.mode.trim().to_string();
    d.notes = d.notes.trim().to_string();
    d.location_label = d.location_label.trim().to_string();
    if d.name.is_empty() {
        return Err("A repeater needs a name.".into());
    }
    if !(d.output_mhz.is_finite() && (1.0..=3000.0).contains(&d.output_mhz)) {
        return Err("The output frequency should be in MHz, for example 146.940.".into());
    }
    if !(d.offset_mhz.is_finite() && d.offset_mhz.abs() < 100.0) {
        return Err("The offset should be in MHz, for example 0.600.".into());
    }
    for kind in [&mut d.tone_in_kind, &mut d.tone_out_kind] {
        if kind.is_empty() {
            *kind = "none".into();
        }
    }
    check_tone(&d.tone_in_kind, &d.tone_in, "Input")?;
    check_tone(&d.tone_out_kind, &d.tone_out, "Output")?;
    if d.tone_in_kind == "none" {
        d.tone_in.clear();
    }
    if d.tone_out_kind == "none" {
        d.tone_out.clear();
    }
    if d.mode.is_empty() {
        d.mode = "FM".into();
    }
    if d.location_lat.is_none() != d.location_lon.is_none() {
        return Err("A location needs both latitude and longitude.".into());
    }
    Ok(d)
}

const COLS: &str = "id, name, output_mhz, offset_mhz, tone_in_kind, coalesce(tone_in,''), tone_out_kind, coalesce(tone_out,''), mode, coalesce(location_label,''), location_lat, location_lon, coalesce(notes,''), coalesce(retired_at,'')";

fn map(r: &rusqlite::Row) -> rusqlite::Result<Repeater> {
    Ok(Repeater {
        id: r.get(0)?,
        details: RepeaterDetails {
            name: r.get(1)?,
            output_mhz: r.get(2)?,
            offset_mhz: r.get(3)?,
            tone_in_kind: r.get(4)?,
            tone_in: r.get(5)?,
            tone_out_kind: r.get(6)?,
            tone_out: r.get(7)?,
            mode: r.get(8)?,
            location_label: r.get(9)?,
            location_lat: r.get(10)?,
            location_lon: r.get(11)?,
            notes: r.get(12)?,
        },
        retired_at: r.get(13)?,
    })
}

fn blank(s: &str) -> Option<&str> {
    if s.is_empty() { None } else { Some(s) }
}

impl Repository {
    /// In-use (or, with `retired`, retired) repeaters by output frequency (RPT-011).
    pub fn list_repeaters(&self, retired: bool) -> rusqlite::Result<Vec<Repeater>> {
        let filter = if retired { "IS NOT NULL" } else { "IS NULL" };
        let mut stmt = self.conn.prepare(&format!(
            "SELECT {COLS} FROM repeaters WHERE retired_at {filter} ORDER BY output_mhz, name COLLATE NOCASE"
        ))?;
        let rows = stmt.query_map([], map)?;
        rows.collect()
    }

    pub fn get_repeater(&self, id: &str) -> rusqlite::Result<Repeater> {
        self.conn
            .query_row(&format!("SELECT {COLS} FROM repeaters WHERE id = ?1"), params![id], map)
    }

    /// Adds a repeater (already checked with `clean`).
    pub fn create_repeater(&self, d: &RepeaterDetails) -> rusqlite::Result<String> {
        let id = Uuid::new_v4().to_string();
        self.conn.execute(
            "INSERT INTO repeaters(id, name, output_mhz, offset_mhz, tone_in_kind, tone_in, tone_out_kind, tone_out, mode, location_label, location_lat, location_lon, notes, created_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14)",
            params![id, d.name, d.output_mhz, d.offset_mhz, d.tone_in_kind, blank(&d.tone_in), d.tone_out_kind, blank(&d.tone_out), d.mode, blank(&d.location_label), d.location_lat, d.location_lon, blank(&d.notes), Utc::now().to_rfc3339()],
        )?;
        Ok(id)
    }

    /// Replaces a repeater's details (already checked with `clean`). Activities
    /// set up from it keep their own copies (RPT-012).
    pub fn update_repeater(&self, id: &str, d: &RepeaterDetails) -> rusqlite::Result<()> {
        let n = self.conn.execute(
            "UPDATE repeaters SET name = ?1, output_mhz = ?2, offset_mhz = ?3, tone_in_kind = ?4, tone_in = ?5, tone_out_kind = ?6, tone_out = ?7, mode = ?8, location_label = ?9, location_lat = ?10, location_lon = ?11, notes = ?12 WHERE id = ?13",
            params![d.name, d.output_mhz, d.offset_mhz, d.tone_in_kind, blank(&d.tone_in), d.tone_out_kind, blank(&d.tone_out), d.mode, blank(&d.location_label), d.location_lat, d.location_lon, blank(&d.notes), id],
        )?;
        if n == 0 {
            return Err(rusqlite::Error::QueryReturnedNoRows);
        }
        Ok(())
    }

    /// Hides (or, with `retired` false, restores) a repeater (RPT-010).
    pub fn set_repeater_retired(&self, id: &str, retired: bool) -> rusqlite::Result<()> {
        let at = retired.then(|| Utc::now().to_rfc3339());
        self.conn
            .execute("UPDATE repeaters SET retired_at = ?1 WHERE id = ?2", params![at, id])?;
        Ok(())
    }

    /// Sets an activity's repeater, or clears it with no point (RPT-021, RPT-023).
    pub fn set_activity_repeater(
        &self,
        activity_id: &str,
        name: Option<&str>,
        lat: Option<f64>,
        lon: Option<f64>,
    ) -> rusqlite::Result<()> {
        self.conn.execute(
            "UPDATE activities SET repeater_name = ?1, repeater_lat = ?2, repeater_lon = ?3 WHERE id = ?4",
            params![name, lat, lon, activity_id],
        )?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn repo() -> Repository {
        let path = std::env::temp_dir().join(format!("roc-rpt-{}.db", Uuid::new_v4()));
        Repository::new(crate::db::open_db(&path).unwrap())
    }

    fn w4abc() -> RepeaterDetails {
        RepeaterDetails {
            name: " W4ABC Orlando ".into(),
            output_mhz: 146.94,
            offset_mhz: -0.6,
            tone_in_kind: "pl".into(),
            tone_in: "100.0".into(),
            tone_out_kind: "none".into(),
            location_label: "Downtown".into(),
            location_lat: Some(28.54),
            location_lon: Some(-81.38),
            ..Default::default()
        }
    }

    #[test]
    fn entries_are_checked_and_tidied() {
        // RPT-001, RPT-003, RPT-004
        let d = clean(w4abc()).unwrap();
        assert_eq!((d.name.as_str(), d.mode.as_str()), ("W4ABC Orlando", "FM"));

        let bad = |f: fn(&mut RepeaterDetails)| {
            let mut d = w4abc();
            f(&mut d);
            clean(d).unwrap_err()
        };
        assert!(bad(|d| d.name = "  ".into()).contains("name"));
        assert!(bad(|d| d.output_mhz = 0.0).contains("output frequency"));
        assert!(bad(|d| d.offset_mhz = f64::NAN).contains("offset"));
        assert!(bad(|d| d.tone_in = "100".into()).contains("standard PL"));
        assert!(bad(|d| {
            d.tone_in_kind = "dcs".into();
            d.tone_in = "023".into();
        })
        .contains("DCS"));
        assert!(bad(|d| d.location_lon = None).contains("both"));

        let mut dcs = w4abc();
        dcs.tone_in_kind = "dcs".into();
        dcs.tone_in = "023N".into();
        dcs.tone_out_kind = "none".into();
        dcs.tone_out = "leftover".into();
        let dcs = clean(dcs).unwrap();
        assert_eq!(dcs.tone_out, "", "no tone means no value");
    }

    #[test]
    fn repeaters_are_listed_by_frequency_edited_and_retired() {
        // RPT-010, RPT-011
        let r = repo();
        let uhf = r
            .create_repeater(&clean(RepeaterDetails { name: "K4UHF".into(), output_mhz: 444.5, offset_mhz: 5.0, ..Default::default() }).unwrap())
            .unwrap();
        let vhf = r.create_repeater(&clean(w4abc()).unwrap()).unwrap();
        let names = |list: Vec<Repeater>| list.into_iter().map(|x| x.details.name).collect::<Vec<_>>();
        assert_eq!(names(r.list_repeaters(false).unwrap()), ["W4ABC Orlando", "K4UHF"]);

        let mut changed = clean(w4abc()).unwrap();
        changed.tone_in = "103.5".into();
        r.update_repeater(&vhf, &changed).unwrap();
        assert_eq!(r.get_repeater(&vhf).unwrap().details.tone_in, "103.5");
        assert!(r.update_repeater("missing", &changed).is_err());

        r.set_repeater_retired(&uhf, true).unwrap();
        assert_eq!(names(r.list_repeaters(false).unwrap()), ["W4ABC Orlando"]);
        assert_eq!(names(r.list_repeaters(true).unwrap()), ["K4UHF"]);
        r.set_repeater_retired(&uhf, false).unwrap();
        assert_eq!(r.list_repeaters(false).unwrap().len(), 2);
    }

    #[test]
    fn an_activitys_repeater_is_its_own_copy() {
        // RPT-012, RPT-021
        let r = repo();
        let a = r.create_activity("Tuesday Net", "directed_net", None, None).unwrap();
        r.set_activity_repeater(&a, Some("W4ABC Orlando"), Some(28.54), Some(-81.38)).unwrap();
        let act = r.get_activity(&a).unwrap();
        assert_eq!((act.repeater_name.as_str(), act.repeater_lat), ("W4ABC Orlando", Some(28.54)));
        assert_eq!(act.location_lat, None, "the activity's own location is untouched");
        r.set_activity_repeater(&a, None, None, None).unwrap();
        assert_eq!(r.get_activity(&a).unwrap().repeater_lat, None);
    }
}
