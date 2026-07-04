import { SignIn as ClerkSignIn, useUser } from '@clerk/clerk-react';
import { Navigate } from 'react-router-dom';

export default function SignIn() {
  const { isSignedIn } = useUser();

  if (isSignedIn) {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="auth-page">
      <ClerkSignIn routing="hash" afterSignInUrl="/" afterSignUpUrl="/" />
    </div>
  );
}
