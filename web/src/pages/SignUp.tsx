import { useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useSignUp, useUser } from '@clerk/clerk-react';
import { clerkErrorMessage } from '../lib/clerkErrors';

export default function SignUp() {
  const { isSignedIn } = useUser();
  const { isLoaded, signUp, setActive } = useSignUp();
  const navigate = useNavigate();

  const [step, setStep] = useState<'details' | 'verify'>('details');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (isSignedIn) {
    return <Navigate to="/" replace />;
  }

  const handleCreate = async (event: FormEvent) => {
    event.preventDefault();
    if (!isLoaded || isSubmitting) return;

    setError(null);
    setIsSubmitting(true);
    try {
      const [firstName, ...rest] = name.trim().split(/\s+/);
      await signUp.create({
        emailAddress: email,
        password,
        firstName,
        lastName: rest.join(' ') || undefined,
      });
      await signUp.prepareEmailAddressVerification({ strategy: 'email_code' });
      setStep('verify');
    } catch (err) {
      setError(clerkErrorMessage(err, 'Could not create your account.'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleVerify = async (event: FormEvent) => {
    event.preventDefault();
    if (!isLoaded || isSubmitting) return;

    setError(null);
    setIsSubmitting(true);
    try {
      const result = await signUp.attemptEmailAddressVerification({ code });
      if (result.status === 'complete') {
        await setActive({ session: result.createdSessionId });
        navigate('/');
      } else {
        setError('Verification incomplete — double-check the code and try again.');
      }
    } catch (err) {
      setError(clerkErrorMessage(err, 'Could not verify that code.'));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="card auth-card">
        <h1 className="auth-title">Create your account</h1>

        {step === 'details' && (
          <>
            <p className="auth-subtitle">Your full name is what shows on your ideas and what people search for.</p>
            <form onSubmit={handleCreate}>
              <div className="form-field">
                <label className="field-label" htmlFor="name">
                  Full name
                </label>
                <input
                  id="name"
                  className="text-input"
                  value={name}
                  required
                  autoFocus
                  onChange={(e) => setName(e.target.value)}
                />
              </div>

              <div className="form-field">
                <label className="field-label" htmlFor="email">
                  Email address
                </label>
                <input
                  id="email"
                  type="email"
                  className="text-input"
                  value={email}
                  required
                  onChange={(e) => setEmail(e.target.value)}
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
                  minLength={8}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>

              {/* Clerk's bot-protection widget mounts here when enabled. */}
              <div id="clerk-captcha" />

              {error && <p className="auth-error">{error}</p>}

              <button type="submit" className="btn-pill btn-primary auth-submit" disabled={!isLoaded || isSubmitting}>
                {isSubmitting ? 'Creating account…' : 'Create account'}
              </button>
            </form>
          </>
        )}

        {step === 'verify' && (
          <>
            <p className="auth-subtitle">We sent a verification code to {email}. Enter it below.</p>
            <form onSubmit={handleVerify}>
              <div className="form-field">
                <label className="field-label" htmlFor="code">
                  Verification code
                </label>
                <input
                  id="code"
                  className="text-input"
                  value={code}
                  required
                  autoFocus
                  onChange={(e) => setCode(e.target.value)}
                />
              </div>

              {error && <p className="auth-error">{error}</p>}

              <button type="submit" className="btn-pill btn-primary auth-submit" disabled={!isLoaded || isSubmitting}>
                {isSubmitting ? 'Verifying…' : 'Verify & continue'}
              </button>
            </form>
          </>
        )}

        <p className="auth-switch">
          Already have an account? <Link to="/sign-in">Sign in</Link>
        </p>
      </div>
    </div>
  );
}
