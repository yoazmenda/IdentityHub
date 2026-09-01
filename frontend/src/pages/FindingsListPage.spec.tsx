import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { FindingsListPage } from './FindingsListPage';
import { findingsApi } from '../api/findings';
import { jiraApi } from '../api/jira';
import { ApiRequestError } from '../api/client';
import { AuthProvider } from '../hooks/useAuth';
import type { Finding } from '../types';

vi.mock('../api/findings');
vi.mock('../api/jira');

function makeFinding(overrides: Partial<Finding> = {}): Finding {
  return {
    id: 'f1',
    title: 'Stale Service Account',
    description: 'desc',
    severity: 'high',
    status: 'open',
    jira_ticket: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

function renderPage() {
  return render(
    <MemoryRouter>
      <AuthProvider>
        <FindingsListPage />
      </AuthProvider>
    </MemoryRouter>,
  );
}

describe('FindingsListPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    vi.mocked(jiraApi.status).mockResolvedValue({ connected: false });
  });

  it('shows the empty state with a call-to-action when there are no findings', async () => {
    vi.mocked(findingsApi.list).mockResolvedValue([]);
    renderPage();

    expect(await screen.findByText('No findings yet')).toBeInTheDocument();
    // Two: the persistent toolbar button plus the empty state's own call-to-action.
    expect(screen.getAllByRole('button', { name: /create finding/i })).toHaveLength(2);
  });

  it('shows an error state with a retry action on failure', async () => {
    vi.mocked(findingsApi.list).mockRejectedValue(new ApiRequestError(500, { error: 'Internal server error' }));
    renderPage();

    expect(await screen.findByText("Couldn't load findings")).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument();
  });

  it('renders the Jira Ticket column with the header (regression: it used to be an unlabeled column)', async () => {
    vi.mocked(findingsApi.list).mockResolvedValue([makeFinding()]);
    renderPage();

    expect(await screen.findByRole('columnheader', { name: 'Jira Ticket' })).toBeInTheDocument();
  });

  it('shows the linked ticket key as a link when a finding has one', async () => {
    vi.mocked(findingsApi.list).mockResolvedValue([
      makeFinding({
        jira_ticket: {
          id: 't1',
          jira_issue_key: 'KAN-4',
          jira_url: 'https://acme.atlassian.net/browse/KAN-4',
          jira_project_key: 'KAN',
          title: 'Stale Service Account',
          created_at: new Date().toISOString(),
        },
      }),
    ]);
    renderPage();

    const link = await screen.findByRole('link', { name: /KAN-4/ });
    expect(link).toHaveAttribute('href', 'https://acme.atlassian.net/browse/KAN-4');
  });

  it('shows a "Create ticket" action (not just a bare icon) when Jira is connected and no ticket exists', async () => {
    vi.mocked(jiraApi.status).mockResolvedValue({ connected: true });
    vi.mocked(findingsApi.list).mockResolvedValue([makeFinding()]);
    renderPage();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /create ticket/i })).toBeInTheDocument();
    });
  });

  it('shows a muted "Not connected" hint instead of a create action when Jira is not connected', async () => {
    vi.mocked(findingsApi.list).mockResolvedValue([makeFinding()]);
    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Not connected')).toBeInTheDocument();
    });
    expect(screen.queryByRole('button', { name: /create ticket/i })).not.toBeInTheDocument();
  });
});
