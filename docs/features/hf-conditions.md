# Feature: HF Conditions

## Status

Draft — implemented.

## Purpose

Nets run on HF too: MARS, ARES HF nets, the HF relays of a SET. When a net
can't hear its stations, the operator wants to know whether it's the band
or something else, and whether to expect trouble tonight. The questions are
plain ones: is there a solar flare or a geomagnetic storm on, is HF being
absorbed here right now, and what's forecast for the next day or two.

This is a small panel on the Weather tab that answers them from NOAA's
Space Weather Prediction Center, next to the NWS weather the tab already
shows. It is for running nets, not for chasing DX.

## Relationship to other documents

- Part of the Weather tab ([nws-alerts.md](nws-alerts.md), `NWSA-013`,
  `NWSA-014`): fetched with the rest, under the same rules for when and how.
- Uses the tab's area of interest (`NWSA-004`) for the one local reading
  (`HFC-004`); everything else is the same everywhere.
- An online enhancement (`VISION-005`): never needed for core work, and
  silent while working offline (`UX-022`).

## Sources

All from NOAA SWPC (`services.swpc.noaa.gov`), US government data in the
public domain: no key, no account, no permission needed.

| What | Product |
|---|---|
| R, S and G scales now, and the outlook for 3 days | `/products/noaa-scales.json` |
| Planetary K index (3-hourly) and running A index | `/products/noaa-planetary-k-index.json` |
| 10.7 cm solar flux | `/products/summary/10cm-flux.json` |
| D-region absorption (D-RAP): the frequency absorbed at each point, worldwide, with its X-ray and proton messages and recovery time | `/text/drap_global_frequencies.txt` |

Checked 2026-10-18: all four answer, in the shapes described above.

## The panel

- **HFC-001:** The Weather tab MUST have an **HF conditions** panel in its
  left column, after Forecast (`NWSA-014`). While there's nothing to say
  (every scale at 0 now and in the outlook, and nothing absorbed here), it MUST be a
  single line: "Quiet · Solar flux 137 good · K 2 quiet · A 6 quiet". It
  MUST grow only when
  there's something to say, so operators who never use HF give it one line.
  It starts "Quiet" only when K is 2 or less and A under 8 as well.
- **HFC-002:** It MUST show the latest solar flux, K index, and A index, each
  followed by a word for what it means, and on hovering a line on what the
  number tells an operator and when it was measured:
  - solar flux, the sun's radio output (higher opens the upper HF bands):
    under 80 poor, 80–109 fair, 110–149 good, 150 and up excellent;
  - K, the last 3 hours' disturbance: 0–2 quiet, 3 unsettled, 4 active, 5 and
    up storm (as G1–G5);
  - A, the day's average: under 8 quiet, 8–15 unsettled, 16–29 active, 30–49
    minor storm, 50 and up major storm.
- **HFC-003:** Any R, S, or G scale above 0 now MUST be shown on its own line
  with its level, NOAA's word for it, and what it means for HF in a few plain
  words, from NOAA's scale descriptions: "R2 (moderate) radio blackout —
  HF fading on the sunlit side for tens of minutes"; "G3 (strong) storm —
  HF fading, worse toward higher latitudes". A storm or blackout MUST be
  marked as needing attention (amber; red from R3, G4 or S4, which will stop
  a net), as alerts are (`NWSA-016`).
- **HFC-004:** While D-RAP reports a flare or proton event (its X-ray or
  proton message isn't "Normal … Background") and gives absorption at the
  point nearest the area of interest, the panel MUST say so: "HF below 9 MHz
  weakened by absorption here", with D-RAP's message and its estimated
  recovery time when it gives one. HF's normal daytime absorption (up to a
  few MHz around noon, every day) MUST NOT be reported. With no area set,
  this line is left out.
- **HFC-005:** The outlook MUST say, for the rest of today and the days
  after, when a storm (G1 and up) is expected or the chance of an R3-or-worse
  blackout is 10 % or more: "Outlook: G1 (minor) storm expected Mon and Tue".
  The chance of a minor (R1–R2) blackout MUST NOT be mentioned: near solar
  maximum it's 25 % or more most days. Otherwise it says nothing.

## Fetching

- **HFC-010:** The panel MUST be fetched with the rest of the tab, on opening
  it and on Refresh (`NWSA-013`), and again every 15 minutes while the tab is
  open and online. Nothing MUST be fetched while working offline or on another
  tab.
- **HFC-011:** A failed fetch MUST keep what was shown, with its time, and
  say the space weather service couldn't be reached (`NWSA-012`). Readings
  are not stored: an old one shown after a restart would mislead.
- **HFC-012:** Parsing MUST be tested against recorded copies of each
  product, quiet and stormy, so the core suite never fetches from NOAA
  (`BUILD_PROTOCOL`).

## Not in this feature

- **DX tools:** DX cluster spots, PSKReporter and reverse-beacon maps,
  point-to-point predictions (VOACAP), and band-by-band "good / fair / poor"
  charts. They're for chasing contacts, not running nets, and several depend
  on third-party feeds.
- **NVIS frequency for regional nets** (foF2: the highest frequency that
  comes straight back down). It would answer "40 m or 80 m tonight?"
  directly, but there's no dependable source for it yet. On 2026-10-18
  only two North American ionosondes were reporting: Idaho, and Millstone
  Hill (MA) with no confidence in its automatic reading. Eglin (FL), Wallops
  Island, Austin, Boulder, and Point Arguello had been silent for months to
  years. KC2G's map (prop.kc2g.com) interpolates between ionosondes, but has
  no published API, data files, or terms of use; using it would need the
  author's permission first. To revisit if either changes.
- **SWPC's alert messages** (watches, warnings, summaries). The scales and
  outlook already say what they say, without the operator reading bulletins.
- **A conditions note on an HF activity's own screen.** Only if the panel
  proves useful.

## Acceptance examples

```gherkin
Scenario: A quiet day
  Given all NOAA scales are 0 now and in the outlook, and D-RAP shows no absorption here
  When the operator opens the Weather tab
  Then HF conditions is one line: "Quiet · Solar flux 137 good · K 2 quiet · A 6 quiet"

Scenario: A flare during an HF net
  Given an R2 radio blackout now, and D-RAP absorbing below 9 MHz at the area
  When the operator opens the Weather tab
  Then the panel shows "R2 (moderate) radio blackout — HF fading on the sunlit side for tens of minutes" in amber
  And "HF below 9 MHz weakened by absorption here", with the recovery time D-RAP gives

Scenario: A storm on the way
  Given a G1 storm forecast for Tuesday
  Then the panel says "Outlook: G1 (minor) storm expected Tue"

Scenario: Working offline
  Given the operator is working offline
  When they open the Weather tab
  Then nothing is fetched from NOAA, and the tab says the weather needs the internet
```
