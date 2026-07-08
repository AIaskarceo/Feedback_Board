import { useEffect, useState } from 'react';
import { useApiClient } from '../lib/apiClient';

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || '?';
}

interface UserAvatarProps {
  userId: string;
  name: string;
  hasAvatar: boolean;
  size?: number;
  // Bump to force a re-fetch after the current user changes their own photo.
  version?: number;
}

// Shows a user's profile photo when they've set one, otherwise their initials.
// The photo endpoint needs an auth header, so the bytes are fetched as an
// object URL rather than used directly as an <img src>.
export default function UserAvatar({ userId, name, hasAvatar, size = 40, version = 0 }: UserAvatarProps) {
  const apiClient = useApiClient();
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!hasAvatar || !userId) {
      setUrl(null);
      return;
    }
    let objectUrl: string | null = null;
    let cancelled = false;
    apiClient.fetchAvatarUrl(userId).then((fetched) => {
      if (cancelled) {
        if (fetched) URL.revokeObjectURL(fetched);
        return;
      }
      objectUrl = fetched;
      setUrl(fetched);
    });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, hasAvatar, version]);

  const style = { width: size, height: size, fontSize: size * 0.4 };

  if (url) {
    return <img className="avatar avatar--photo" style={style} src={url} alt={name} title={name} />;
  }
  return (
    <span className="avatar" style={style} title={name}>
      {initials(name)}
    </span>
  );
}
