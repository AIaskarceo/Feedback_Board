import { useEffect, useState } from 'react';
import type { StatusHistoryEntry } from '@feedback-board/shared';
import { useApiClient } from '../lib/apiClient';
import AppShell from '../components/AppShell';
import ToastList, { useToasts } from '../components/Toast';

export default function AuditLog() {
  const apiClient = useApiClient();
  const { toasts, pushToast } = useToasts();
  const [entries, setEntries] = useState<StatusHistoryEntry[] | null>(null);

  useEffect(() => {
    apiClient.getAuditLog().then((res) => {
      if (res.data) setEntries(res.data);
      else if (res.error) pushToast(res.error);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <AppShell title="Audit Log" subtitle="The 500 most recent idea status changes, newest first.">
      <div className="card table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Idea</th>
              <th>Changed by</th>
              <th>From</th>
              <th>To</th>
              <th>Reason</th>
              <th>When</th>
            </tr>
          </thead>
          <tbody>
            {entries === null && (
              <tr>
                <td colSpan={6}>Loading…</td>
              </tr>
            )}
            {entries !== null && entries.length === 0 && (
              <tr>
                <td colSpan={6}>No status changes yet.</td>
              </tr>
            )}
            {entries?.map((entry) => (
              <tr key={entry.id}>
                <td>{entry.ideaId.slice(0, 8)}</td>
                <td>{entry.changedByName}</td>
                <td>{entry.fromStatus ?? '—'}</td>
                <td>{entry.toStatus}</td>
                <td>{entry.reason ?? '—'}</td>
                <td>{new Date(entry.changedAt).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ToastList toasts={toasts} />
    </AppShell>
  );
}
