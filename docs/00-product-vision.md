# Product Vision

## Purpose

Radio Operations Console is an offline-first desktop application for conducting and documenting amateur-radio nets, emergency communications activations, exercises, and weather-spotter operations.

It provides one dependable operational record while exposing only the tools relevant to the activity currently being conducted.

## Problem statement

General amateur-radio logging applications are optimized for individual QSOs, awards, confirmations, and station statistics. Emergency and public-service operations instead require rapid check-ins, chronological notes, incident reports, traffic status, assignments, situational information, and defensible post-event records.

Existing weather-focused tools address part of this need but do not provide a common foundation for weekly nets, ARES/RACES activations, ad-hoc Simulated Emergency Tests, and SKYWARN activations.

## Product outcome

An operator unfamiliar with the application can select the current activity, identify themselves, and begin the primary task with minimal setup. An experienced operator can use keyboard-oriented workflows, structured reports, external data, and exports without sacrificing speed.

## Vision requirements

- **VISION-001:** The product MUST use a common event engine for weekly nets, directed nets, ARES/RACES activations, SET exercises, SKYWARN activations, and custom activities.
- **VISION-002:** The product MUST remain usable for core operations without internet access.
- **VISION-003:** The product MUST run as an installable desktop application on supported Windows and Linux systems.
- **VISION-004:** The product MUST prioritize logging, incident management, check-ins, and operational continuity over mapping or external-data display.
- **VISION-005:** Maps, APRS, radar, NWS alerts, and QRZ lookups MUST be supporting capabilities and MUST NOT become prerequisites for recording activity.
- **VISION-006:** The product MUST support simple operation for inexperienced users and efficient keyboard-oriented operation for experienced users.
- **VISION-007:** Operational history MUST be attributable, timestamped, reviewable, and exportable.
- **VISION-008:** The product MUST NOT implement or advertise Slack or other team-chat integration.
- **VISION-009:** Product specifications MUST remain usable by human developers and automated implementation agents without depending on one vendor's terminology or features.

## Success measures

- A new operator can set up a weekly net and record a check-in without training documentation.
- A net-control operator can record consecutive check-ins without leaving the keyboard.
- A SKYWARN operator can link a checked-in station to a structured report and locate the observation on a map.
- Internet loss does not prevent records from being created, corrected, searched, closed, or exported.
- Every displayed operational time can be related unambiguously to UTC.
- Reports can be reproduced from stored structured source records.

