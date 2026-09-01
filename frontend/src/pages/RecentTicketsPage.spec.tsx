import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { RecentTicketsPage } from './RecentTicketsPage';
import { jiraApi, jiraTicketsApi } from '../api/jira';
import { AuthProvider } from '../hooks/useAuth';
import { ApiRequestError } from '../api/client';

vi.mock('../api/jira');

function renderPage() {
  return render(
    <MemoryRouter>
      <AuthProvider>
        <RecentTicketsPage />
      </AuthProvider>
    </MemoryRouter>,
  );
}

describe('RecentTicketsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
  });

  it('shows a "Jira not connected" empty state with a link to Settings when disconnected', async () => {
    vi.mocked(jiraApi.status).mockResolvedValue({ connected: false });
    renderPage();

    expect(await screen.findByText('Jira not connected')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /go to settings/i })).toHaveAttribute('href', '/settings');
  });

  it('defaults to the first project and shows its recent tickets', async () => {
    vi.mocked(jiraApi.status).mockResolvedValue({ connected: true });
    vi.mocked(jiraApi.projects).mockResolvedValue([
      { id: '1', key: 'KAN', name: 'My Software Team' },
      { id: '2', key: 'SEC', name: 'Security' },
    ]);
    vi.mocked(jiraTicketsApi.recent).mockResolvedValue({
      tickets: [
        {
          id: 't1',
          jira_issue_key: 'KAN-4',
          jira_url: 'https://acme.atlassian.net/browse/KAN-4',
          jira_project_key: 'KAN',
          title: 'Stale Service Account',
          created_at: new Date().toISOString(),
        },
      ],
    });
    renderPage();

    await waitFor(() => {
      expect(jiraTicketsApi.recent).toHaveBeenCalledWith({ projectKey: 'KAN', limit: 10 });
    });
    const link = await screen.findByRole('link', { name: /KAN-4/ });
    expect(link).toHaveAttribute('href', 'https://acme.atlassian.net/browse/KAN-4');
  });

  it('shows an empty state when the selected project has no tickets yet', async () => {
    vi.mocked(jiraApi.status).mockResolvedValue({ connected: true });
    vi.mocked(jiraApi.projects).mockResolvedValue([{ id: '1', key: 'KAN', name: 'My Software Team' }]);
    vi.mocked(jiraTicketsApi.recent).mockResolvedValue({ tickets: [] });
    renderPage();

    expect(await screen.findByText('No tickets yet')).toBeInTheDocument();
  });

  it('shows an error state with retry if fetching tickets fails', async () => {
    vi.mocked(jiraApi.status).mockResolvedValue({ connected: true });
    vi.mocked(jiraApi.projects).mockResolvedValue([{ id: '1', key: 'KAN', name: 'My Software Team' }]);
    vi.mocked(jiraTicketsApi.recent).mockRejectedValue(new ApiRequestError(500, { error: 'Internal server error' }));
    renderPage();

    expect(await screen.findByText("Couldn't load tickets")).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument();
  });
});
