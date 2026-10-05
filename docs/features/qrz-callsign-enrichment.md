# Feature: QRZ Callsign Enrichment

## Status

Draft — first vertical slice in active implementation.

## Purpose

Suggests a checked-in station's name, QTH location, and grid square during
rapid check-in entry by looking up the call sign against the QRZ.com XML
callsign database. This is a convenience enrichment, not an authoritative
identity source: the operator remains free to accept, edit, or ignore any
part of the suggestion.

## Relationship to other documents

- Elaborates `UX-CI-002` and `UX-CI-003` in
  [06-application-shell-and-navigation.md](../06-application-shell-and-navigation.md)
  for this specific connector.
- Governed by the online-enhancement boundary in
  [02-scope-and-release-boundaries.md](../02-scope-and-release-boundaries.md)
  ("QRZ callbook name enrichment when configured by an eligible subscriber").
- Respects the location-distinction rules in
  [04-domain-language.md](../04-domain-language.md) (`DOMAIN-001`–`004`): the
  QTH location and grid square this feature prefills are directory/QTH data
  and MUST be stored as their own fields, distinct from any operator-reported
  location text. `DOMAIN-002` prohibits directory/QTH data from automatically
  becoming *observation* coordinates (a report-level concept); it does not
  prohibit storing directory/QTH data on the check-in itself, which is what
  this feature does.
- Respects credential-handling intent in
  [ADR-002-offline-first-storage.md](../decisions/ADR-002-offline-first-storage.md)
  (`STORAGE-008`, `STORAGE-010`).

## Auth model

QRZ.com's callsign lookup service (the XML Data API) has no standalone API
key. It authenticates with a QRZ.com username and password to obtain a
short-lived session key, which is then passed on each lookup request. The
session key expires and must be renewed by logging in again. This requires
an active QRZ.com subscription with XML/callbook data access; a plain QRZ.com
login without that subscription will authenticate but fail lookups.

## Settings requirements

- **QRZ-001:** Settings MUST accept a QRZ.com username and password used
  solely to obtain XML API session keys.
- **QRZ-002:** The password input MUST be masked in the UI.
- **QRZ-003:** QRZ lookup MUST be treated as unconfigured (silently disabled)
  whenever username or password is empty. The application MUST NOT prompt or
  block elsewhere in the UI on missing QRZ credentials.

## Session handling

- **QRZ-010:** The application MUST obtain a session key via login and reuse
  it across lookups rather than logging in for every call sign.
- **QRZ-011:** When a lookup response indicates an expired or invalid
  session, the application MUST re-authenticate once and retry the lookup
  before surfacing an error.
- **QRZ-012:** Session keys MUST be held only in memory for the running
  application process and MUST NOT be persisted to disk, logs, or exports.

## Lookup and check-in interaction

- **QRZ-020:** Looking up a call sign MUST occur asynchronously and MUST NOT
  delay or block saving a check-in.
- **QRZ-021:** A successful lookup SHOULD prefill the check-in Name field
  only when the operator has not already entered a name for that entry.
- **QRZ-037:** The type-as-you-go lookup MUST wait for a pause in typing long
  enough (about 0.8 s) that a brief hesitation partway through a call sign does
  not look up the partial call. If the call sign changes after a lookup has
  filled fields (for example `KR4H` filled, then typing continues to `KR4HGY`),
  every value that lookup supplied and the operator has not edited MUST be
  cleared and the new call sign looked up. Values the operator entered MUST be
  kept.
- **QRZ-022:** The operator MUST be able to edit or clear a QRZ-suggested
  name before saving. The suggestion MUST NOT be written to the record
  through any path other than the normal save action the operator triggers.
- **QRZ-023:** A lookup miss or unconfigured connector MUST fail silently at
  the check-in field — no blocking dialog or interruption of entry. Connector
  state MAY be surfaced through a small non-blocking status indicator. (See
  `QRZ-030` for the stricter no-indicator rule when the failure is a lack of
  network connectivity.)
- **QRZ-024:** Lookups MUST use the call sign exactly as entered. The
  application MUST NOT normalize, guess, or expand tactical identifiers or
  portable/mobile suffixes before querying QRZ.

## QTH location and grid square enrichment

- **QRZ-025:** A successful lookup SHOULD prefill a check-in's QTH location
  (city/state, or city/country outside the US) and Maidenhead grid square
  when QRZ provides them, subject to the same non-destructive prefill rule as
  the name field (`QRZ-021`): only when the operator has not already entered
  a value for that field.
- **QRZ-026:** The operator MUST be able to edit or clear a QRZ-suggested QTH
  location or grid square before saving, on the same terms as `QRZ-022`.
- **QRZ-027:** QTH location, grid square, and full address MUST be stored on
  the check-in as fields distinct from any operator-reported location text
  (`DOMAIN-001`). They are directory/QTH data, not a reported or mapped
  location.
- **QRZ-028:** A successful lookup SHOULD also prefill a check-in's full
  mailing address (street, city/state/zip, country, as provided) when QRZ
  returns one, subject to the same non-destructive prefill rule as `QRZ-025`.
  The full address is a separate field from the shorter QTH location summary
  — both MAY be populated from the same lookup.
- **QRZ-029:** The operator MUST be able to edit or clear a QRZ-suggested
  location before saving, on the same terms as `QRZ-022`. The form shows the
  lookup's address (else QTH) in one Location box and keeps the QTH, grid
  square, and exact point it found for saving (`CIMAP-080`); the roster shows
  them as in `CIMAP-081`.

## Retrying lookup on an already-saved check-in

Rapid check-in entry can outrun the debounced, type-as-you-go lookup
(`QRZ-020`) — a check-in saved before it resolves, or entered too quickly to
wait on it at all.

- **QRZ-034:** The operator MUST be able to trigger a QRZ lookup for an
  already-saved check-in's call sign directly from the Check-ins roster,
  without re-entering or editing it first.
- **QRZ-035:** This retry lookup MUST populate only the fields currently
  blank on that check-in (name, QTH location, grid square, full address),
  subject to the same non-destructive prefill rule as `QRZ-021`/`025`/`028`
  — it MUST NOT overwrite a field the operator has already entered or
  corrected. Its map location is the exception: one worked out automatically
  is worked out again from what the lookup found, and one placed by hand is
  kept (`CIMAP-003`).
- **QRZ-036:** This control MUST only be offered when QRZ is configured
  (`QRZ-003`), and MUST fail silently on an offline or unconfigured
  connector (`QRZ-030`) rather than surfacing an error for what remains an
  optional convenience.

## Clearing populated data

`QRZ-022`/`026`/`029` establish that each field is individually editable or
clearable. These requirements add an explicit, one-action way to discard all
of them together, so a wrong or unwanted match doesn't require clearing four
fields by hand.

- **QRZ-032:** The Check-ins entry form MUST offer an explicit control that
  clears all QRZ-populated fields (name, QTH location, grid square, full
  address) for the current entry in one action, distinct from clearing the
  call sign field itself.
- **QRZ-033:** Clearing the call sign field down to empty MUST also clear any
  populated name, QTH location, grid square, and full address for that
  entry — they no longer correspond to any station once the call sign is
  gone.

## Offline resilience

QRZ lookup is a convenience, not a dependency (`VISION-002`, `VISION-005`):
the application MUST remain fully usable for check-ins with no internet
access at all, and a flaky or absent connection MUST NOT make QRZ lookup
feel broken.

- **QRZ-030:** A lookup that fails because the network is unreachable (no
  connectivity, DNS failure, connection refused/timed out) MUST NOT surface
  any status indicator. The check-in field behaves exactly as it would if
  QRZ were unconfigured. This is stricter than `QRZ-023`: a real
  configuration or authentication problem (reachable server, rejected
  credentials) MAY still surface the small status indicator, since that is
  something the operator can act on; unreachability is not.
- **QRZ-031:** QRZ network requests MUST use a bounded connect and overall
  timeout so that a lack of connectivity fails fast rather than hanging the
  lookup (and, transitively, the session state) indefinitely.

## Explicit non-goals for this slice

- A persistent local call sign/directory cache. `STORAGE-010`-style
  cached-record metadata (source, retrieval time, freshness) is deferred
  until a caching layer is designed; this slice performs a live lookup per
  call sign entry.
- Populating QRZ-sourced QTH data into SKYWARN or other report *observation*
  coordinates. `DOMAIN-002` prohibits that regardless of source; only the
  check-in's own QTH/grid fields are in scope here.
- Bulk or prefetch lookups across an entire roster.
- Any other QRZ product (Logbook API, ADIF upload) — only callsign lookup is
  in scope here.

## Acceptance examples

```gherkin
Scenario: Successful lookup prefills the name field
  Given QRZ credentials are configured and valid
  And the operator has not typed a name for the current entry
  When the operator enters a call sign found on QRZ
  Then the Name field is prefilled with the QRZ-returned name
  And the operator can still edit or clear it before saving

Scenario: Successful lookup prefills QTH location and grid square
  Given QRZ credentials are configured and valid
  And the operator has not typed a location or grid square for the current entry
  When the operator enters a call sign found on QRZ with a known QTH and grid
  Then the QTH location and grid square fields are prefilled from QRZ
  And the operator can still edit or clear either before saving

Scenario: Successful lookup prefills the full address
  Given QRZ credentials are configured and valid
  And the operator has not typed an address for the current entry
  When the operator enters a call sign found on QRZ with a known mailing address
  Then the full address field is prefilled from QRZ
  And it appears in its own column on the check-ins roster
  And the operator can still edit or clear it before saving

Scenario: Clear control discards all populated fields at once
  Given a lookup has populated the name, QTH location, grid square, and address
  When the operator clicks the clear control
  Then all four fields are emptied
  And the call sign field is left unchanged

Scenario: Clearing the call sign clears its populated data
  Given a lookup has populated the name, QTH location, grid square, and address
  When the operator deletes the call sign field down to empty
  Then the name, QTH location, grid square, and address fields are also cleared

Scenario: No internet connection is silent, not an error
  Given QRZ credentials are configured
  And the workstation has no network connectivity
  When the operator enters a call sign
  Then the lookup fails quickly rather than hanging
  And no status indicator, error text, or dialog appears on the check-ins workspace
  And the check-in can still be saved normally with the fields the operator entered

Scenario: Slow or failed lookup never blocks saving
  Given QRZ credentials are configured
  When the operator enters a call sign and presses Enter before any lookup completes
  Then the check-in is saved immediately using only the entered fields
  And a late-arriving lookup result MUST NOT retroactively alter the saved record

Scenario: Unconfigured QRZ is silent
  Given no QRZ username or password is set
  When the operator enters a call sign
  Then no lookup is attempted
  And no error or prompt appears on the check-ins workspace

Scenario: Expired session is retried once
  Given a cached QRZ session key has expired
  When a lookup is attempted
  Then the application logs in again and retries the lookup once
  And only fails visibly if the retry also fails
```
