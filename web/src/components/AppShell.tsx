import type { ReactNode } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useClerk, useUser } from '@clerk/clerk-react';
import type { NotificationPreference } from '@feedback-board/shared';
import { useApiClient } from '../lib/apiClient';
import { useCurrentUser, useIsAdmin, useIsTeamLead } from '../lib/CurrentUserContext';
import NotificationBell from './NotificationBell';
import UserAvatar from './UserAvatar';
import { useTheme } from '../lib/theme';

function SunIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  );
}

// Folded origami "delta" mark approximating the trinos logo (three facets for
// the 3D fold). Swap this for an <img src="/trinos-logo.svg"> if the real
// asset is dropped into web/public/.
function TrinosLogo() {
  return (
    <svg viewBox="0 0 32 32" fill="none" aria-hidden="true" focusable="false">
      {/* left face — medium steel blue */}
      <path d="M16 3 L4 27 L16 21 Z" fill="#4a7fb5" />
      {/* right face — pale blue */}
      <path d="M16 3 L16 21 L28 27 Z" fill="#a9c9e6" />
      {/* bottom fold — darker, creates the origami depth */}
      <path d="M4 27 L16 21 L28 27 L16 24 Z" fill="#2e5c8a" />
    </svg>
  );
}

const ROLE_LABELS: Record<string, string> = {
  member: 'Member',
  team_lead: 'Team Lead',
  company_admin: 'Company Admin',
};

interface AppShellProps {
  title: string;
  subtitle?: string;
  headerActions?: ReactNode;
  children: ReactNode;
}

export default function AppShell({ title, subtitle, headerActions, children }: AppShellProps) {
  const { user } = useUser();
  const { signOut } = useClerk();
  const { user: currentUser } = useCurrentUser();
  const apiClient = useApiClient();
  const isAdmin = useIsAdmin();
  const isTeamLead = useIsTeamLead();
  const { theme, toggleTheme } = useTheme();
  const { avatarVersion } = useCurrentUser();
  const navigate = useNavigate();

  const displayName = currentUser?.name ?? user?.fullName ?? user?.primaryEmailAddress?.emailAddress ?? 'there';
  const roleLabel = currentUser ? ROLE_LABELS[currentUser.role] ?? currentUser.role : null;

  const handlePreferenceChange = (preference: NotificationPreference) => {
    apiClient.updateNotificationPreference(preference);
  };

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="sidebar__brand">
          <span className="sidebar__logo">
            <TrinosLogo />
          </span>
          <span className="sidebar__brand-name">TRINOS IB</span>
        </div>

        <nav className="sidebar__nav">
          <NavLink to="/" end className={({ isActive }) => `sidebar__link${isActive ? ' sidebar__link--active' : ''}`}>
            Board
          </NavLink>
          <NavLink to="/my-ideas" className={({ isActive }) => `sidebar__link${isActive ? ' sidebar__link--active' : ''}`}>
            My Ideas
          </NavLink>
          {(isAdmin || isTeamLead) && (
            <NavLink to="/analytics" className={({ isActive }) => `sidebar__link${isActive ? ' sidebar__link--active' : ''}`}>
              Analytics
            </NavLink>
          )}
          {isAdmin && (
            <NavLink to="/audit-log" className={({ isActive }) => `sidebar__link${isActive ? ' sidebar__link--active' : ''}`}>
              Audit Log
            </NavLink>
          )}
          {isAdmin && (
            <NavLink to="/admin" className={({ isActive }) => `sidebar__link${isActive ? ' sidebar__link--active' : ''}`}>
              Admin
            </NavLink>
          )}
        </nav>

        <button className="btn-pill btn-primary sidebar__sign-out" onClick={() => signOut()}>
          Sign Out
        </button>
      </aside>

      <div className="shell__main">
        <header className="topbar">
          <div>
            <h1 className="topbar__title">{title}</h1>
            {subtitle && <p className="topbar__subtitle">{subtitle}</p>}
          </div>
          <div className="topbar__actions">
            {headerActions}
            {currentUser && (
              <select
                className="select-input"
                defaultValue={currentUser.notificationPreference}
                title="Notification preference"
                onChange={(event) => handlePreferenceChange(event.target.value as NotificationPreference)}
              >
                <option value="immediate">Notify: Immediate</option>
                <option value="digest">Notify: Weekly digest</option>
                <option value="off">Notify: Off</option>
              </select>
            )}
            <button
              className="bell-btn"
              onClick={toggleTheme}
              title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
              aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            >
              {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
            </button>
            <NotificationBell />
            {roleLabel && <span className="badge badge--role">{roleLabel}</span>}
            {currentUser && (
              <button
                className="avatar-btn"
                onClick={() => navigate('/profile')}
                title="My profile"
                aria-label="Open my profile"
              >
                <UserAvatar
                  userId={currentUser.id}
                  name={displayName}
                  hasAvatar={currentUser.hasAvatar}
                  version={avatarVersion}
                />
              </button>
            )}
          </div>
        </header>

        <main className="shell__content">{children}</main>
      </div>
    </div>
  );
}
