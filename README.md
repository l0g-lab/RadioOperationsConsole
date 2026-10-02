# Radio Operations Console

An offline-first desktop app for running amateur-radio nets, emergency communications activities, exercises, and SKYWARN activations. It runs on **Linux and Windows**.

It's an operations logger first, not a contest logbook: one app that handles a relaxed weekly net and a full severe-weather activation, so nobody has to juggle spreadsheets, paper, and a browser full of tabs. Everything core works with **no internet** — online services (QRZ, weather, APRS, map tiles) are add-ons that make it better when you have a connection, never requirements.

## What it does

- **Run several nets at once.** Pick the active activity from the top bar (or `Ctrl+[` / `Ctrl+]`) and every tab follows it. Keep a directory of your repeaters (frequency, offset, tones) and pick one when setting up a net.
- **Know what nets are on.** The Nets tab lists the nets in your area day by day for the coming week, with how to tune in, how far the repeater is, and how to check in. Start an activity from any of them.
- **Take check-ins fast.** Type a call sign, press Enter. Name, address, and location fill in from QRZ — or, with no QRZ or no internet, from an offline copy of the FCC amateur-license database. GMRS call signs (like WRAB123) fill in from an offline copy of the FCC GMRS database. Export the roster as CSV (see it as a table first), or as an ICS-309 communications log for Winlink Express's own Form-309 (or to print).
- **Put people on a map.** Check-ins are plotted at their real location when known (QRZ coordinates, a pin you drop, typed coordinates), falling back to ZIP centre, then grid square. Say "mile marker 182 on the turnpike" and it lands on the map, offline.
- **Run a range check.** Test a repeater's reach: each station gives a cross street you pin on the map, station type and power, and signal reports both ways. The map colors each station by how well it's heard.
- **Keep a station log.** Log your own contacts (say, everyday VHF simplex) with time, frequency, mode, RST both ways, power, antenna, and notes — all optional, no net to start or end. Search it later, and as you type a call sign the app tells you when you last worked them, from any log or net.
- **Log spotter reports.** Who / what / where, with NWS-style hail and wind scales and a wind-damage guide, and export as CSV, readable text, or an ICS-213 for Winlink or print. Reports are plotted at the location of the *damage*, with icons for hail, wind, flooding, tornado, snow/ice.
- **Watch the weather.** NWS alerts and forecast for your area, plus a radar loop from the nearest NEXRAD station.
- **See live APRS.** A receive-only APRS-IS feed for a chosen area, on a map. Nothing is ever transmitted.
- **Start it, end it, wrap it up.** Start a net, and when it ends get a summary, a warning about open traffic, your closing notes, and saved copies of the records. A closed net is locked until you reopen it (with a reason).
- **Keep a record.** Traffic noted on each check-in, and a full attributed, timestamped history of every change. Removed check-ins and reports can be restored; deleting a whole activity for good asks you to confirm first.
- **See it before you save it.** Every export (CSV, text, net summary) can be viewed first, then copied or saved.
- **Never lose your data.** One-click database backup and restore in Settings, and a copy saved automatically before each update.

Coordinates can be shown as decimal degrees, degrees & decimal minutes, or degrees/minutes/seconds, and you can type them in any of those. There's a light, dark, or follow-the-system theme.

## Get it running

**Just want to use the app?** Grab the installer for your platform from the [Releases page](../../releases) — `.msi` or `.exe` for Windows, `.deb`/`.rpm`/`.AppImage` for Linux — and skip to [Using it](#using-it). Windows installers aren't code-signed, so Windows may warn that the publisher is unknown before it lets you run one; that's expected for an unsigned open-source build.

**Building from source** takes a few minutes the first time (Rust compiles a lot), and the same steps work on both platforms. Build on the OS you want to run on — Tauri doesn't cross-compile.

### 1. Install the prerequisites

You need **Node.js 18 or newer**, the **Rust toolchain** (1.77+), and the system libraries Tauri uses to draw its window.

<details>
<summary><strong>Linux (Debian / Ubuntu)</strong></summary>

```bash
sudo apt update
sudo apt install build-essential curl wget file libssl-dev libxdo-dev \
  libwebkit2gtk-4.1-dev libayatana-appindicator3-dev librsvg2-dev

# Rust
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# Node.js: use your distro's package, nvm, or https://nodejs.org (LTS)
```

On Fedora, Arch, or others, the package names differ — see Tauri's [Linux prerequisites](https://v2.tauri.app/start/prerequisites/#linux).
</details>

<details>
<summary><strong>Windows 10 / 11</strong></summary>

1. **Microsoft C++ Build Tools** — install [Visual Studio Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/) and tick **Desktop development with C++**.
2. **WebView2** — already included with Windows 11 and current Windows 10. If the app opens to a blank window, install the [Evergreen runtime](https://developer.microsoft.com/microsoft-edge/webview2/).
3. **Rust** — install from [rustup.rs](https://rustup.rs) and choose the default **MSVC** toolchain.
4. **Node.js** — install the LTS version from [nodejs.org](https://nodejs.org).

Or from PowerShell with winget:

```powershell
winget install Microsoft.VisualStudio.2022.BuildTools --override "--wait --passive --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended"
winget install Rustlang.Rustup
winget install OpenJS.NodeJS.LTS
```

Open a **new** terminal afterwards so the tools are on your PATH.
</details>

### 2. Get the code and start it

```bash
git clone https://github.com/l0g-lab/RadioOperationsConsole.git
cd RadioOperationsConsole
npm install
npm run tauri dev
```

`npm run tauri dev` opens the app with hot-reloading — the fastest way to try it.

### 3. Build an installer (optional)

```bash
npm run tauri build
```

The results land in `src-tauri/target/release/bundle/`:

| Platform | You get |
| --- | --- |
| Linux | `.deb`, `.rpm`, and `.AppImage` |
| Windows | `.msi` and `.exe` (NSIS) installers |

Install whichever suits you, or just run the plain binary from `src-tauri/target/release/`. Windows and Linux builds come from the same source; day-to-day development has been done on Linux, so if something is off on Windows, please open an issue.

## Using it

**First run:** go to **Operations**, add an operator (name and call sign — no password), then create an activity, such as a weekly net. Switch to **Check-ins** and start logging.

| Tab | For |
| --- | --- |
| Operations | Operators, the repeater directory, creating/editing/archiving activities |
| Check-ins | Taking check-ins (with any traffic they have), the roster, the check-in map |
| Spotter Reports | Hazard reports and the report map |
| Weather | NWS alerts, forecast, radar |
| APRS | Live APRS-IS feed for an area |
| Exports | Everything that leaves the app, in one place: check-ins, spotter reports, history and the net summary as CSV or text, and the ICS forms — each viewable before saving |
| History | The audit trail of everything that changed |
| Nets | Nets you can join, day by day for the coming week — when, how to tune in, how far the repeater is, how to check in; start an activity from one |
| Settings | QRZ login, theme, coordinate format, offline data, backup & restore |

**Shortcuts:** `Ctrl+1`–`9` jump to a tab · `Ctrl+K` focus the call-sign box · `Ctrl+[` / `Ctrl+]` previous/next activity · `Ctrl+Shift+ +/-/0` zoom.

## Working offline

The app is built to be taken into the field. To prepare, spend a few minutes online first:

- **Map tiles** are cached as you look at them. Browse your operating area (check-in map, spotter map, location picker) at the zooms you'll need. Tiles you've never viewed stay blank offline, but pins still appear.
- **Settings → Offline data** downloads mile-marker data for Florida's Turnpike, I-95, I-75, US-1 (Keys), and US-41 (Tamiami Trail) from the Florida DOT, and the FCC's U.S. call-sign databases: amateur (about 200 MB, best on Wi-Fi) and GMRS (about 55 MB). An interrupted download resumes. The amateur file is only used when QRZ isn't available; GMRS call signs are looked up only in the GMRS file, since QRZ covers amateur licenses only.
- **Settings → Backup & Restore** saves everything you've entered to one file. Restoring replaces the current data — a safety copy is kept first, so it can be undone.

| Works with no internet | Needs internet |
| --- | --- |
| Logging, check-ins, reports, traffic, history | QRZ lookups (needs a QRZ.com XML subscription) |
| Maps with previously viewed tiles | New map tiles, address/place search |
| ZIP, grid-square, and mile-marker locations | NWS alerts and forecast, radar |
| FCC call-sign lookup (once downloaded) | APRS-IS feed |
| Backup and restore | Updating offline data |

## Where your data lives

Created automatically on first run, under the app's identifier `org.radiooperationsconsole.desktop`:

| | Linux | Windows |
| --- | --- | --- |
| Database (`radio_ops.db`), downloaded data, safety copies from restores and updates | `~/.local/share/org.radiooperationsconsole.desktop/` | `%APPDATA%\org.radiooperationsconsole.desktop\` |
| Settings (`settings.json`, includes your QRZ login) | `~/.config/org.radiooperationsconsole.desktop/` | `%APPDATA%\org.radiooperationsconsole.desktop\` |

Database migrations apply automatically, so updating the app updates your data in place. Use **Backup & Restore** rather than copying these files around.

---

## License

GNU General Public License v3.0 or later (GPL-3.0-or-later) — see [LICENSE](LICENSE). You're free to use, study, modify, and redistribute this software; if you distribute a modified version, it must also be licensed under the GPL, so improvements stay available to the community.

## Contributing

Bug reports, ideas, and code are welcome — see [CONTRIBUTING.md](CONTRIBUTING.md) for how to build, test, and send changes, and [CHANGELOG.md](CHANGELOG.md) for what changed in each release. Please report security problems privately, as described in [SECURITY.md](SECURITY.md).

The product and engineering specification the app is built from is in [docs/](docs/README.md).

## Credits

Created and maintained by [l0g-lab](https://github.com/l0g-lab). Contributions from the amateur-radio community are welcome.
