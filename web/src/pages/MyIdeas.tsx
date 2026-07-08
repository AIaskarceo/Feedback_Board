import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Category, Idea, IdeaSort, Team } from '@feedback-board/shared';
import { useApiClient } from '../lib/apiClient';
import { useCurrentUser } from '../lib/CurrentUserContext';
import AppShell from '../components/AppShell';
import IdeaCard from '../components/IdeaCard';
import ToastList, { useToasts } from '../components/Toast';

const DATE_ORDER_OPTIONS: { value: IdeaSort; label: string }[] = [
  { value: 'oldest', label: 'Oldest to newest' },
  { value: 'newest', label: 'Newest to oldest' },
];

export default function MyIdeas() {
  const apiClient = useApiClient();
  const { user } = useCurrentUser();
  const { toasts, pushToast } = useToasts();

  const [ideas, setIdeas] = useState<Idea[] | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [sort, setSort] = useState<IdeaSort>('oldest');

  useEffect(() => {
    apiClient.getCategories().then((res) => res.data && setCategories(res.data));
    apiClient.getTeams().then((res) => res.data && setTeams(res.data));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadIdeas = useCallback(async () => {
    if (!user) return;
    const response = await apiClient.getIdeas({ submitterId: user.id, sort });
    if (response.data) {
      setIdeas(response.data);
    } else if (response.error) {
      pushToast(response.error);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiClient, user?.id, sort]);

  useEffect(() => {
    loadIdeas();
  }, [loadIdeas]);

  const categoriesById = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);
  const teamsById = useMemo(() => new Map(teams.map((t) => [t.id, t])), [teams]);

  const handleUpdated = (updated: Idea) => {
    setIdeas((current) => current?.map((idea) => (idea.id === updated.id ? updated : idea)) ?? current);
  };

  return (
    <AppShell title="My Ideas" subtitle="Every idea you've submitted.">
      <div className="card toolbar">
        <div className="toolbar__filters">
          <select className="select-input" value={sort} onChange={(event) => setSort(event.target.value as IdeaSort)}>
            {DATE_ORDER_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {ideas === null && (
        <ul className="idea-list">
          {[0, 1, 2].map((key) => (
            <li key={key} className="card idea-skeleton" aria-hidden="true" />
          ))}
        </ul>
      )}

      {ideas !== null && ideas.length === 0 && <p className="empty-state">You haven't submitted any ideas yet.</p>}

      {ideas !== null && ideas.length > 0 && (
        <ul className="idea-list">
          {ideas.map((idea) => (
            <IdeaCard
              key={idea.id}
              idea={idea}
              categoriesById={categoriesById}
              teamsById={teamsById}
              onVoted={handleUpdated}
              onStatusChanged={handleUpdated}
              onError={pushToast}
            />
          ))}
        </ul>
      )}

      <ToastList toasts={toasts} />
    </AppShell>
  );
}
