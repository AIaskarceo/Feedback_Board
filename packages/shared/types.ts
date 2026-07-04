// FROZEN CONTRACT — do not edit after Phase 0 merge without sign-off from Dev A, Dev B, and Dev C.

export interface User {
  id: string;
  clerkId: string;
  email: string;
  name: string;
  role: 'member' | 'admin';
}

export interface Idea {
  id: string;
  text: string;
  status: 'open' | 'done';
  submitterId: string;
  submitterName: string;
  voteCount: number;
  hasVoted: boolean;
  isOwn: boolean;
  createdAt: string;
}

export interface Vote {
  ideaId: string;
  userId: string;
}

export interface ApiResponse<T> {
  data?: T;
  error?: string;
}
