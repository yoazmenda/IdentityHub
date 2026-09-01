import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { CreateFindingPage } from './CreateFindingPage';
import { findingsApi } from '../api/findings';
import { jiraApi } from '../api/jira';
import { AuthProvider } from '../hooks/useAuth';
import { ApiRequestError } from '../api/client';

vi.mock('../api/findings');
vi.mock('../api/jira');

function renderPage() {
  return render(
    <MemoryRouter>
      <AuthProvider>
        <CreateFindingPage />
      </AuthProvider>
    </MemoryRouter>,
  );
}

describe('CreateFindingPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
  });

  it('disables the "also create a Jira ticket" toggle and shows a hint when Jira is not connected', async () => {
    vi.mocked(jiraApi.status).mockResolvedValue({ connected: false });
    renderPage();

    await waitFor(() => {
      expect(screen.getByRole('switch')).toHaveAttribute('data-disabled');
    });
    expect(screen.getByText('Connect Jira in Settings to create tickets from findings.')).toBeInTheDocument();
  });

  it('shows field-level validation errors returned by the API', async () => {
    vi.mocked(jiraApi.status).mockResolvedValue({ connected: false });
    vi.mocked(findingsApi.create).mockRejectedValue(
      new ApiRequestError(400, {
        error: 'Validation failed',
        details: [{ field: 'severity', message: 'must be one of: critical, high, medium, low' }],
      }),
    );
    renderPage();

    await userEvent.type(screen.getByLabelText('Title'), 'X');
    await userEvent.type(screen.getByLabelText('Description'), 'Y');
    await userEvent.click(screen.getByRole('button', { name: 'Create Finding' }));

    expect(await screen.findByText('must be one of: critical, high, medium, low')).toBeInTheDocument();
  });

  it('navigates to the new finding on success', async () => {
    vi.mocked(jiraApi.status).mockResolvedValue({ connected: false });
    vi.mocked(findingsApi.create).mockResolvedValue({
      id: 'f1',
      title: 'X',
      description: 'Y',
      severity: 'medium',
      status: 'open',
      jira_ticket: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
    renderPage();

    await userEvent.type(screen.getByLabelText('Title'), 'X');
    await userEvent.type(screen.getByLabelText('Description'), 'Y');
    await userEvent.click(screen.getByRole('button', { name: 'Create Finding' }));

    await waitFor(() => {
      expect(findingsApi.create).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'X', description: 'Y', severity: 'medium' }),
      );
    });
  });

  it('shows Project and Issue Type dropdowns once enabled, when Jira is connected', async () => {
    vi.mocked(jiraApi.status).mockResolvedValue({ connected: true });
    vi.mocked(jiraApi.projects).mockResolvedValue([{ id: '1', key: 'KAN', name: 'My Software Team' }]);
    renderPage();

    const toggle = await screen.findByRole('switch');
    await waitFor(() => expect(toggle).not.toHaveAttribute('data-disabled'));
    await userEvent.click(toggle);

    expect(await screen.findByLabelText('Project')).toBeInTheDocument();
    expect(screen.getByLabelText('Issue Type')).toBeInTheDocument();
  });
});
