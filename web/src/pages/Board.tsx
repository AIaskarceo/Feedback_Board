import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Category, Idea, IdeaSort, IdeaStatus, Team } from '@feedback-board/shared';
import { useApiClient, type IdeaListParams } from '../lib/apiClient';
import { useIsAdmin } from '../lib/CurrentUserContext';
import AppShell from '../components/AppShell';
import IdeaCard from '../components/IdeaCard';
import AddIdeaModal from '../components/AddIdeaModal';
import ToastList, { useToasts } from '../components/Toast';

const STATUS_OPTIONS: { value: IdeaStatus | ''; label: string }[] = [
  { value: '', label: 'All statuses' },
  { value: 'submitted', label: 'Submitted' },
  { value: 'under_review', label: 'Under Review' },
  { value: 'planned', label: 'Planned' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'done', label: 'Done' },
  { value: 'declined', label: 'Declined' },
];

const SORT_OPTIONS: { value: IdeaSort; label: string }[] = [
  { value: 'votes', label: 'Most voted' },
  { value: 'votes_week', label: 'Most voted this week' },
  { value: 'discussed', label: 'Most discussed' },
];

// Dedicated date-order control, shown alongside the sort dropdown.
const DATE_ORDER_OPTIONS: { value: IdeaSort; label: string }[] = [
  { value: 'newest', label: 'Newest to oldest' },
  { value: 'oldest', label: 'Oldest to newest' },
];

export default function Board() {
  const apiClient = useApiClient();
  const { toasts, pushToast } = useToasts();
  const isAdmin = useIsAdmin();

  const [ideas, setIdeas] = useState<Idea[] | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [isAddOpen, setIsAddOpen] = useState(false);

  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<IdeaStatus | ''>('');
  const [categoryId, setCategoryId] = useState('');
  const [teamId, setTeamId] = useState('');
  const [sort, setSort] = useState<IdeaSort>('votes');
  const isDateSort = sort === 'newest' || sort === 'oldest';

  useEffect(() => {
    apiClient.getCategories().then((res) => res.data && setCategories(res.data));
    apiClient.getTeams().then((res) => res.data && setTeams(res.data));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadIdeas = useCallback(async () => {
    const params: IdeaListParams = { sort };
    if (search.trim()) params.search = search.trim();
    if (status) params.status = status;
    if (categoryId) params.categoryId = categoryId;
    if (teamId) params.teamId = teamId;

    const response = await apiClient.getIdeas(params);
    if (response.data) {
      setIdeas(response.data);
    } else if (response.error) {
      pushToast(response.error);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiClient, search, status, categoryId, teamId, sort]);

  useEffect(() => {
    loadIdeas();
  }, [loadIdeas]);

  const categoriesById = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);
  const teamsById = useMemo(() => new Map(teams.map((t) => [t.id, t])), [teams]);

  const handleCreated = (idea: Idea) => {
    setIdeas((current) => (current ? [idea, ...current] : [idea]));
    pushToast('Idea posted');
  };

  const handleUpdated = (updated: Idea) => {
    setIdeas((current) => current?.map((idea) => (idea.id === updated.id ? updated : idea)) ?? current);
  };

  return (
    <AppShell
      title="TRINOS IB"
      subtitle="Submit, discuss, and vote on ideas across the company."
      headerActions={
        <button className="btn-pill btn-primary" onClick={() => setIsAddOpen(true)}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
            <path d="M12 5v14" />
            <path d="M5 12h14" />
          </svg>
          Add idea
        </button>
      }
    >
      <div className="card toolbar">
        <input
          className="text-input toolbar__search"
          placeholder="Search by title, description, or name…"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <div className="toolbar__filters">
          <select className="select-input" value={status} onChange={(event) => setStatus(event.target.value as IdeaStatus | '')}>
            {STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <select className="select-input" value={categoryId} onChange={(event) => setCategoryId(event.target.value)}>
            <option value="">All categories</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
          {isAdmin && (
            <select className="select-input" value={teamId} onChange={(event) => setTeamId(event.target.value)}>
              <option value="">All teams</option>
              {teams.map((team) => (
                <option key={team.id} value={team.id}>
                  {team.name}
                </option>
              ))}
            </select>
          )}
          <select
            className="select-input"
            value={isDateSort ? '' : sort}
            onChange={(event) => setSort(event.target.value as IdeaSort)}
          >
            {isDateSort && (
              <option value="" disabled>
                Sort by…
              </option>
            )}
            {SORT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <select
            className="select-input"
            value={isDateSort ? sort : ''}
            onChange={(event) => event.target.value && setSort(event.target.value as IdeaSort)}
          >
            <option value="">Date order</option>
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

      {ideas !== null && ideas.length === 0 && <p className="empty-state">No ideas match these filters yet.</p>}

      {ideas !== null && ideas.length > 0 && (
        <ul className="idea-list">
          {ideas.map((idea) => (
            <IdeaCard
              key={idea.id}
              idea={idea}
              categoriesById={categoriesById}
              teamsById={teamsById}
              onVoted={handleUpdated}
              onStatusChanged={(updated) => {
                handleUpdated(updated);
                pushToast(`Idea moved to "${updated.status.replace('_', ' ')}"`);
              }}
              onError={pushToast}
            />
          ))}
        </ul>
      )}

      {isAddOpen && (
        <AddIdeaModal
          categories={categories}
          teams={teams}
          onClose={() => setIsAddOpen(false)}
          onCreated={handleCreated}
          onVoted={handleUpdated}
          onError={pushToast}
        />
      )}

      <ToastList toasts={toasts} />
    </AppShell>
  );
}
