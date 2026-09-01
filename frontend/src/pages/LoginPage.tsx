import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Fingerprint } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { Button } from '../components/Button';
import { TextField } from '../components/FormField';
import { ApiRequestError } from '../api/client';

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('john@acme.com');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await login(email, password);
      navigate('/findings');
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.body.error : 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center">
          <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-accent-600">
            <Fingerprint className="h-6 w-6 text-white" />
          </div>
          <h1 className="text-xl font-semibold text-gray-900">IdentityHub</h1>
          <p className="mt-1 text-sm text-gray-500">Non-Human Identity management</p>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-card">
          <form onSubmit={handleSubmit} className="space-y-4">
            <TextField
              id="email"
              label="Email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            <TextField
              id="password"
              label="Password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            {error && <p className="text-sm text-red-600">{error}</p>}
            <Button type="submit" loading={loading} className="w-full">
              Log in
            </Button>
          </form>
        </div>

        <p className="mt-6 text-center text-sm text-gray-500">
          Don&apos;t have an account?{' '}
          <Link to="/register" className="font-medium text-accent-600 hover:text-accent-700">
            Sign up
          </Link>
        </p>

        <p className="mt-3 text-center text-xs text-gray-400">
          Demo: john@acme.com / password123
        </p>
      </div>
    </div>
  );
}
