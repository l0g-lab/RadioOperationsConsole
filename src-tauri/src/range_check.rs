//! Range checks (docs/features/range-check.md): a net run to learn how far a
//! repeater reaches. Every check-in must say where the station is, what it
//! is running, and how well each side hears the other, so these rules are
//! checked here as well as on the entry form.

use crate::repo::ContactDetails;

/// The activity type's id, as stored on the activity (`activityTypes.ts`).
pub const RANGE_CHECK: &str = "range_check";

/// The only signal reports accepted, best to worst (RANGE-013).
pub const SIGNAL_REPORTS: [&str; 5] =
    ["Full quieting", "Slight noise", "Noisy but readable", "Broken", "Unreadable"];

/// Station types, as stored (RANGE-010).
pub const STATION_KINDS: [&str; 3] = ["mobile", "base", "ht"];

pub fn is_range_check(activity_type: &str) -> bool {
    activity_type == RANGE_CHECK
}

pub const NEEDS_REPEATER: &str =
    "Set the repeater's location on this range check (Operations tab) before taking check-ins.";

pub const REPEATER_REQUIRED: &str =
    "A range check needs the repeater's location. Set it before changing this activity to a range check.";

pub const REPEATER_CANNOT_CLEAR: &str =
    "A range check needs the repeater's location. Move it instead of clearing it.";

pub const POINT_CANNOT_CLEAR: &str =
    "A range-check check-in needs its point on the map. Move it instead of clearing it.";

/// Drops the antenna from anything but a base station (RANGE-012).
pub fn normalize(c: &mut ContactDetails) {
    if ContactDetails::field(&c.station_kind) != Some("base") {
        c.antenna = None;
    }
}

/// Refuses a check-in missing anything a range check needs, naming each
/// missing field, or carrying a value outside the fixed lists (RANGE-011,
/// RANGE-013). `has_point` is whether the station's map point is set.
pub fn validate(c: &ContactDetails, has_point: bool) -> Result<(), String> {
    let f = ContactDetails::field;
    let kind = f(&c.station_kind);
    if let Some(k) = kind {
        if !STATION_KINDS.contains(&k) {
            return Err(format!("\"{k}\" isn't a station type. Use mobile, base or HT."));
        }
    }
    for report in [f(&c.rst_sent), f(&c.rst_received)].into_iter().flatten() {
        if !SIGNAL_REPORTS.contains(&report) {
            return Err(format!(
                "\"{report}\" isn't a signal report. Use one of: {}.",
                SIGNAL_REPORTS.join(", ")
            ));
        }
    }
    let mut missing = Vec::new();
    if f(&c.cross_street).is_none() {
        missing.push("cross street");
    }
    if !has_point {
        missing.push("point on the map");
    }
    if kind.is_none() {
        missing.push("station type");
    }
    if kind == Some("base") && f(&c.antenna).is_none() {
        missing.push("antenna");
    }
    if f(&c.power).is_none() {
        missing.push("power");
    }
    if f(&c.rst_sent).is_none() {
        missing.push("how we hear them");
    }
    if f(&c.rst_received).is_none() {
        missing.push("how they hear the repeater");
    }
    if missing.is_empty() {
        Ok(())
    } else {
        Err(format!("Still needed for a range check: {}.", missing.join(", ")))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn complete() -> ContactDetails {
        ContactDetails {
            cross_street: Some("Colonial & Mills".into()),
            station_kind: Some("mobile".into()),
            power: Some("50 W".into()),
            rst_sent: Some("Full quieting".into()),
            rst_received: Some("Slight noise".into()),
            ..Default::default()
        }
    }

    #[test]
    fn a_complete_report_passes() {
        // RANGE-010
        assert_eq!(validate(&complete(), true), Ok(()));
    }

    #[test]
    fn every_missing_field_is_named() {
        // RANGE-011
        let err = validate(&ContactDetails::default(), false).unwrap_err();
        for name in [
            "cross street",
            "point on the map",
            "station type",
            "power",
            "how we hear them",
            "how they hear the repeater",
        ] {
            assert!(err.contains(name), "{err} should mention {name}");
        }
        // Blank text counts as missing.
        let blank = ContactDetails { power: Some("  ".into()), ..complete() };
        assert!(validate(&blank, true).unwrap_err().contains("power"));
    }

    #[test]
    fn a_base_station_needs_an_antenna_and_others_lose_theirs() {
        // RANGE-010, RANGE-012
        let base = ContactDetails { station_kind: Some("base".into()), ..complete() };
        assert!(validate(&base, true).unwrap_err().contains("antenna"));
        let with_antenna = ContactDetails { antenna: Some("Diamond X50".into()), ..base };
        assert_eq!(validate(&with_antenna, true), Ok(()));

        let mut mobile = ContactDetails { antenna: Some("Mag mount".into()), ..complete() };
        normalize(&mut mobile);
        assert_eq!(mobile.antenna, None);
        let mut base = with_antenna.clone();
        normalize(&mut base);
        assert_eq!(base.antenna.as_deref(), Some("Diamond X50"));
    }

    #[test]
    fn only_listed_reports_and_station_types_are_accepted() {
        // RANGE-013
        let rst = ContactDetails { rst_sent: Some("59".into()), ..complete() };
        assert!(validate(&rst, true).unwrap_err().contains("isn't a signal report"));
        let kind = ContactDetails { station_kind: Some("boat".into()), ..complete() };
        assert!(validate(&kind, true).unwrap_err().contains("isn't a station type"));
    }
}
