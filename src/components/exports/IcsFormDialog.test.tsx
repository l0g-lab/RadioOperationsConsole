import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { Activity, Checkin, RelayMessage } from "../../types";

vi.mock("../../api", () => ({
  listCheckins: vi.fn(),
  listRelayMessages: vi.fn(),
}));

import * as api from "../../api";
import IcsFormDialog from "./IcsFormDialog";

const act = (id: string, title: string, activity_type: string, operator_id: string): Activity =>
  ({
    id,
    title,
    activity_type,
    operator_id,
    event: "ARRL 2026 SET",
    state: "closed",
    scheduled_at: "",
    opened_at: "2026-10-03T13:00:00Z",
    closed_at: "2026-10-03T16:00:00Z",
  }) as Activity;

const checkin = (id: string, call: string, at: string) =>
  ({ id, call_sign: call, checked_in_at: at, traffic: "", has_traffic: false }) as Checkin;

const ham = act("ham", "Ham net", "directed_net", "o-ham");
const gmrs = act("gmrs", "GMRS net", "directed_net", "o-gmrs");
const relay = act("relay", "Injects", "relay", "o-ham");

describe("ICS 309 for a whole event (EVT-040)", () => {
  it("merges every activity's log lines under the event's name, and can leave one out", async () => {
    vi.mocked(api.listCheckins).mockImplementation(async (id: string) =>
      id === "ham"
        ? [checkin("c1", "W1AW", "2026-10-03T13:05:00Z")]
        : id === "gmrs"
          ? [checkin("c2", "WRAB123", "2026-10-03T14:05:00Z"), checkin("c3", "WRXX999", "2026-10-03T14:06:00Z")]
          : []
    );
    vi.mocked(api.listRelayMessages).mockResolvedValue([
      {
        id: "m1",
        received_at: "2026-10-03T13:30:00Z",
        from_station: "Control",
        for_station: "EOC",
        message: "Inject 1",
        steps: [],
      } as unknown as RelayMessage,
    ]);
    const user = userEvent.setup();
    render(
      <IcsFormDialog
        form="309"
        activity={ham}
        event={{ name: "ARRL 2026 SET", activities: [ham, gmrs, relay] }}
        callFor={(a) => (a.operator_id === "o-gmrs" ? "WRAB123" : "K4NCS")}
        operatorName="Pat"
        operatorCall="K4NCS"
        onClose={() => {}}
      />
    );
    expect(await screen.findByText(/4 entries/)).toBeInTheDocument();
    expect(screen.getAllByDisplayValue("ARRL 2026 SET").length).toBeGreaterThan(0);

    await user.click(screen.getByRole("checkbox", { name: /GMRS net/ }));
    expect(await screen.findByText(/2 entries/)).toBeInTheDocument();
  });
});
