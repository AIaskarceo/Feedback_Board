import { useClerk } from '@clerk/clerk-react';
import type { ApprovalStatus } from '@feedback-board/shared';

// Shown instead of the app for any signed-in user whose signup hasn't been
// approved by a company_admin yet (see App.tsx's ApprovalGate). No sidebar/
// nav is rendered — a pending/rejected user has nothing to do here but wait
// or sign out.
export default function PendingApproval({ status }: { status: ApprovalStatus }) {
  const { signOut } = useClerk();

  return (
    <div className="auth-page">
      <div className="card auth-card">
        {status === 'rejected' ? (
          <>
            <h1 className="auth-title">Access denied</h1>
            <p className="auth-subtitle">
              An admin has declined this account. Contact your company admin if you believe this is a mistake.
            </p>
          </>
        ) : (
          <>
            <h1 className="auth-title">Awaiting approval</h1>
            <p className="auth-subtitle">
              Your account has been created and is waiting for a company admin to approve it. You'll be able to
              sign in as soon as that happens.
            </p>
          </>
        )}
        <button className="btn-pill btn-primary auth-submit" onClick={() => signOut()}>
          Sign out
        </button>
      </div>
    </div>
  );
}
