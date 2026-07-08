import { useEffect, useState } from 'react';
import type { Analytics } from '@feedback-board/shared';
import { useApiClient } from '../lib/apiClient';
import AppShell from '../components/AppShell';
import ToastList, { useToasts } from '../components/Toast';

function formatHours(hours: number | null): string {
  if (hours === null) return '—';
  if (hours < 24) return `${hours.toFixed(1)} hours`;
  return `${(hours / 24).toFixed(1)} days`;
}

function formatShortDate(isoDate: string): string {
  return new Date(isoDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

// Direct labels are sparing by design (marks-and-anatomy): show at most ~6
// evenly-spaced date labels under the column chart instead of one per bar.
function axisLabelIndexes(count: number, maxLabels = 6): Set<number> {
  if (count <= maxLabels) return new Set(Array.from({ length: count }, (_, i) => i));
  const step = (count - 1) / (maxLabels - 1);
  return new Set(Array.from({ length: maxLabels }, (_, i) => Math.round(i * step)));
}

export default function AnalyticsPage() {
  const apiClient = useApiClient();
  const { toasts, pushToast } = useToasts();
  const [analytics, setAnalytics] = useState<Analytics | null>(null);

  useEffect(() => {
    apiClient.getAnalytics().then((res) => {
      if (res.data) setAnalytics(res.data);
      else if (res.error) pushToast(res.error);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const maxSubmissions = analytics ? Math.max(1, ...analytics.submissionsOverTime.map((d) => d.count)) : 1;
  const maxStatusCount = analytics ? Math.max(1, ...analytics.ideasByStatus.map((s) => s.count)) : 1;
  const maxTeamCount = analytics
    ? Math.max(1, ...analytics.participationByTeam.map((t) => t.submissionCount))
    : 1;

  return (
    <AppShell title="Analytics" subtitle="Participation and delivery metrics.">
      {!analytics && <p className="empty-state">Loading analytics…</p>}

      {analytics && (
        <>
          <div className="stat-tiles">
            <div className="card stat-tile">
              <div className="stat-tile__label">Top contributor</div>
              <div className="stat-tile__value">{analytics.topContributor ? analytics.topContributor.name : '—'}</div>
              {analytics.topContributor && (
                <div className="stat-tile__meta">{analytics.topContributor.ideaCount} ideas submitted</div>
              )}
            </div>
            <div className="card stat-tile">
              <div className="stat-tile__label">Most impactful idea</div>
              <div className="stat-tile__value">
                {analytics.mostImpactfulIdea ? analytics.mostImpactfulIdea.title : '—'}
              </div>
              {analytics.mostImpactfulIdea && (
                <div className="stat-tile__meta">{analytics.mostImpactfulIdea.voteCount} votes · shipped</div>
              )}
            </div>
            <div className="card stat-tile">
              <div className="stat-tile__label">Avg. time to resolution</div>
              <div className="stat-tile__value">{formatHours(analytics.avgTimeToResolutionHours)}</div>
              <div className="stat-tile__meta">submitted → done/declined</div>
            </div>
          </div>

          <div className="card admin-section">
            <h2>Submissions over time (last 30 days)</h2>
            {analytics.submissionsOverTime.length === 0 ? (
              <p className="empty-state">No submissions yet.</p>
            ) : (
              <>
                <div className="column-chart">
                  {analytics.submissionsOverTime.map((day) => (
                    <div key={day.date} className="column-chart__col" title={`${formatShortDate(day.date)}: ${day.count}`}>
                      <div className="column-chart__bar" style={{ height: `${(day.count / maxSubmissions) * 100}%` }} />
                    </div>
                  ))}
                </div>
                <div className="column-chart__axis">
                  {analytics.submissionsOverTime.map((day, index) => {
                    const labeled = axisLabelIndexes(analytics.submissionsOverTime.length).has(index);
                    return (
                      <span key={day.date} className="column-chart__axis-label">
                        {labeled ? formatShortDate(day.date) : ''}
                      </span>
                    );
                  })}
                </div>
              </>
            )}
          </div>

          <div className="card admin-section">
            <h2>Ideas by status</h2>
            <div className="bar-rows">
              {analytics.ideasByStatus.map((s) => (
                <div className="bar-row" key={s.status} title={`${s.status.replace('_', ' ')}: ${s.count}`}>
                  <span className="bar-row__label">{s.status.replace('_', ' ')}</span>
                  <div className="bar-row__track">
                    <div className="bar-row__fill" style={{ width: `${(s.count / maxStatusCount) * 100}%` }} />
                  </div>
                  <span className="bar-row__value">{s.count}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="card admin-section">
            <h2>Participation by team</h2>
            {analytics.participationByTeam.length === 0 ? (
              <p className="empty-state">No teams yet.</p>
            ) : (
              <div className="bar-rows">
                {analytics.participationByTeam.map((t) => (
                  <div className="bar-row" key={t.teamId} title={`${t.teamName}: ${t.submissionCount}`}>
                    <span className="bar-row__label">{t.teamName}</span>
                    <div className="bar-row__track">
                      <div
                        className="bar-row__fill"
                        style={{ width: `${(t.submissionCount / maxTeamCount) * 100}%` }}
                      />
                    </div>
                    <span className="bar-row__value">{t.submissionCount}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      <ToastList toasts={toasts} />
    </AppShell>
  );
}
