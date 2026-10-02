# Product Principles

## Principles

- **PRINCIPLE-001:** Offline operations are complete operations. Core workflows MUST function from local resources. Online status is supplemental context, not authority to create a record.
- **PRINCIPLE-002:** One engine, activity-specific presentation. Weekly nets, exercises, activations, and SKYWARN operations share domain records. Activity types control visible tools, defaults, labels, and validation; they do not create incompatible data silos.
- **PRINCIPLE-003:** Fast under radio traffic. The most common live actions MUST have short, predictable keyboard and pointer paths. Forms MUST preserve partially entered data across recoverable errors.
- **PRINCIPLE-004:** Facts are preserved. The application stores source facts and derives summaries. Corrections create revisions; they do not erase the original operational history.
- **PRINCIPLE-005:** Reported, mapped, and directory locations are different. The exact location words reported over the air, a normalized/geocoded location, map coordinates, a participant's directory location, and an APRS position are separate facts. The application MUST NOT silently substitute one for another.
- **PRINCIPLE-006:** External data has provenance and age. Every item from NWS, radar, APRS, QRZ, a geocoder, or another connector shows or retains its source, retrieval time, and freshness state.
- **PRINCIPLE-007:** Useful defaults without hidden automation. The application may prefill data, but operators review consequential associations such as report locations, reporter identity, alert linkage, and formal exports.
- **PRINCIPLE-008:** Structured source, multiple outputs. PDF, print, CSV, JSON, ICS, and Winlink-compatible artifacts are renderings of validated structured records. Output generation MUST NOT mutate the source record or imply transmission.
- **PRINCIPLE-009:** Accessible information density. The interface may evoke weather, amateur radio, and Linux operations consoles, but clarity, contrast, readable typography, and discoverability take priority over decoration. Color MUST NOT be the sole carrier of severity, connectivity, verification, or exercise state.
- **PRINCIPLE-010:** Integrations fail independently. Failure of one connector MUST NOT disable unrelated connectors or core local operation.

## Interface character

The default visual direction is dark charcoal or navy with restrained cyan, radar green, amber, and warning-red accents. Monospaced type is appropriate for call signs, frequencies, coordinates, identifiers, and timestamps. Normal interface type is used for instructions, forms, and narrative content.

See `PRINCIPLE-009` for the normative color/severity requirement.
