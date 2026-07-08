import { useMemo, useState } from 'react';
import type { DirectoryUser } from '@feedback-board/shared';
import UserAvatar from './UserAvatar';

interface MemberPickerProps {
  directory: DirectoryUser[];
  excludeUserIds: string[];
  selectedUserIds: string[];
  onChange: (userIds: string[]) => void;
}

// A search-to-add picker for building a list of collaborator user ids —
// purely local selection state; the caller decides when/how to persist it
// (immediately via the API, or batched until an idea is created).
export default function MemberPicker({ directory, excludeUserIds, selectedUserIds, onChange }: MemberPickerProps) {
  const [query, setQuery] = useState('');

  const selected = useMemo(
    () => directory.filter((u) => selectedUserIds.includes(u.id)),
    [directory, selectedUserIds],
  );

  const results = useMemo(() => {
    if (!query.trim()) return [];
    const q = query.trim().toLowerCase();
    return directory
      .filter((u) => !excludeUserIds.includes(u.id) && !selectedUserIds.includes(u.id))
      .filter((u) => u.name.toLowerCase().includes(q) || u.username.toLowerCase().includes(q))
      .slice(0, 6);
  }, [directory, query, excludeUserIds, selectedUserIds]);

  const addUser = (userId: string) => {
    onChange([...selectedUserIds, userId]);
    setQuery('');
  };

  const removeUser = (userId: string) => {
    onChange(selectedUserIds.filter((id) => id !== userId));
  };

  return (
    <div className="member-picker">
      {selected.length > 0 && (
        <div className="member-picker__chips">
          {selected.map((u) => (
            <span className="member-chip" key={u.id}>
              <UserAvatar userId={u.id} name={u.name} hasAvatar={u.hasAvatar} size={22} />
              {u.name}
              <button
                type="button"
                className="member-chip__remove"
                aria-label={`Remove ${u.name}`}
                onClick={() => removeUser(u.id)}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}

      <input
        className="text-input"
        placeholder="Search people by name…"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />

      {results.length > 0 && (
        <ul className="member-picker__results">
          {results.map((u) => (
            <li key={u.id}>
              <button type="button" className="member-picker__result" onClick={() => addUser(u.id)}>
                <UserAvatar userId={u.id} name={u.name} hasAvatar={u.hasAvatar} size={26} />
                {u.name}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
