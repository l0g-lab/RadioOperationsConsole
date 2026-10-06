# Contributing

Thanks for helping. Radio Operations Console is used by everyday hams running
nets, emergency-communications activations, and SKYWARN operations, often
without an internet connection. Changes should keep it simple to use, reliable
under pressure, and fully usable offline.

## Reporting a problem or suggesting a feature

Open an [issue](https://github.com/l0g-lab/RadioOperationsConsole/issues/new/choose).
For a bug, say what you did, what you expected, what happened, your version
(shown at the bottom of Settings), and your platform. Please
report security problems privately instead — see [SECURITY.md](SECURITY.md).

## Building and running

The [README](README.md#get-it-running) lists the prerequisites. Then:

```bash
npm install
npm run tauri dev     # the app, reloading as you edit
npm test              # frontend tests
cd src-tauri && cargo test && cargo clippy --all-targets -- -D warnings
```

The frontend is React and TypeScript in `src/`. The backend is Rust in
`src-tauri/src/`, with the SQLite schema built up by the numbered files in
`src-tauri/migrations/`.

## Making a change

- **Read the spec for the area first.** Each feature has a document in
  [`docs/features/`](docs/README.md) recording how it's meant to behave and
  why. Update it in the same change when behavior changes. It's a guide that
  keeps decisions consistent, not something to follow over good sense.
- **Keep it offline-first.** Anything core must work with no internet. Online
  services (QRZ, NWS, APRS-IS, map tiles) are extras, and must stay silent
  when the operator has chosen to work offline.
- **Never change an existing migration.** Add a new numbered file in
  `src-tauri/migrations/` instead; people's databases have already run the old
  ones. Each migration runs all-or-nothing, and a copy of the database is saved
  before any upgrade.
- **Rules go in the backend too.** A rule that protects data (a required
  field, what can be deleted) is enforced in Rust, not only in the form.
- **Note it in [CHANGELOG.md](CHANGELOG.md)** under *Unreleased*, written for
  the people who use the app.

## Tests

Tests are for things that can actually break:

- logic and calculations (schedules, parsing, coordinates, distances)
- data rules and anything the backend enforces
- file formats other programs read (CSV, Winlink ICS forms)
- migrations, backup and restore, and deleting data
- offline behavior and downloads
- a bug that really happened, so it can't come back

Don't add tests for styling, colors, sizes, wording, or a constant restated
from a table. CI runs both test suites and Clippy on every push and pull
request; all must pass.

## Releasing (maintainers)

1. Make sure `main` is green in CI.
2. In [CHANGELOG.md](CHANGELOG.md), rename `## [Unreleased]` to
   `## [X.Y.Z] - YYYY-MM-DD`, start a new empty `## [Unreleased]` above it,
   and update the compare links at the bottom.
3. Set the version everywhere it's kept (five files), and check it:
   ```bash
   npm run version:set -- X.Y.Z
   npm run version:check
   ```
4. Commit as `vX.Y.Z`, then tag and push:
   ```bash
   git tag vX.Y.Z
   git push origin main vX.Y.Z
   ```
5. The [Release workflow](.github/workflows/release.yml) checks that the tag
   matches the version, runs the full test suite, builds the Linux, Windows,
   and macOS installers, and creates a **draft** release whose description is that
   version's CHANGELOG section. Review the draft on the Releases page and
   publish it. Installed copies see a release only once it's published (not
   a draft or pre-release), and "Update now" finds the installer for each
   platform by the file names Tauri gives them, so keep those as they are.

"Run workflow" on the Release workflow's page in the Actions tab does a dry
run without a tag.

## Optional local linting

The `.trunk/` folder configures [Trunk](https://docs.trunk.io/) with
formatters and checkers for Markdown, YAML, and more. It isn't required and
CI doesn't run it.

## License

By contributing, you agree that your contributions are licensed under the
[GPL-3.0-or-later](LICENSE), like the rest of the project.
