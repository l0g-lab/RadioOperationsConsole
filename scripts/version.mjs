#!/usr/bin/env node
// The app's version lives in five files that must agree, or Tauri refuses to
// build. This keeps them in step and reads release notes from CHANGELOG.md.
//
//   node scripts/version.mjs check [--tag v1.4.0]   all five agree (and match the tag)
//   node scripts/version.mjs set 1.4.0              set all five
//   node scripts/version.mjs notes 1.4.0            print that release's CHANGELOG section
//
// Through npm: `npm run version:check`, `npm run version:set -- 1.4.0`.

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (f) => readFileSync(join(root, f), "utf8");
const write = (f, s) => writeFileSync(join(root, f), s);

/** Each file, how to read its version, and how to set it. */
const FILES = [
  {
    file: "package.json",
    get: (s) => JSON.parse(s).version,
    set: (s, v) => s.replace(/("version":\s*")[^"]+(")/, `$1${v}$2`),
  },
  {
    file: "package-lock.json",
    get: (s) => {
      const j = JSON.parse(s);
      const a = j.version;
      const b = j.packages?.[""]?.version;
      return a === b ? a : `${a} / ${b}`;
    },
    // The root entry and the "" package entry, both right after the name.
    set: (s, v) =>
      s.replace(/("name": "radio-ops-console",\s*"version": ")[^"]+(")/g, `$1${v}$2`),
  },
  {
    file: "src-tauri/Cargo.toml",
    get: (s) => s.match(/^\[package\][\s\S]*?^version\s*=\s*"([^"]+)"/m)?.[1],
    set: (s, v) => s.replace(/(^\[package\][\s\S]*?^version\s*=\s*")[^"]+(")/m, `$1${v}$2`),
  },
  {
    file: "src-tauri/Cargo.lock",
    get: (s) => s.match(/name = "radio_ops_console"\nversion = "([^"]+)"/)?.[1],
    set: (s, v) => s.replace(/(name = "radio_ops_console"\nversion = ")[^"]+(")/, `$1${v}$2`),
  },
  {
    file: "src-tauri/tauri.conf.json",
    get: (s) => JSON.parse(s).version,
    set: (s, v) => s.replace(/("version":\s*")[^"]+(")/, `$1${v}$2`),
  },
];

const SEMVER = /^\d+\.\d+\.\d+$/;

function versions() {
  return FILES.map((f) => ({ file: f.file, version: f.get(read(f.file)) }));
}

/** The CHANGELOG section for a version ("1.4.0" or "Unreleased"), without its heading. */
function notes(version) {
  const lines = read("CHANGELOG.md").split("\n");
  const start = lines.findIndex((l) => l.startsWith(`## [${version}]`));
  if (start < 0) return null;
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((l) => l.startsWith("## [") || /^\[[^\]]+\]: /.test(l));
  return (end < 0 ? rest : rest.slice(0, end)).join("\n").trim();
}

const [cmd, arg, arg2] = process.argv.slice(2);

if (cmd === "check") {
  const found = versions();
  const distinct = new Set(found.map((f) => f.version));
  for (const f of found) console.log(`${f.version ?? "(not found)"}\t${f.file}`);
  if (distinct.size !== 1 || !SEMVER.test([...distinct][0] ?? "")) {
    console.error("The version doesn't agree across these files. Fix with: npm run version:set -- X.Y.Z");
    process.exit(1);
  }
  const version = [...distinct][0];
  if (arg === "--tag" && arg2 && arg2.replace(/^v/, "") !== version) {
    console.error(`The tag ${arg2} doesn't match the version ${version} in the files.`);
    process.exit(1);
  }
  console.log(`All agree: ${version}`);
} else if (cmd === "set") {
  if (!SEMVER.test(arg ?? "")) {
    console.error("Give the new version as X.Y.Z, e.g. npm run version:set -- 1.4.0");
    process.exit(1);
  }
  for (const f of FILES) {
    const before = read(f.file);
    const after = f.set(before, arg);
    if (f.get(after) !== arg) {
      console.error(`Couldn't set the version in ${f.file}.`);
      process.exit(1);
    }
    write(f.file, after);
  }
  console.log(`Set ${arg} in ${FILES.length} files.`);
  if (notes(arg) === null) {
    console.log(`Next: rename "## [Unreleased]" in CHANGELOG.md to "## [${arg}] - <date>".`);
  }
} else if (cmd === "notes") {
  const text = notes(arg ?? "");
  if (text === null) {
    console.error(`CHANGELOG.md has no section for ${arg}.`);
    process.exit(1);
  }
  console.log(text || "No changes recorded yet.");
} else {
  console.error("Usage: node scripts/version.mjs check [--tag vX.Y.Z] | set X.Y.Z | notes X.Y.Z");
  process.exit(1);
}
