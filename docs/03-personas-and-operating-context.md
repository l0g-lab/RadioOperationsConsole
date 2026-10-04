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
- **PERSONA-002:** Each activity MUST have an operator (net control), a profile with at least a display name or call sign, chosen when the activity is created and defaulting to the default operator. Everything recorded in the activity, and its forms, go under that operator (the "acting operator"). There is no separate "current operator" to choose. One operator is the default, used for new activities and for anything outside an activity (repeaters, places, net listings, the ICS 214); the first operator unless another is made default.
- **PERSONA-003:** Changing an activity's operator MUST move everything recorded in the activity under the previous operator to the new one, and MUST create one audit event recording the change.
- **PERSONA-004:** The selected activity's operator MUST remain visible in the persistent application header.
- **PERSONA-005:** An activity's operator MUST be changeable from its Edit form, open or closed, without restarting it. (Handing off net control part-way through, with records before and after under different operators, is not covered.)

## Usability context

The application may be operated while monitoring radio traffic, severe weather, multiple information sources, and other people in the room. Operators may have limited time to correct mistakes and may be using a laptop at reduced resolution.

- **PERSONA-006:** Primary live workflows MUST be usable at 1366 by 768 resolution.
- **PERSONA-007:** Check-in, log-entry, and report-entry flows MUST support complete keyboard operation.
- **PERSONA-008:** A first-time operator MUST be able to identify the next primary action from visible labels without memorizing shortcuts.
- **PERSONA-009:** Destructive or history-changing actions MUST require explicit confirmation and, when applicable, a correction reason.
