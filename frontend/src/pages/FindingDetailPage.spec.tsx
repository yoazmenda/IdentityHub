import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { FindingDetailPage } from './FindingDetailPage';
import { findingsApi } from '../api/findings';
import { jiraApi } from '../api/jira';
import { AuthProvider } from '../hooks/useAuth';
import { ApiRequestError } from '../api/client';
import type { Finding } from '../types';

vi.mock('../api/findings');
vi.mock('../api/jira');

function makeFinding(overrides: Partial<Finding> = {}): Finding {
  return {
    id: 'f1',
    title: 'Stale Service Account',
    description: 'Unused for 90 days',
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
    <MemoryRouter initialEntries={['/findings/f1']}>
      <AuthProvider>
        <Routes>
          <Route path="/findings/:id" element={<FindingDetailPage />} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  );
}

describe('FindingDetailPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    vi.mocked(jiraApi.status).mockResolvedValue({ connected: false });
    vi.stubGlobal('confirm', vi.fn(() => true));
  });

  it('shows an error state with a retry action when the finding fails to load', async () => {
    vi.mocked(findingsApi.get).mockRejectedValue(new ApiRequestError(404, { error: 'Finding not found' }));
    renderPage();

    expect(await screen.findByText("Couldn't load this finding")).toBeInTheDocument();
    expect(screen.getByText('Finding not found')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument();
  });

  it('shows a "no ticket linked yet" state with a Create Jira Ticket action when Jira is connected', async () => {
    vi.mocked(jiraApi.status).mockResolvedValue({ connected: true });
    vi.mocked(findingsApi.get).mockResolvedValue(makeFinding());
    renderPage();

    expect(await screen.findByText('No Jira ticket linked to this finding yet.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create Jira Ticket' })).toBeInTheDocument();
  });

  it('shows a Connect Jira hint instead of the create action when Jira is not connected', async () => {
    vi.mocked(findingsApi.get).mockResolvedValue(makeFinding());
    renderPage();

    expect(await screen.findByText('No Jira ticket linked to this finding yet.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Create Jira Ticket' })).not.toBeInTheDocument();
    expect(screen.getByText(/connect jira in/i)).toBeInTheDocument();
  });

  it('shows the linked ticket as a clickable link when one exists', async () => {
    vi.mocked(findingsApi.get).mockResolvedValue(
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
    );
    renderPage();

    const link = await screen.findByRole('link', { name: /KAN-4/ });
    expect(link).toHaveAttribute('href', 'https://acme.atlassian.net/browse/KAN-4');
    expect(screen.queryByText('No Jira ticket linked to this finding yet.')).not.toBeInTheDocument();
  });

  it('asks for confirmation before deleting, and does nothing if declined', async () => {
    vi.mocked(findingsApi.get).mockResolvedValue(makeFinding());
    vi.stubGlobal('confirm', vi.fn(() => false));
    renderPage();

    await userEvent.click(await screen.findByRole('button', { name: 'Delete finding' }));

    expect(findingsApi.delete).not.toHaveBeenCalled();
  });
});
