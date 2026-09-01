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

  it('still shows previously created tickets from the local ledger when Jira is disconnected', async () => {
    // Regression: revoking access in Jira (or letting the connection expire) must not hide tickets
    // already filed — Recent Tickets reads a local ledger, never the live Jira API (see README).
    vi.mocked(jiraApi.status).mockResolvedValue({ connected: false });
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
      expect(jiraTicketsApi.recent).toHaveBeenCalledWith({ projectKey: undefined, limit: 10 });
    });
    expect(jiraApi.projects).not.toHaveBeenCalled();
    const link = await screen.findByRole('link', { name: /KAN-4/ });
    expect(link).toHaveAttribute('href', 'https://acme.atlassian.net/browse/KAN-4');
    expect(screen.getByText(/Connect Jira in/)).toBeInTheDocument();
  });

  it('shows a "no tickets yet" empty state with a reconnect hint when disconnected and nothing was ever filed', async () => {
    vi.mocked(jiraApi.status).mockResolvedValue({ connected: false });
    vi.mocked(jiraTicketsApi.recent).mockResolvedValue({ tickets: [] });
    renderPage();

    expect(await screen.findByText('No tickets yet')).toBeInTheDocument();
    expect(screen.getByText(/Connect Jira in/)).toBeInTheDocument();
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
