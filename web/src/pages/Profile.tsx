import { useEffect, useMemo, useRef, useState } from 'react';
import type { Idea, Team } from '@feedback-board/shared';
import { useApiClient } from '../lib/apiClient';
import { useCurrentUser } from '../lib/CurrentUserContext';
import { readFileAsBase64 } from '../lib/fileToBase64';
import AppShell from '../components/AppShell';
import UserAvatar from '../components/UserAvatar';
import ToastList, { useToasts } from '../components/Toast';

const ROLE_LABELS: Record<string, string> = {
  member: 'Member',
  team_lead: 'Team Lead',
  company_admin: 'Company Admin',
};

const PREFERENCE_LABELS: Record<string, string> = {
  immediate: 'Immediate',
  digest: 'Weekly digest',
  off: 'Off',
};

const MAX_AVATAR_BYTES = 2 * 1024 * 1024;

// Accounts created via email sign-up often have their name defaulted to the
// full email address, which reads badly as a heading. Derive a friendlier
// display name from the local part in that case; otherwise use the real name.
function toDisplayName(name: string, email: string): string {
  const looksLikeEmail = name.includes('@') || name === email;
  const base = looksLikeEmail ? name.split('@')[0] : name;
  return base
    .split(/[._-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

export default function Profile() {
  const apiClient = useApiClient();
  const { user, refresh, avatarVersion } = useCurrentUser();
  const { toasts, pushToast } = useToasts();
  const [team, setTeam] = useState<Team | null>(null);
  const [myIdeas, setMyIdeas] = useState<Idea[] | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!user) return;
    if (user.teamId) {
      apiClient.getTeams().then((res) => {
        if (res.data) setTeam(res.data.find((t) => t.id === user.teamId) ?? null);
      });
    }
    apiClient.getIdeas({ submitterId: user.id }).then((res) => {
      if (res.data) setMyIdeas(res.data);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, user?.teamId]);

  const votesReceived = useMemo(
    () => (myIdeas ? myIdeas.reduce((sum, idea) => sum + idea.voteCount, 0) : 0),
    [myIdeas],
  );

  if (!user) {
    return (
      <AppShell title="TRINOS IB / User Profile">
        <p className="empty-state">Loading your profile…</p>
      </AppShell>
    );
  }

  // Selecting a file only stages a preview — nothing is saved until the user
  // confirms with "Save photo".
  const handleFileSelected = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || isBusy) return;
    if (file.size > MAX_AVATAR_BYTES) {
      pushToast('Image must be 2MB or smaller.');
      return;
    }
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPendingFile(file);
    setPreviewUrl(URL.createObjectURL(file));
  };

  const clearPending = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPendingFile(null);
    setPreviewUrl(null);
  };

  const handleSavePhoto = async () => {
    if (!pendingFile || isBusy) return;
    setIsBusy(true);
    const dataBase64 = await readFileAsBase64(pendingFile);
    const res = await apiClient.uploadAvatar(pendingFile.type || 'image/png', dataBase64);
    setIsBusy(false);
    if (res.data) {
      clearPending();
      refresh();
      pushToast('Profile photo updated.');
    } else {
      pushToast(res.error ?? 'Could not update your photo.');
    }
  };

  const handleRemovePhoto = async () => {
    if (isBusy) return;
    setIsBusy(true);
    const res = await apiClient.deleteAvatar();
    setIsBusy(false);
    if (res.data) {
      refresh();
      pushToast('Profile photo removed.');
    } else {
      pushToast(res.error ?? 'Could not remove your photo.');
    }
  };

  return (
    <AppShell title="TRINOS IB / User Profile" subtitle="Your account details and activity.">
      <div className="card profile-card">
        <div className="profile-cover" />

        <div className="profile-card__body">
          <div className="profile-card__identity">
            <div className="profile-card__avatar">
              {previewUrl ? (
                <img className="avatar avatar--photo" style={{ width: 104, height: 104 }} src={previewUrl} alt="Preview" />
              ) : (
                <UserAvatar
                  userId={user.id}
                  name={user.name}
                  hasAvatar={user.hasAvatar}
                  size={104}
                  version={avatarVersion}
                />
              )}
            </div>
            <div className="profile-card__headline">
              <h2 className="profile-card__name">{toDisplayName(user.name, user.email)}</h2>
              <div className="profile-card__meta">
                <span className="badge badge--role">{ROLE_LABELS[user.role] ?? user.role}</span>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={handleFileSelected}
                  style={{ display: 'none' }}
                />
                {previewUrl ? (
                  <>
                    <button className="btn-pill btn-primary btn-small" disabled={isBusy} onClick={handleSavePhoto}>
                      {isBusy ? 'Saving…' : 'Save photo'}
                    </button>
                    <button className="btn-pill btn-ghost btn-small" disabled={isBusy} onClick={clearPending}>
                      Cancel
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      className="btn-pill btn-primary btn-small"
                      disabled={isBusy}
                      onClick={() => fileInputRef.current?.click()}
                    >
                      {!user.hasAvatar && (
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
                          <path d="M12 5v14M5 12h14" />
                        </svg>
                      )}
                      {user.hasAvatar ? 'Change photo' : 'Add photo'}
                    </button>
                    {user.hasAvatar && (
                      <button className="btn-pill btn-ghost btn-small" disabled={isBusy} onClick={handleRemovePhoto}>
                        Remove
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="profile-stats">
            <div className="profile-stat">
              <span className="profile-stat__value">{myIdeas ? myIdeas.length : '—'}</span>
              <span className="profile-stat__label">Ideas submitted</span>
            </div>
            <div className="profile-stat">
              <span className="profile-stat__value">{myIdeas ? votesReceived : '—'}</span>
              <span className="profile-stat__label">Votes received</span>
            </div>
          </div>

          <dl className="profile-info">
            <div className="profile-info__row">
              <dt>Email</dt>
              <dd>{user.email}</dd>
            </div>
            <div className="profile-info__row">
              <dt>Role</dt>
              <dd>{ROLE_LABELS[user.role] ?? user.role}</dd>
            </div>
            <div className="profile-info__row">
              <dt>Team</dt>
              <dd>{team ? team.name : 'No team assigned'}</dd>
            </div>
            <div className="profile-info__row">
              <dt>Notifications</dt>
              <dd>{PREFERENCE_LABELS[user.notificationPreference] ?? user.notificationPreference}</dd>
            </div>
          </dl>
        </div>
      </div>

      <ToastList toasts={toasts} />
    </AppShell>
  );
}
