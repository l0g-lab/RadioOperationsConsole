# Domain Language

## Core terms

| Term | Definition |
| --- | --- |
| Organization | The club, ARES/RACES group, SKYWARN group, EOC, or other entity using the application. |
| Operator | The person currently entering or changing application records. |
| Participant | A person or station that checks into or participates in an activity. |
| Activity template | A versioned configuration that controls defaults, scripts, visible modules, and validation. |
| Activity | A bounded operation such as a weekly net, activation, exercise, or public-service event. |
| Net session | A radio net conducted within an activity. Most weekly activities contain one session; longer activations may contain several. |
| Operational period | A defined shift or time segment within a longer activity. |
| Check-in | A participant's presence in a net session or activity. |
| Activity entry | A timestamped fact, communication, decision, action, status change, or note in the common chronology. |
| Traffic item | Tactical or formal information awaiting, undergoing, or completing delivery. |
| Incident | A managed situation containing related reports, notes, assignments, alerts, and status. Not yet built — see [features/skywarn-incidents-and-reports.md](features/skywarn-incidents-and-reports.md)'s "Future increment" section. |
| Spotter report | A structured ground-truth hazard observation associated with an activity, using the fixed hazard-type/magnitude scales in [features/skywarn-incidents-and-reports.md](features/skywarn-incidents-and-reports.md) (`SPOT-002`, `SPOT-016`–`019`). Optionally correlated with a check-in (`SPOT-010`). Earlier drafts of this document called this a "field report" or "SKYWARN report" — implemented as "spotter report," matching the source SKYWARN manual's own term. |
| Assignment | A task with an owner, status, priority, and completion record. |
| External alert | An authoritative notification retrieved from an outside provider, initially NWS. |
| Inject | A planned simulated input released during an exercise. |
| Artifact | An attachment or generated output linked to source records. |

## Identity distinctions

- The **operator** enters information.
- The **reporter** supplies an observation.
- The **participant/station** checks into a net.
- One person may fill several roles, but the roles remain separately recorded.

## Location distinctions

| Location value | Meaning |
| --- | --- |
| Reported location text | Exact or lightly normalized words received from the reporter. |
| Mapped location label | Address, intersection, landmark, or label returned or confirmed through the map. |
| Observation coordinates | Operator-confirmed coordinates for the observed condition. |
| Directory/QTH location | Participant profile location, potentially enriched from QRZ. |
| APRS position | Time-varying position obtained from an APRS source. |

- **DOMAIN-001:** The system MUST store these location values separately.
- **DOMAIN-002:** Directory/QTH coordinates MUST NOT automatically populate observation coordinates.
- **DOMAIN-003:** APRS positions MUST NOT automatically become observation coordinates or check-ins.
- **DOMAIN-004:** The reported location text MUST remain available after mapping or reverse geocoding.

A check-in MAY carry a directory/QTH location, grid square, and full mailing
address sourced from a callbook connector (e.g. QRZ, see
[features/qrz-callsign-enrichment.md](features/qrz-callsign-enrichment.md)).
These are directory/QTH location data per the table above — profile-level
facts about the station, not a reported or mapped location — and MUST remain
fields distinct from any future reported-location-text field the check-in
gains.

An operator profile MAY likewise carry a directory/QTH location (a
free-text query resolved to coordinates, the same way the weather area of
interest is; see [features/nws-alerts.md](features/nws-alerts.md)), used to
plot the operator and compute distance to checked-in stations on the
check-in location map ([features/checkin-location-map.md](features/checkin-location-map.md)).
It is the same domain concept as a check-in's directory/QTH location,
applied to a different entity.

## Fixed SKYWARN baseline

The baseline is application-owned and versioned. Organizations may configure coverage areas and operational defaults but may not edit baseline category meanings or magnitude enumerations.

The hazard categories and their magnitude scales are now fully specified in
[features/skywarn-incidents-and-reports.md](features/skywarn-incidents-and-reports.md)
(`SPOT-002`, `SPOT-016`–`019`), sourced from official NWS spotter reference
material rather than the source manual's summary alone (that manual named
Hail, Wind Damage, Flooding, Tornado, and Other, and identified magnitude
dimensions like hail size and wind speed, but didn't expose every closed
dropdown choice — the values themselves came from NWS's own published
hail-size and wind-speed reference charts). The implemented category set —
Hail, Wind Damage, Flooding, Tornado, Snow/Ice Accumulation, Other — is
narrower than earlier speculative lists in this document (which also named
Heavy Rain, Tropical/Hurricane Impacts, and Lightning Impacts); those
remain unimplemented and would need their own sourced magnitude treatment
before being added, not just appended to the enum.

- **DOMAIN-005:** Saved reports MUST retain the baseline schema version used
  at creation. **Not yet implemented** — spotter reports do not currently
  store a schema/baseline version; this needs a real column and migration
  before this requirement is actually met, not just documented.
- **DOMAIN-006:** Application upgrades MUST NOT reinterpret historical
  category or magnitude codes.

