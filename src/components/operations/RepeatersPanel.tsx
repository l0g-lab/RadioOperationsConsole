import { Fragment, useEffect, useState } from "react";
import * as api from "../../api";
import type { Repeater, RepeaterDetails, ToneKind } from "../../types";
import { formatCoords } from "../../geo";
import { CTCSS_TONES, DCS_CODES, formatMhz, formatRepeater, inputMhz, repeaterMatches, suggestedOffset, tuningDetails } from "../../repeaters";
import LocationPicker from "../LocationPicker";
import { Archive, Info, Pencil, RadioTower } from "lucide-react";
import BandChip from "../BandChip";

interface Props {
  repeaters: Repeater[];
  onRepeatersChanged: () => void;
  /** The current operator, recorded on each change. */
  selectedOperatorId: string | null;
  /** How many net listings meet on each repeater (NETL-022). */
  netCounts?: Map<string, number>;
}

/** "+" / "-" / simplex; blank until chosen, since the direction is never assumed (RPT-002). */
type OffsetDir = "" | "+" | "-" | "simplex";

/** The form as typed. The output tone may also be "same" as the input. */
interface Draft {
  name: string;
  output: string;
  offsetDir: OffsetDir;
  offsetAmount: string;
  toneInKind: ToneKind;
  toneIn: string;
  toneOutKind: ToneKind | "same";
  toneOut: string;
  mode: string;
  notes: string;
  location: { label: string; lat: number; lon: number } | null;
}

const EMPTY: Draft = {
  name: "",
  output: "",
  offsetDir: "",
  offsetAmount: "",
  toneInKind: "none",
  toneIn: "",
  toneOutKind: "same",
  toneOut: "",
  mode: "FM",
  notes: "",
  location: null,
};

function draftFrom(r: Repeater): Draft {
  const sameOut = r.tone_out_kind === r.tone_in_kind && r.tone_out === r.tone_in;
  return {
    name: r.name,
    output: formatMhz(r.output_mhz),
    offsetDir: r.offset_mhz === 0 ? "simplex" : r.offset_mhz > 0 ? "+" : "-",
    offsetAmount: r.offset_mhz === 0 ? "" : Math.abs(r.offset_mhz).toFixed(3),
    toneInKind: r.tone_in_kind,
    toneIn: r.tone_in,
    toneOutKind: sameOut ? "same" : r.tone_out_kind,
    toneOut: sameOut ? "" : r.tone_out,
    mode: r.mode,
    notes: r.notes,
    location:
      r.location_lat != null && r.location_lon != null
        ? { label: r.location_label, lat: r.location_lat, lon: r.location_lon }
        : null,
  };
}

/** The draft as the backend takes it, or why it can't be saved yet. */
export function toDetails(d: Draft): RepeaterDetails | string {
  const output = Number(d.output.trim());
  if (!d.name.trim()) return "Give the repeater a name.";
  if (!d.output.trim() || !Number.isFinite(output)) return "Enter the output frequency in MHz.";
  if (!d.offsetDir) return "Choose the offset: plus, minus, or simplex.";
  let offset = 0;
  if (d.offsetDir !== "simplex") {
    const amount = Number(d.offsetAmount.trim());
    if (!d.offsetAmount.trim() || !Number.isFinite(amount) || amount <= 0)
      return "Enter the offset amount in MHz, e.g. 0.600.";
    offset = d.offsetDir === "-" ? -amount : amount;
  }
  if (d.toneInKind !== "none" && !d.toneIn) return "Choose the input tone.";
  if (d.toneOutKind !== "none" && d.toneOutKind !== "same" && !d.toneOut)
    return "Choose the output tone.";
  const outKind: ToneKind = d.toneOutKind === "same" ? d.toneInKind : d.toneOutKind;
  const same = d.toneOutKind === "same";
  return {
    name: d.name.trim(),
    output_mhz: output,
    offset_mhz: offset,
    tone_in_kind: d.toneInKind,
    tone_in: d.toneInKind === "none" ? "" : d.toneIn,
    tone_out_kind: outKind,
    tone_out: same ? (d.toneInKind === "none" ? "" : d.toneIn) : d.toneOut,
    mode: d.mode.trim() || "FM",
    notes: d.notes.trim(),
    location_label: d.location?.label ?? "",
    location_lat: d.location?.lat ?? null,
    location_lon: d.location?.lon ?? null,
  };
}

/** A tone choice: none, a PL tone, or a DCS code with polarity (RPT-003). */
function ToneSelect({
  label,
  kind,
  value,
  allowSame = false,
  onChange,
}: {
  label: string;
  kind: ToneKind | "same";
  value: string;
  allowSame?: boolean;
  onChange: (kind: ToneKind | "same", value: string) => void;
}) {
  const code = kind === "dcs" ? value.slice(0, 3) : "";
  const polarity = kind === "dcs" ? value.slice(3) || "N" : "N";
  return (
    <span className="repeater-tone">
      <select
        aria-label={`${label} type`}
        value={kind}
        onChange={(e) => onChange(e.target.value as ToneKind | "same", "")}
      >
        {allowSame && <option value="same">Same as input</option>}
        <option value="none">No tone</option>
        <option value="pl">PL / CTCSS</option>
        <option value="dcs">DCS</option>
      </select>
      {kind === "pl" && (
        <select aria-label={label} value={value} onChange={(e) => onChange("pl", e.target.value)}>
          <option value="">Tone…</option>
          {CTCSS_TONES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      )}
      {kind === "dcs" && (
        <>
          <select
            aria-label={label}
            value={code}
            onChange={(e) => onChange("dcs", e.target.value ? e.target.value + polarity : "")}
          >
            <option value="">Code…</option>
            {DCS_CODES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <select
            aria-label={`${label} polarity`}
            value={polarity}
            onChange={(e) => onChange("dcs", code ? code + e.target.value : "")}
          >
            <option value="N">Normal</option>
            <option value="I">Inverted</option>
          </select>
        </>
      )}
    </span>
  );
}

function RepeaterForm({
  initial,
  onSave,
  onCancel,
}: {
  initial: Draft;
  onSave: (d: RepeaterDetails) => Promise<void>;
  onCancel: () => void;
}) {
  const [d, setD] = useState<Draft>(initial);
  const [error, setError] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const set = (patch: Partial<Draft>) => setD((prev) => ({ ...prev, ...patch }));
  const output = Number(d.output);
  const suggestion = Number.isFinite(output) ? suggestedOffset(output) : null;
  const preview = toDetails(d);

  async function save() {
    const details = toDetails(d);
    if (typeof details === "string") {
      setError(details);
      return;
    }
    try {
      await onSave(details);
    } catch (e) {
      setError(String(e));
    }
  }

  const enter = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") save();
    if (e.key === "Escape") onCancel();
  };

  return (
    <div className="repeater-form">
      <input
        autoFocus
        aria-label="Repeater name"
        placeholder="Name, e.g. W4ABC Orlando"
        value={d.name}
        onChange={(e) => set({ name: e.target.value })}
        onKeyDown={enter}
      />
      <div className="inline-form">
        <label>
          Output MHz
          <input
            aria-label="Output frequency"
            className="repeater-mhz"
            placeholder="146.940"
            value={d.output}
            onChange={(e) => set({ output: e.target.value })}
            onKeyDown={enter}
          />
        </label>
        <label>
          Offset
          <select
            aria-label="Offset direction"
            value={d.offsetDir}
            onChange={(e) => {
              const dir = e.target.value as OffsetDir;
              // The band's usual amount fills in once a direction is chosen.
              const fill = dir !== "simplex" && dir && !d.offsetAmount && suggestion != null;
              set({ offsetDir: dir, ...(fill ? { offsetAmount: suggestion!.toFixed(3) } : {}) });
            }}
          >
            <option value="">Choose…</option>
            <option value="-">Minus (−)</option>
            <option value="+">Plus (+)</option>
            <option value="simplex">Simplex</option>
          </select>
        </label>
        {d.offsetDir !== "simplex" && (
          <input
            aria-label="Offset amount"
            className="repeater-mhz"
            placeholder={suggestion != null ? suggestion.toFixed(3) : "0.600"}
            value={d.offsetAmount}
            onChange={(e) => set({ offsetAmount: e.target.value })}
            onKeyDown={enter}
          />
        )}
        {typeof preview !== "string" && preview.offset_mhz !== 0 && (
          <span className="settings-hint">Input {formatMhz(inputMhz(preview))}</span>
        )}
      </div>
      <div className="inline-form">
        <span className="repeater-field">
          Input tone
          <ToneSelect
            label="Input tone"
            kind={d.toneInKind}
            value={d.toneIn}
            onChange={(kind, value) => set({ toneInKind: kind as ToneKind, toneIn: value })}
          />
        </span>
        <span className="repeater-field">
          Output tone
          <ToneSelect
            label="Output tone"
            kind={d.toneOutKind}
            value={d.toneOut}
            allowSame
            onChange={(kind, value) => set({ toneOutKind: kind, toneOut: value })}
          />
        </span>
      </div>
      <div className="inline-form">
        <label>
          Mode
          <input
            aria-label="Mode"
            className="repeater-mode"
            value={d.mode}
            onChange={(e) => set({ mode: e.target.value })}
            onKeyDown={enter}
          />
        </label>
        <span className="settings-hint">
          Location:{" "}
          {d.location
            ? `${d.location.label ? `${d.location.label} — ` : ""}${formatCoords(d.location.lat, d.location.lon)}`
            : "not set"}
        </span>
        <button type="button" onClick={() => setPicking(true)}>
          {d.location ? "Move" : "Set location"}
        </button>
      </div>
      <input
        aria-label="Notes"
        placeholder="Notes (coverage, linking, sponsor, hours)"
        value={d.notes}
        onChange={(e) => set({ notes: e.target.value })}
        onKeyDown={enter}
      />
      {typeof preview !== "string" && (
        <p className="settings-hint">
          Shows as <strong>{formatRepeater(preview)}</strong>
        </p>
      )}
      {error && <p className="weather-area-error">{error}</p>}
      <div className="inline-form">
        <button onClick={save}>Save repeater</button>
        <button onClick={onCancel}>Cancel</button>
      </div>
      {picking && (
        <LocationPicker
          title={`Location — ${d.name.trim() || "repeater"}`}
          initialLat={d.location?.lat ?? null}
          initialLon={d.location?.lon ?? null}
          initialLabel={d.location?.label ?? ""}
          onSave={(lat, lon, label) => {
            set({ location: { lat, lon, label } });
            setPicking(false);
          }}
          onClear={d.location ? () => set({ location: null }) : undefined}
          onClose={() => setPicking(false)}
        />
      )}
    </div>
  );
}

/** The repeater directory on the Operations tab (RPT-010–012). */
export default function RepeatersPanel({
  repeaters,
  onRepeatersChanged,
  selectedOperatorId,
  netCounts,
}: Props) {
  // null: not editing; "new": adding; otherwise the id being edited.
  const [editing, setEditing] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [retired, setRetired] = useState<Repeater[]>([]);
  const [showRetired, setShowRetired] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Repeaters whose full details are shown under their row.
  const [open, setOpen] = useState<Set<string>>(new Set());
  const toggle = (id: string) =>
    setOpen((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  useEffect(() => {
    api
      .listRepeaters(true)
      .then(setRetired)
      .catch(() => setRetired([]));
  }, [repeaters]);

  async function save(id: string | null, details: RepeaterDetails) {
    await api.saveRepeater(id, details, selectedOperatorId);
    setEditing(null);
    onRepeatersChanged();
  }

  async function setRetiredState(r: Repeater, retire: boolean) {
    setError(null);
    try {
      await api.setRepeaterRetired(r.id, retire, selectedOperatorId);
      onRepeatersChanged();
    } catch (e) {
      setError(String(e));
    }
  }

  const shown = repeaters.filter((r) => repeaterMatches(r, search));

  return (
    <div className="panel">
      <div className="panel-header-row">
        <h3>
          <RadioTower className="heading-icon" />
          Repeaters
        </h3>
        {editing !== "new" && (
          <button className="link-button" onClick={() => setEditing("new")}>
            + Add repeater
          </button>
        )}
      </div>
      {editing === "new" && (
        <RepeaterForm initial={EMPTY} onSave={(d) => save(null, d)} onCancel={() => setEditing(null)} />
      )}
      {repeaters.length > 3 && (
        <input
          type="search"
          className="checkin-roster-search"
          aria-label="Search repeaters"
          placeholder="Search by name, frequency, or notes"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      )}
      <div className="operator-list repeater-list repeater-list-repeaters">
        {repeaters.length === 0 && editing !== "new" && (
          <p className="checkin-empty-state">
            No repeaters yet. Add the ones your nets use, then pick them when creating an activity.
          </p>
        )}
        {repeaters.length > 0 && shown.length === 0 && (
          <p className="checkin-empty-state">No repeaters match “{search.trim()}”.</p>
        )}
        {shown.map((r) =>
          editing === r.id ? (
            <RepeaterForm
              key={r.id}
              initial={draftFrom(r)}
              onSave={(d) => save(r.id, d)}
              onCancel={() => setEditing(null)}
            />
          ) : (
            <Fragment key={r.id}>
              {/* One line each: the name and output frequency; the rest is behind Show. */}
              <div className="operator-row repeater-row">
                <span className="repeater-row-text" title={formatRepeater(r)}>
                  <strong className="repeater-row-name">{r.name}</strong>
                  <span className="repeater-row-freq">
                    <BandChip mhz={r.output_mhz} keepSpace />
                    <span className="checkin-row-mono repeater-row-detail">{formatMhz(r.output_mhz)}</span>
                  </span>
                </span>
                <span className="operator-row-actions repeater-row-actions">
                  <button
                    className="icon-button"
                    aria-label={`Show ${r.name}`}
                    aria-expanded={open.has(r.id)}
                    title={open.has(r.id) ? "Hide details" : "Show details"}
                    onClick={() => toggle(r.id)}
                  >
                    <Info />
                  </button>
                  <button
                    className="icon-button"
                    aria-label={`Edit ${r.name}`}
                    title="Edit"
                    onClick={() => setEditing(r.id)}
                  >
                    <Pencil />
                  </button>
                  <button
                    className="icon-button danger-link"
                    aria-label={`Retire ${r.name}`}
                    title="Retire: hide it from lists. Activities that used it don't change."
                    onClick={() => setRetiredState(r, true)}
                  >
                    <Archive />
                  </button>
                </span>
              </div>
              {open.has(r.id) && (
                <div className="repeater-row-more">
                  <div>{tuningDetails(r)}</div>
                  {r.location_lat != null && r.location_lon != null && (
                    <div>
                      Location: {r.location_label ? `${r.location_label} — ` : ""}
                      {formatCoords(r.location_lat, r.location_lon)}
                    </div>
                  )}
                  {(netCounts?.get(r.id) ?? 0) > 0 && (
                    <div>
                      {netCounts!.get(r.id)} {netCounts!.get(r.id) === 1 ? "net" : "nets"} on this repeater —
                      see the Nets tab
                    </div>
                  )}
                  {r.notes && <div>Notes: {r.notes}</div>}
                </div>
              )}
            </Fragment>
          )
        )}
      </div>
      {error && <p className="weather-area-error">{error}</p>}
      {retired.length > 0 && (
        <>
          <button className="link-button" onClick={() => setShowRetired((v) => !v)}>
            {showRetired ? "Hide retired" : `Show retired (${retired.length})`}
          </button>
          {showRetired &&
            retired.map((r) => (
              <div key={r.id} className="operator-row">
                <span className="settings-hint">
                  {r.name} — {formatRepeater(r)}
                </span>
                <button
                  className="link-button"
                  aria-label={`Restore ${r.name}`}
                  onClick={() => setRetiredState(r, false)}
                >
                  Restore
                </button>
              </div>
            ))}
        </>
      )}
    </div>
  );
}
