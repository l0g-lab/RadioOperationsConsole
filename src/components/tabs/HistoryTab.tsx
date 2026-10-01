import { useEffect, useState } from "react";
import * as api from "../../api";
import type { AuditEvent } from "../../types";
import { History } from "lucide-react";

export default function HistoryTab() {
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .listRecentAuditEvents(100)
      .then(setEvents)
      .catch((e) => setError(String(e)));
  }, []);

  return (
    <div className="panel">
      <h3><History className="heading-icon" />History &amp; Audit Events</h3>
      {error && <p>History query error: {error}</p>}
      <div className="event-list">
        {events.map((e) => (
          <div key={e.id}>
            {e.created_at} {e.entity_type} {e.action} {e.data}
          </div>
        ))}
      </div>
    </div>
  );
}
