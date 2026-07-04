import { useUser } from '@clerk/clerk-react';

export function useIsAdmin(): boolean {
  const { user } = useUser();
  return user?.publicMetadata?.role === 'admin';
}
