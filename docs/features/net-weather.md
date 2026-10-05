# Feature: Net weather

## Status

Draft — implemented.

## Purpose

What the weather was doing helps make sense of a net afterwards: fewer
check-ins on a night with thunderstorms nearby, say, or a SKYWARN net that ran
long as a warning came and went. Net control shouldn't have to look it up and
write it down. The app reads it as the net starts and as it ends and puts it
in the summary.

## Relationship to other documents

- Read as an activity is started and ended
  ([activity-lifecycle-and-wrap-up.md](activity-lifecycle-and-wrap-up.md),
  `LIFE-001`–`009`), and shown in its summary (`EXPORT-017`).
- Uses the same NWS service as [nws-alerts.md](nws-alerts.md), but never the
  Settings weather area.

## Requirements

- **WX-001:** When a net, range check, or relay starts, and again when it
  ends, the app MUST read the weather in the background, so starting or
  ending never waits on it. A station log, which never starts or ends, has
  none.
- **WX-002:** The weather MUST be read for the repeater's location, or, with
  no repeater location, net control's. With neither, none is read: the
  Settings weather area may be somewhere else or out of date, so it MUST NOT
  be used.
- **WX-003:** A reading MUST be what was observed, not forecast: from the
  nearest NWS station with a report (trying the next two nearest if it has
  none), the report closest to when the net started or ended, within 90
  minutes. "End at the last check-in" reads the weather for that time.
- **WX-004:** Each reading MUST keep the temperature, conditions, wind (with
  gusts), the station and when it reported, and the NWS alerts in effect at
  that location, e.g. "Severe Thunderstorm Warning". Ending a net again after
  reopening it replaces its end reading.
- **WX-005:** The summary MUST show a **Weather** line for the start and one
  for the end, in °F and mph, with any alerts in amber. Hovering shows the
  station and when it reported. The text summary MUST include the same.
- **WX-006:** When there's no reading for the start or the end, the summary
  MUST say why on that line, as it was at the time: working offline; no
  repeater or net control location set; the weather service couldn't be
  reached (its own error message is not shown); or no nearby station
  reported. None of these is an error, and nothing is retried. Nets from
  before weather was recorded show no Weather line.
- **WX-007:** Working offline, nothing MUST be fetched.

## Not included

- Filling in a missed reading later (NWS keeps about a week of reports).
- Comparing weather with check-in counts across nets.
