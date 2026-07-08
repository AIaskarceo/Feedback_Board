import { useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useSignIn, useUser } from '@clerk/clerk-react';
import { clerkErrorMessage } from '../lib/clerkErrors';

export default function SignIn() {
  const { isSignedIn } = useUser();
  const { isLoaded, signIn, setActive } = useSignIn();
  const navigate = useNavigate();

  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (isSignedIn) {
    return <Navigate to="/" replace />;
  }

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!isLoaded || isSubmitting) return;

    setError(null);
    setIsSubmitting(true);
    try {
      const result = await signIn.create({ identifier, password });
      if (result.status === 'complete') {
        await setActive({ session: result.createdSessionId });
        navigate('/');
      } else {
        setError('Additional verification is required for this account.');
      }
    } catch (err) {
      setError(clerkErrorMessage(err, 'Could not sign in. Check your email and password.'));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="card auth-card">
        <h1 className="auth-title">Sign in to TRINOS IB</h1>
        <p className="auth-subtitle">Welcome back — sign in with your email.</p>

        <form onSubmit={handleSubmit}>
          <div className="form-field">
            <label className="field-label" htmlFor="identifier">
              Email address
            </label>
            <input
              id="identifier"
              type="email"
              className="text-input"
              value={identifier}
              autoFocus
              required
              onChange={(event) => setIdentifier(event.target.value)}
            />
          </div>

          <div className="form-field">
            <label className="field-label" htmlFor="password">
              Password
            </label>
            <input
              id="password"
              type="password"
              className="text-input"
              value={password}
              required
              onChange={(event) => setPassword(event.target.value)}
            />
          </div>

          {error && <p className="auth-error">{error}</p>}

          <button type="submit" className="btn-pill btn-primary auth-submit" disabled={!isLoaded || isSubmitting}>
            {isSubmitting ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <p className="auth-switch">
          Don't have an account? <Link to="/sign-up">Sign up</Link>
        </p>
      </div>
    </div>
  );
}
