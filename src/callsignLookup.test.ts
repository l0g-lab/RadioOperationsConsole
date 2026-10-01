import { beforeEach, describe, expect, it, vi } from "vitest";
import type { OfflineCallLookup } from "./types";

vi.mock("./api", () => ({
  lookupQrzCallsign: vi.fn(),
  lookupCallsignOffline: vi.fn(),
}));

import * as api from "./api";
import { callSignService, lookupCallsign, sourceLabels } from "./callsignLookup";

const record = {
  call: "WRAB123",
  name: "Pat Example",
  street: "1 Main St",
  city: "Roscommon",
  state: "MI",
  zip: "48653",
  coords: null,
};

function offline(over: Partial<OfflineCallLookup> = {}): OfflineCallLookup {
  return { installed: true, record: null, has_street_addresses: true, ...over };
}

describe("callSignService (CALLDIR-041)", () => {
  it.each(["WRAB123", "wrab123", "KAE1234", " WRXZ999 ", "WRAB123/2", "WRAB123/M"])(
    "%s is GMRS",
    (call) => expect(callSignService(call)).toBe("gmrs")
  );

  it.each(["W1AW", "K8ABC", "KD8XYZ", "N0C", "AA1A", "kd8xyz/p", "VE3/KD8XYZ"])(
    "%s is amateur",
    (call) => expect(callSignService(call)).toBe("amateur")
  );

  it.each(["", "VE3ABC1", "WR12345", "ABCDE123", "1234", "NET"])("%s is unknown", (call) =>
    expect(callSignService(call)).toBe("unknown")
  );
});

describe("lookupCallsign routing", () => {
  beforeEach(() => {
    vi.mocked(api.lookupQrzCallsign).mockReset();
    vi.mocked(api.lookupCallsignOffline).mockReset();
  });

  it("looks a GMRS call sign up only in the GMRS file, never QRZ (CALLDIR-042)", async () => {
    vi.mocked(api.lookupCallsignOffline).mockResolvedValue(offline({ record }));
    const r = await lookupCallsign("WRAB123", true);
    expect(api.lookupQrzCallsign).not.toHaveBeenCalled();
    expect(api.lookupCallsignOffline).toHaveBeenCalledWith("WRAB123", "gmrs");
    expect(r).toMatchObject({ kind: "found", source: "gmrs", data: { name: "Pat Example" } });
  });

  it("reports a GMRS call sign missing from the GMRS file as not found", async () => {
    vi.mocked(api.lookupCallsignOffline).mockResolvedValue(offline());
    expect(await lookupCallsign("WRAB123", true)).toEqual({ kind: "not_found", source: "gmrs" });
  });

  it("says the GMRS file is needed when it isn't installed (CALLDIR-044)", async () => {
    vi.mocked(api.lookupCallsignOffline).mockResolvedValue(offline({ installed: false }));
    expect(await lookupCallsign("WRAB123", true)).toEqual({
      kind: "missing_file",
      service: "gmrs",
    });
  });

  it("keeps QRZ first for amateur call signs, using the amateur file only as fallback (CALLDIR-043)", async () => {
    vi.mocked(api.lookupQrzCallsign).mockRejectedValue("offline");
    vi.mocked(api.lookupCallsignOffline).mockResolvedValue(
      offline({ record: { ...record, call: "K8ABC" } })
    );
    const r = await lookupCallsign("K8ABC", true);
    expect(api.lookupQrzCallsign).toHaveBeenCalledWith("K8ABC");
    expect(api.lookupCallsignOffline).toHaveBeenCalledWith("K8ABC", "amateur");
    expect(r).toMatchObject({ kind: "found", source: "fcc" });
  });

  it("treats an unknown shape like amateur", async () => {
    vi.mocked(api.lookupCallsignOffline).mockResolvedValue(offline());
    await lookupCallsign("VE3ABC1", false);
    expect(api.lookupCallsignOffline).toHaveBeenCalledWith("VE3ABC1", "amateur");
  });
});

describe("sourceLabels (CALLDIR-022, CALLDIR-045)", () => {
  it("names the file a result came from, and marks a GMRS name as the licensee's", () => {
    expect(sourceLabels("fcc").found).toBe("FCC amateur record (offline)");
    expect(sourceLabels("gmrs").found).toBe("FCC GMRS record (offline) · licensee");
    expect(sourceLabels("qrz").found).toBe("QRZ match");
    expect(sourceLabels("gmrs").notFound).toBe("not in FCC GMRS file");
    expect(sourceLabels("fcc").notFound).toBe("not in FCC amateur file");
  });
});
