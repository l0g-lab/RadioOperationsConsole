# Personas and Operating Context

## Primary personas

### Net Control Station

Conducts a directed or simple weekly net, records check-ins, calls stations with traffic, makes announcements, records significant activity, and concludes the net.

### Logger or Assistant Net Control

Records entries while another operator speaks, corrects misunderstood information, and supports handoff or review.

### SKYWARN Net Control or Logger

Accepts check-ins and ground-truth reports, asks clarifying questions, locates observations, links reports to weather information, and records forwarding status.

### ARES/RACES Operator

Tracks stations, messages, assignments, resources, channels, operational periods, and unresolved work during an activation.

### Exercise Controller or Evaluator

Creates objectives and injects, separates simulated facts from real-world events, and records observations for after-action review.

### Administrator

Configures the organization, operators, repeaters, coverage areas, credentials, backup policy, and supported integrations.

## Trusted workstation model

- **PERSONA-001:** The initial release MUST NOT require operator passwords.
- **PERSONA-002:** Before creating operational records, the user MUST select a current operator profile containing at least a display name or call sign.
- **PERSONA-003:** Changing the current operator MUST create an audit event.
- **PERSONA-004:** The current operator MUST remain visible in the persistent application header.
- **PERSONA-005:** The application MUST allow operator changes during an open activity without restarting it.

## Usability context

The application may be operated while monitoring radio traffic, severe weather, multiple information sources, and other people in the room. Operators may have limited time to correct mistakes and may be using a laptop at reduced resolution.

- **PERSONA-006:** Primary live workflows MUST be usable at 1366 by 768 resolution.
- **PERSONA-007:** Check-in, log-entry, and report-entry flows MUST support complete keyboard operation.
- **PERSONA-008:** A first-time operator MUST be able to identify the next primary action from visible labels without memorizing shortcuts.
- **PERSONA-009:** Destructive or history-changing actions MUST require explicit confirmation and, when applicable, a correction reason.
