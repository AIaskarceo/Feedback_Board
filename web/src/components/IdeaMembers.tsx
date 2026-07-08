import { useEffect, useState } from 'react';
import type { DirectoryUser, IdeaMember } from '@feedback-board/shared';
import { useApiClient } from '../lib/apiClient';
import UserAvatar from './UserAvatar';
import MemberPicker from './MemberPicker';

interface IdeaMembersProps {
  ideaId: string;
  submitterId: string;
  canManageMembers: boolean;
  onError: (message: string) => void;
}

// Collaborators added to build the idea together — visible to anyone who can
// view the idea; only the submitter (or an admin) can add/remove one.
export default function IdeaMembers({ ideaId, submitterId, canManageMembers, onError }: IdeaMembersProps) {
  const apiClient = useApiClient();
  const [members, setMembers] = useState<IdeaMember[] | null>(null);
  const [directory, setDirectory] = useState<DirectoryUser[]>([]);
  const [isAdding, setIsAdding] = useState(false);

  useEffect(() => {
    let cancelled = false;
    apiClient.getMembers(ideaId).then((res) => {
      if (!cancelled && res.data) setMembers(res.data);
      if (!cancelled && res.error) onError(res.error);
    });
    if (canManageMembers) {
      apiClient.getDirectory().then((res) => {
        if (!cancelled && res.data) setDirectory(res.data);
      });
    }
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ideaId, canManageMembers]);

  const handleAdd = async (userIds: string[]) => {
    const newUserId = userIds.find((id) => !members?.some((m) => m.userId === id));
    if (!newUserId || isAdding) return;
    setIsAdding(true);
    const res = await apiClient.addMember(ideaId, newUserId);
    setIsAdding(false);
    if (res.data) {
      setMembers((current) => (current ? [...current, res.data!] : [res.data!]));
    } else {
      onError(res.error ?? 'Could not add this member.');
    }
  };

  const handleRemove = async (userId: string) => {
    const res = await apiClient.removeMember(ideaId, userId);
    if (res.error) {
      onError(res.error);
      return;
    }
    setMembers((current) => current?.filter((m) => m.userId !== userId) ?? current);
  };

  if (members === null) {
    return <p className="idea-card__submitter">Loading members…</p>;
  }

  return (
    <div className="resource-links">
      {members.length === 0 && <p className="idea-card__submitter">No collaborators added yet.</p>}

      {members.length > 0 && (
        <ul className="resource-links__list">
          {members.map((member) => (
            <li key={member.userId} className="resource-links__item">
              <UserAvatar userId={member.userId} name={member.name} hasAvatar={member.hasAvatar} size={26} />
              <span className="resource-links__link">{member.name}</span>
              <span className="resource-links__meta">
                added {new Date(member.createdAt).toLocaleDateString()}
              </span>
              {canManageMembers && (
                <button
                  className="btn-pill btn-ghost btn-small"
                  onClick={() => handleRemove(member.userId)}
                  aria-label={`Remove ${member.name} from this idea`}
                >
                  Remove
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {canManageMembers && (
        <MemberPicker
          directory={directory}
          excludeUserIds={[submitterId, ...members.map((m) => m.userId)]}
          selectedUserIds={[]}
          onChange={handleAdd}
        />
      )}
    </div>
  );
}
