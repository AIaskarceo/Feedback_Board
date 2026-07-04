import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { useAuth } from '@clerk/clerk-react';
import type { User } from '@feedback-board/shared';
import { useApiClient } from './apiClient';

interface CurrentUserState {
  user: User | null;
  isLoading: boolean;
}

const CurrentUserContext = createContext<CurrentUserState>({ user: null, isLoading: true });

// Admin status must come from the database (the real source of truth the
// server enforces), not Clerk publicMetadata — nothing keeps that in sync.
export function CurrentUserProvider({ children }: { children: ReactNode }) {
  const { isSignedIn } = useAuth();
  const apiClient = useApiClient();
  const [state, setState] = useState<CurrentUserState>({ user: null, isLoading: true });

  useEffect(() => {
    if (!isSignedIn) {
      setState({ user: null, isLoading: false });
      return;
    }

    let cancelled = false;
    setState((current) => ({ ...current, isLoading: true }));

    apiClient.getMe().then((response) => {
      if (!cancelled) {
        setState({ user: response.data ?? null, isLoading: false });
      }
    });

    return () => {
      cancelled = true;
    };
  }, [isSignedIn, apiClient]);

  return <CurrentUserContext.Provider value={state}>{children}</CurrentUserContext.Provider>;
}

export function useCurrentUser(): CurrentUserState {
  return useContext(CurrentUserContext);
}

export function useIsAdmin(): boolean {
  return useCurrentUser().user?.role === 'admin';
}
