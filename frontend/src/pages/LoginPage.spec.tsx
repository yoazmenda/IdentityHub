import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { LoginPage } from './LoginPage';
import { AuthProvider } from '../hooks/useAuth';
import { ApiRequestError } from '../api/client';
import * as authApi from '../api/auth';

vi.mock('../api/auth');

function renderLoginPage() {
  return render(
    <MemoryRouter initialEntries={['/login']}>
      <AuthProvider>
        <LoginPage />
      </AuthProvider>
    </MemoryRouter>,
  );
}

describe('LoginPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
  });

  it('submits the entered credentials', async () => {
    vi.mocked(authApi.login).mockResolvedValue({ id: 'u1', name: 'Ada', email: 'ada@acme.com' });
    renderLoginPage();

    await userEvent.clear(screen.getByLabelText('Email'));
    await userEvent.type(screen.getByLabelText('Email'), 'ada@acme.com');
    await userEvent.type(screen.getByLabelText('Password'), 'password123');
    await userEvent.click(screen.getByRole('button', { name: 'Log in' }));

    await waitFor(() => {
      expect(authApi.login).toHaveBeenCalledWith('ada@acme.com', 'password123');
    });
  });

  it('shows the server error message on failed login, and does not crash', async () => {
    vi.mocked(authApi.login).mockRejectedValue(new ApiRequestError(401, { error: 'Invalid email or password' }));
    renderLoginPage();

    await userEvent.type(screen.getByLabelText('Password'), 'wrong-password');
    await userEvent.click(screen.getByRole('button', { name: 'Log in' }));

    expect(await screen.findByText('Invalid email or password')).toBeInTheDocument();
  });

  it('has a link to the register page', () => {
    renderLoginPage();
    expect(screen.getByRole('link', { name: 'Sign up' })).toHaveAttribute('href', '/register');
  });
});
