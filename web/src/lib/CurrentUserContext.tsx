import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { useAuth } from '@clerk/clerk-react';
import type { User } from '@feedback-board/shared';
import { useApiClient } from './apiClient';

interface CurrentUserState {
  user: User | null;
  isLoading: boolean;
  // Re-fetches the current user (e.g. after they change their profile photo).
  refresh: () => void;
  // Bumped on each refresh so <UserAvatar> knows to re-fetch the photo bytes.
  avatarVersion: number;
}

const CurrentUserContext = createContext<CurrentUserState>({
  user: null,
  isLoading: true,
  refresh: () => {},
  avatarVersion: 0,
});

// Admin status must come from the database (the real source of truth the
// server enforces), not Clerk publicMetadata — nothing keeps that in sync.
export function CurrentUserProvider({ children }: { children: ReactNode }) {
  const { isSignedIn } = useAuth();
  const apiClient = useApiClient();
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [avatarVersion, setAvatarVersion] = useState(0);
  const [reloadKey, setReloadKey] = useState(0);

  const refresh = useCallback(() => {
    setAvatarVersion((v) => v + 1);
    setReloadKey((k) => k + 1);
  }, []);

  useEffect(() => {
    if (!isSignedIn) {
      setUser(null);
      setIsLoading(false);
      return;
    }

    let cancelled = false;
    setIsLoading(true);

    apiClient.getMe().then((response) => {
      if (!cancelled) {
        setUser(response.data ?? null);
        setIsLoading(false);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [isSignedIn, apiClient, reloadKey]);

  return (
    <CurrentUserContext.Provider value={{ user, isLoading, refresh, avatarVersion }}>
      {children}
    </CurrentUserContext.Provider>
  );
}

export function useCurrentUser(): CurrentUserState {
  return useContext(CurrentUserContext);
}

export function useIsAdmin(): boolean {
  return useCurrentUser().user?.role === 'company_admin';
}

export function useIsTeamLead(): boolean {
  return useCurrentUser().user?.role === 'team_lead';
}

// Whether the current user can drive an idea's lifecycle / moderate its
// comments: any company_admin, or the team_lead of the idea's own team.
export function useCanManageIdea(idea: { teamId: string | null }): boolean {
  const { user } = useCurrentUser();
  if (!user) return false;
  if (user.role === 'company_admin') return true;
  return user.role === 'team_lead' && idea.teamId !== null && idea.teamId === user.teamId;
}
