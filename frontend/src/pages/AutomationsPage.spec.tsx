import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { AutomationsPage } from './AutomationsPage';
import { automationsApi } from '../api/automations';
import { jiraApi } from '../api/jira';
import { AuthProvider } from '../hooks/useAuth';
import { ApiRequestError } from '../api/client';
import type { Automation } from '../types';

vi.mock('../api/automations');
vi.mock('../api/jira');

function makeAutomation(overrides: Partial<Automation> = {}): Automation {
  return {
    id: 'auto-1',
    type: 'blog_digest',
    enabled: false,
    schedule: 'manual',
    config: {},
    last_processed_url: null,
    runs: [],
    ...overrides,
  };
}

function renderPage() {
  return render(
    <MemoryRouter>
      <AuthProvider>
        <AutomationsPage />
      </AuthProvider>
    </MemoryRouter>,
  );
}

describe('AutomationsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    vi.mocked(jiraApi.status).mockResolvedValue({ connected: false });
  });

  it('shows an error state with a retry action on failure', async () => {
    vi.mocked(automationsApi.list).mockRejectedValue(new ApiRequestError(500, { error: 'Internal server error' }));
    renderPage();

    expect(await screen.findByText("Couldn't load automations")).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument();
  });

  it('hints to connect Jira and disables the toggle when Jira is not connected', async () => {
    vi.mocked(automationsApi.list).mockResolvedValue([makeAutomation()]);
    renderPage();

    expect(await screen.findByText(/Connect Jira in/)).toBeInTheDocument();
    const toggle = screen.getByRole('switch');
    expect(toggle).toHaveAttribute('data-disabled');
  });

  it('lets a connected org configure the automation and enable it', async () => {
    vi.mocked(jiraApi.status).mockResolvedValue({ connected: true });
    vi.mocked(jiraApi.projects).mockResolvedValue([{ id: '1', key: 'KAN', name: 'My Software Team' }]);
    vi.mocked(automationsApi.list).mockResolvedValue([makeAutomation()]);
    vi.mocked(automationsApi.update).mockResolvedValue(makeAutomation({ enabled: true }));
    renderPage();

    const toggle = await screen.findByRole('switch');
    await userEvent.click(toggle);

    await waitFor(() => {
      expect(automationsApi.update).toHaveBeenCalledWith('auto-1', { enabled: true });
    });
  });

  it('shows a success message and refreshes after "Run now"', async () => {
    vi.mocked(jiraApi.status).mockResolvedValue({ connected: true });
    vi.mocked(jiraApi.projects).mockResolvedValue([{ id: '1', key: 'KAN', name: 'My Software Team' }]);
    vi.mocked(jiraApi.issueTypes).mockResolvedValue([{ id: '10001', name: 'Task' }]);
    const configured = makeAutomation({ config: { project_key: 'KAN', issue_type_id: '10001' } });
    vi.mocked(automationsApi.list).mockResolvedValue([configured]);
    vi.mocked(automationsApi.run).mockResolvedValue({
      status: 'success',
      run: { id: 'run-1', status: 'success', summary: 'Created KAN-9', jira_ticket_url: 'https://x/KAN-9', started_at: new Date().toISOString() },
    });

    renderPage();

    const runButton = await screen.findByRole('button', { name: /run now/i });
    await waitFor(() => expect(runButton).toBeEnabled());
    await userEvent.click(runButton);

    expect(await screen.findByText('Created KAN-9')).toBeInTheDocument();
  });

  it('renders run history with a status badge and ticket link', async () => {
    vi.mocked(jiraApi.status).mockResolvedValue({ connected: true });
    vi.mocked(jiraApi.projects).mockResolvedValue([]);
    vi.mocked(automationsApi.list).mockResolvedValue([
      makeAutomation({
        runs: [
          {
            id: 'run-1',
            status: 'success',
            summary: 'Created KAN-9',
            jira_ticket_url: 'https://acme.atlassian.net/browse/KAN-9',
            started_at: new Date().toISOString(),
          },
        ],
      }),
    ]);
    renderPage();

    expect(await screen.findByText('success')).toBeInTheDocument();
    expect(screen.getByText('Created KAN-9')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /open/i })).toHaveAttribute(
      'href',
      'https://acme.atlassian.net/browse/KAN-9',
    );
  });
});
