import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { RegisterPage } from './RegisterPage';
import { AuthProvider } from '../hooks/useAuth';
import { ApiRequestError } from '../api/client';
import * as authApi from '../api/auth';

vi.mock('../api/auth');

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/register']}>
      <AuthProvider>
        <RegisterPage />
      </AuthProvider>
    </MemoryRouter>,
  );
}

describe('RegisterPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
  });

  it('submits name, email, and password', async () => {
    vi.mocked(authApi.register).mockResolvedValue({ id: 'u1', name: 'Ada', email: 'ada@acme.com' });
    renderPage();

    await userEvent.type(screen.getByLabelText('Full name'), 'Ada');
    await userEvent.type(screen.getByLabelText('Email'), 'ada@acme.com');
    await userEvent.type(screen.getByLabelText('Password'), 'password123');
    await userEvent.click(screen.getByRole('button', { name: 'Create account' }));

    expect(authApi.register).toHaveBeenCalledWith('ada@acme.com', 'password123', 'Ada');
  });

  it('shows the server error on failure (e.g. duplicate email) without crashing', async () => {
    vi.mocked(authApi.register).mockRejectedValue(
      new ApiRequestError(409, { error: 'An account with this email already exists' }),
    );
    renderPage();

    await userEvent.type(screen.getByLabelText('Full name'), 'Ada');
    await userEvent.type(screen.getByLabelText('Email'), 'ada@acme.com');
    await userEvent.type(screen.getByLabelText('Password'), 'password123');
    await userEvent.click(screen.getByRole('button', { name: 'Create account' }));

    expect(await screen.findByText('An account with this email already exists')).toBeInTheDocument();
  });

  it('links back to login', () => {
    renderPage();
    expect(screen.getByRole('link', { name: 'Log in' })).toHaveAttribute('href', '/login');
  });
});
