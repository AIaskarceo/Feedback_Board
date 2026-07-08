import { useEffect, useMemo, useState, type FormEvent } from 'react';
import type { Category, ExportFormat, ExportLogEntry, Flag, Idea, Role, Team, User } from '@feedback-board/shared';
import { useApiClient } from '../lib/apiClient';
import AppShell from '../components/AppShell';
import ToastList, { useToasts } from '../components/Toast';

const ROLE_OPTIONS: { value: Role; label: string }[] = [
  { value: 'member', label: 'Member' },
  { value: 'team_lead', label: 'Team Lead' },
  { value: 'company_admin', label: 'Company Admin' },
];

export default function Admin() {
  const apiClient = useApiClient();
  const { toasts, pushToast } = useToasts();

  const [teams, setTeams] = useState<Team[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [pendingUsers, setPendingUsers] = useState<User[]>([]);
  const [flags, setFlags] = useState<Flag[]>([]);
  const [newTeamName, setNewTeamName] = useState('');
  const [newCategoryName, setNewCategoryName] = useState('');

  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [mergeSourceId, setMergeSourceId] = useState('');
  const [mergeTargetId, setMergeTargetId] = useState('');
  const [isMerging, setIsMerging] = useState(false);
  const [retagIdeaIds, setRetagIdeaIds] = useState<string[]>([]);
  const [retagCategoryId, setRetagCategoryId] = useState('');
  const [isRetagging, setIsRetagging] = useState(false);

  const [retentionMonths, setRetentionMonths] = useState('');
  const [isSavingRetention, setIsSavingRetention] = useState(false);
  const [isRunningRetention, setIsRunningRetention] = useState(false);
  const [exportLog, setExportLog] = useState<ExportLogEntry[]>([]);
  const [isExporting, setIsExporting] = useState<ExportFormat | null>(null);

  const ideasById = useMemo(() => new Map(ideas.map((idea) => [idea.id, idea])), [ideas]);

  const reload = () => {
    apiClient.getTeams().then((res) => res.data && setTeams(res.data));
    apiClient.getCategories().then((res) => res.data && setCategories(res.data));
    apiClient.getUsers().then((res) => res.data && setUsers(res.data));
    apiClient.getPendingUsers().then((res) => res.data && setPendingUsers(res.data));
    apiClient.getFlags().then((res) => res.data && setFlags(res.data));
    apiClient.getIdeas().then((res) => res.data && setIdeas(res.data));
    apiClient.getAppSettings().then((res) => res.data && setRetentionMonths(String(res.data.retentionMonths)));
    apiClient.getExportLog().then((res) => res.data && setExportLog(res.data));
  };

  useEffect(reload, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleCreateTeam = async (event: FormEvent) => {
    event.preventDefault();
    const name = newTeamName.trim();
    if (!name) return;
    const res = await apiClient.createTeam(name);
    if (res.data) {
      setTeams((current) => [...current, res.data!].sort((a, b) => a.name.localeCompare(b.name)));
      setNewTeamName('');
    } else {
      pushToast(res.error ?? 'Could not create team.');
    }
  };

  const handleCreateCategory = async (event: FormEvent) => {
    event.preventDefault();
    const name = newCategoryName.trim();
    if (!name) return;
    const res = await apiClient.createCategory(name);
    if (res.data) {
      setCategories((current) => [...current, res.data!].sort((a, b) => a.name.localeCompare(b.name)));
      setNewCategoryName('');
    } else {
      pushToast(res.error ?? 'Could not create category.');
    }
  };

  const handleRoleChange = async (userId: string, role: Role) => {
    const res = await apiClient.updateUserRole(userId, role);
    if (res.data) {
      setUsers((current) => current.map((u) => (u.id === userId ? res.data! : u)));
    } else {
      pushToast(res.error ?? 'Could not update role.');
    }
  };

  const handleTeamChange = async (userId: string, teamId: string) => {
    const res = await apiClient.updateUserTeam(userId, teamId || null);
    if (res.data) {
      setUsers((current) => current.map((u) => (u.id === userId ? res.data! : u)));
    } else {
      pushToast(res.error ?? 'Could not update team.');
    }
  };

  const handleRestrictToggle = async (userId: string, isRestricted: boolean) => {
    const res = await apiClient.updateUserRestricted(userId, isRestricted);
    if (res.data) {
      setUsers((current) => current.map((u) => (u.id === userId ? res.data! : u)));
    } else {
      pushToast(res.error ?? 'Could not update restriction.');
    }
  };

  const handleApprove = async (userId: string) => {
    const res = await apiClient.approveUser(userId);
    if (res.data) {
      setPendingUsers((current) => current.filter((u) => u.id !== userId));
      setUsers((current) => current.map((u) => (u.id === userId ? res.data! : u)));
    } else {
      pushToast(res.error ?? 'Could not approve user.');
    }
  };

  const handleReject = async (userId: string) => {
    const res = await apiClient.rejectUser(userId);
    if (res.data) {
      setPendingUsers((current) => current.filter((u) => u.id !== userId));
      setUsers((current) => current.map((u) => (u.id === userId ? res.data! : u)));
    } else {
      pushToast(res.error ?? 'Could not reject user.');
    }
  };

  const handleFlagAction = async (flagId: string, status: 'dismissed' | 'removed') => {
    const res = await apiClient.updateFlagStatus(flagId, status);
    if (res.data) {
      setFlags((current) => current.map((f) => (f.id === flagId ? res.data! : f)));
    } else {
      pushToast(res.error ?? 'Could not update flag.');
    }
  };

  const handleMerge = async () => {
    if (!mergeSourceId || !mergeTargetId || mergeSourceId === mergeTargetId || isMerging) return;
    setIsMerging(true);
    const res = await apiClient.mergeIdea(mergeSourceId, mergeTargetId);
    setIsMerging(false);
    if (res.data) {
      setIdeas((current) =>
        current.map((idea) => {
          if (idea.id === res.data!.source.id) return res.data!.source;
          if (idea.id === res.data!.target.id) return res.data!.target;
          return idea;
        }),
      );
      setMergeSourceId('');
      setMergeTargetId('');
      pushToast('Ideas merged.');
    } else {
      pushToast(res.error ?? 'Could not merge ideas.');
    }
  };

  const toggleRetagIdea = (ideaId: string) => {
    setRetagIdeaIds((current) =>
      current.includes(ideaId) ? current.filter((id) => id !== ideaId) : [...current, ideaId],
    );
  };

  const handleBulkRetag = async () => {
    if (retagIdeaIds.length === 0 || isRetagging) return;
    setIsRetagging(true);
    const res = await apiClient.bulkRetagIdeas(retagIdeaIds, retagCategoryId || null);
    setIsRetagging(false);
    if (res.data) {
      const updatedById = new Map(res.data.map((idea) => [idea.id, idea]));
      setIdeas((current) => current.map((idea) => updatedById.get(idea.id) ?? idea));
      pushToast(`Re-tagged ${res.data.length} of ${retagIdeaIds.length} selected idea(s).`);
      setRetagIdeaIds([]);
    } else {
      pushToast(res.error ?? 'Could not re-tag ideas.');
    }
  };

  const handleSaveRetention = async () => {
    const months = Number(retentionMonths);
    if (!Number.isInteger(months) || months <= 0 || isSavingRetention) return;
    setIsSavingRetention(true);
    const res = await apiClient.updateAppSettings(months);
    setIsSavingRetention(false);
    if (res.data) {
      setRetentionMonths(String(res.data.retentionMonths));
      pushToast('Retention window updated.');
    } else {
      pushToast(res.error ?? 'Could not update retention settings.');
    }
  };

  const handleRunRetention = async () => {
    if (isRunningRetention) return;
    setIsRunningRetention(true);
    const res = await apiClient.runRetention();
    setIsRunningRetention(false);
    if (res.data) {
      pushToast(`Archived ${res.data.archived} stale idea(s).`);
      reload();
    } else {
      pushToast(res.error ?? 'Could not run retention.');
    }
  };

  const handleExport = async (format: ExportFormat) => {
    if (isExporting) return;
    setIsExporting(format);
    const res = await apiClient.downloadExport(format);
    setIsExporting(null);
    if ('error' in res) {
      pushToast(res.error);
      return;
    }
    const url = URL.createObjectURL(res.blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `ideas-export.${format}`;
    link.click();
    URL.revokeObjectURL(url);
    apiClient.getExportLog().then((logRes) => logRes.data && setExportLog(logRes.data));
  };

  const handleSendDigest = async () => {
    const res = await apiClient.sendDigestNow();
    if (res.data) {
      pushToast(`Digest sent to ${res.data.sent} user(s)${res.data.failed ? `, ${res.data.failed} failed` : ''}.`);
    } else {
      pushToast(res.error ?? 'Could not send digest.');
    }
  };

  return (
    <AppShell title="Admin" subtitle="Manage teams, categories, and user access.">
      <div className="card admin-section">
        <h2>Teams</h2>
        <ul className="admin-list">
          {teams.map((team) => (
            <li key={team.id}>{team.name}</li>
          ))}
          {teams.length === 0 && <li>No teams yet.</li>}
        </ul>
        <form className="inline-form" onSubmit={handleCreateTeam}>
          <input
            className="text-input"
            placeholder="New team name"
            value={newTeamName}
            onChange={(event) => setNewTeamName(event.target.value)}
          />
          <button className="btn-pill btn-primary" type="submit" disabled={!newTeamName.trim()}>
            Add team
          </button>
        </form>
      </div>

      <div className="card admin-section">
        <h2>Categories</h2>
        <ul className="admin-list">
          {categories.map((category) => (
            <li key={category.id}>{category.name}</li>
          ))}
          {categories.length === 0 && <li>No categories yet.</li>}
        </ul>
        <form className="inline-form" onSubmit={handleCreateCategory}>
          <input
            className="text-input"
            placeholder="New category name"
            value={newCategoryName}
            onChange={(event) => setNewCategoryName(event.target.value)}
          />
          <button className="btn-pill btn-primary" type="submit" disabled={!newCategoryName.trim()}>
            Add category
          </button>
        </form>
      </div>

      <div className="card admin-section">
        <h2>Users</h2>
        <ul className="admin-list">
          {users.map((user) => (
            <li key={user.id}>
              <span>
                {user.name} · {user.email}
              </span>
              <span style={{ display: 'flex', gap: 8 }}>
                <select
                  className="select-input"
                  value={user.role}
                  onChange={(event) => handleRoleChange(user.id, event.target.value as Role)}
                >
                  {ROLE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <select
                  className="select-input"
                  value={user.teamId ?? ''}
                  onChange={(event) => handleTeamChange(user.id, event.target.value)}
                >
                  <option value="">No team</option>
                  {teams.map((team) => (
                    <option key={team.id} value={team.id}>
                      {team.name}
                    </option>
                  ))}
                </select>
                <button
                  className={`btn-pill btn-small ${user.isRestricted ? 'btn-primary' : 'btn-danger'}`}
                  onClick={() => handleRestrictToggle(user.id, !user.isRestricted)}
                >
                  {user.isRestricted ? 'Unrestrict' : 'Restrict'}
                </button>
              </span>
            </li>
          ))}
        </ul>
      </div>

      <div className="card admin-section">
        <h2>Pending approvals</h2>
        <ul className="admin-list">
          {pendingUsers.map((user) => (
            <li key={user.id}>
              <span>
                {user.name} · {user.email}
              </span>
              <span style={{ display: 'flex', gap: 8 }}>
                <button className="btn-pill btn-primary btn-small" onClick={() => handleApprove(user.id)}>
                  Approve
                </button>
                <button className="btn-pill btn-danger btn-small" onClick={() => handleReject(user.id)}>
                  Reject
                </button>
              </span>
            </li>
          ))}
          {pendingUsers.length === 0 && <li>No signups awaiting approval.</li>}
        </ul>
      </div>

      <div className="card admin-section">
        <h2>Merge duplicate ideas</h2>
        <p className="idea-card__submitter">
          The duplicate is declined and its votes/comments move onto the idea it's merged into.
        </p>
        <div className="inline-form">
          <select className="select-input" value={mergeSourceId} onChange={(event) => setMergeSourceId(event.target.value)}>
            <option value="">Duplicate idea…</option>
            {ideas.map((idea) => (
              <option key={idea.id} value={idea.id}>
                {idea.title} ({idea.status})
              </option>
            ))}
          </select>
          <select className="select-input" value={mergeTargetId} onChange={(event) => setMergeTargetId(event.target.value)}>
            <option value="">Merge into…</option>
            {ideas.map((idea) => (
              <option key={idea.id} value={idea.id}>
                {idea.title} ({idea.status})
              </option>
            ))}
          </select>
          <button
            className="btn-pill btn-primary"
            disabled={!mergeSourceId || !mergeTargetId || mergeSourceId === mergeTargetId || isMerging}
            onClick={handleMerge}
          >
            {isMerging ? 'Merging…' : 'Merge'}
          </button>
        </div>
      </div>

      <div className="card admin-section">
        <h2>Bulk re-tag</h2>
        <ul className="admin-list">
          {ideas.map((idea) => (
            <li key={idea.id}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input
                  type="checkbox"
                  checked={retagIdeaIds.includes(idea.id)}
                  onChange={() => toggleRetagIdea(idea.id)}
                />
                {idea.title}
              </label>
              <span className="badge badge--outline">
                {categories.find((c) => c.id === idea.categoryId)?.name ?? 'Uncategorized'}
              </span>
            </li>
          ))}
          {ideas.length === 0 && <li>No ideas yet.</li>}
        </ul>
        <div className="inline-form">
          <select
            className="select-input"
            value={retagCategoryId}
            onChange={(event) => setRetagCategoryId(event.target.value)}
          >
            <option value="">Uncategorized</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
          <button className="btn-pill btn-primary" disabled={retagIdeaIds.length === 0 || isRetagging} onClick={handleBulkRetag}>
            {isRetagging ? 'Applying…' : `Apply to ${retagIdeaIds.length} selected`}
          </button>
        </div>
      </div>

      <div className="card admin-section">
        <h2>Retention &amp; export</h2>
        <p className="idea-card__submitter">
          Done/declined ideas with no activity for this many months are archived automatically every night.
        </p>
        <div className="inline-form">
          <input
            className="text-input"
            type="number"
            min={1}
            value={retentionMonths}
            onChange={(event) => setRetentionMonths(event.target.value)}
            aria-label="Retention window in months"
          />
          <button className="btn-pill btn-ghost" disabled={isSavingRetention} onClick={handleSaveRetention}>
            {isSavingRetention ? 'Saving…' : 'Save'}
          </button>
          <button className="btn-pill btn-ghost" disabled={isRunningRetention} onClick={handleRunRetention}>
            {isRunningRetention ? 'Archiving…' : 'Archive stale ideas now'}
          </button>
        </div>
        <div className="inline-form">
          <button className="btn-pill btn-primary" disabled={isExporting !== null} onClick={() => handleExport('csv')}>
            {isExporting === 'csv' ? 'Exporting…' : 'Export CSV'}
          </button>
          <button className="btn-pill btn-primary" disabled={isExporting !== null} onClick={() => handleExport('json')}>
            {isExporting === 'json' ? 'Exporting…' : 'Export JSON'}
          </button>
        </div>
        {exportLog.length > 0 && (
          <ul className="admin-list">
            {exportLog.slice(0, 5).map((entry) => (
              <li key={entry.id}>
                <span>
                  {entry.adminName} exported {entry.ideaCount} idea(s) as {entry.format.toUpperCase()}
                </span>
                <span className="idea-card__submitter">{new Date(entry.exportedAt).toLocaleString()}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="card admin-section">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2>Moderation queue</h2>
          <button className="btn-pill btn-ghost btn-small" onClick={handleSendDigest}>
            Send weekly digest now
          </button>
        </div>
        <ul className="admin-list">
          {flags.map((flag) => (
            <li key={flag.id}>
              <span>
                {flag.contentType === 'idea'
                  ? (ideasById.get(flag.contentId)?.title ?? 'Idea (not found)')
                  : 'Comment'}{' '}
                · {flag.reason} · <em>{flag.status}</em>
              </span>
              {flag.status === 'open' && (
                <span style={{ display: 'flex', gap: 8 }}>
                  <button className="btn-pill btn-ghost btn-small" onClick={() => handleFlagAction(flag.id, 'dismissed')}>
                    Dismiss
                  </button>
                  <button className="btn-pill btn-danger btn-small" onClick={() => handleFlagAction(flag.id, 'removed')}>
                    Remove content
                  </button>
                </span>
              )}
            </li>
          ))}
          {flags.length === 0 && <li>No flagged content.</li>}
        </ul>
      </div>

      <ToastList toasts={toasts} />
    </AppShell>
  );
}
