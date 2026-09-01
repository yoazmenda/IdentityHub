import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { SettingsPage } from './SettingsPage';
import { jiraApi } from '../api/jira';
import { apiKeysApi } from '../api/api-keys';
import { ApiRequestError } from '../api/client';
import { AuthProvider } from '../hooks/useAuth';

vi.mock('../api/jira');
vi.mock('../api/api-keys');

function renderPage(initialEntry = '/settings') {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <AuthProvider>
        <SettingsPage />
      </AuthProvider>
    </MemoryRouter>,
  );
}

describe('SettingsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    vi.mocked(apiKeysApi.list).mockResolvedValue([]);
  });

  it('shows "Not connected" with a Connect button when Jira is disconnected', async () => {
    vi.mocked(jiraApi.status).mockResolvedValue({ connected: false });
    renderPage();

    expect(await screen.findByText('Not connected')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /connect to jira/i })).toBeInTheDocument();
  });

  it('shows the connected state with the site URL and a Disconnect button', async () => {
    vi.mocked(jiraApi.status).mockResolvedValue({
      connected: true,
      status: 'active',
      site_url: 'https://acme.atlassian.net',
      created_at: new Date().toISOString(),
    });
    renderPage();

    expect(await screen.findByText('Connected')).toBeInTheDocument();
    expect(screen.getByText('https://acme.atlassian.net')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /disconnect/i })).toBeInTheDocument();
  });

  it('shows a success banner after an OAuth redirect with jira_connected=1', async () => {
    vi.mocked(jiraApi.status).mockResolvedValue({ connected: true, status: 'active', site_url: 'https://x' });
    renderPage('/settings?jira_connected=1');

    expect(await screen.findByText('Jira connected successfully.')).toBeInTheDocument();
  });

  it('shows an error banner after an OAuth redirect with jira_error', async () => {
    vi.mocked(jiraApi.status).mockResolvedValue({ connected: false });
    renderPage('/settings?jira_error=connect_failed');

    expect(await screen.findByText('Failed to connect Jira. Please try again.')).toBeInTheDocument();
  });

  it('shows the server error message when clicking Connect to Jira fails, instead of failing silently', async () => {
    vi.mocked(jiraApi.status).mockResolvedValue({ connected: false });
    vi.mocked(jiraApi.connect).mockRejectedValue(
      new ApiRequestError(503, { error: 'Jira integration is not configured for this environment.' }),
    );
    renderPage();

    await userEvent.click(await screen.findByRole('button', { name: /connect to jira/i }));

    expect(await screen.findByText('Jira integration is not configured for this environment.')).toBeInTheDocument();
  });

  it('shows an empty hint when there are no API keys yet', async () => {
    vi.mocked(jiraApi.status).mockResolvedValue({ connected: false });
    renderPage();

    expect(await screen.findByText('No API keys yet. Generate one to use the external API.')).toBeInTheDocument();
  });

  it('generates a key and reveals it exactly once', async () => {
    vi.mocked(jiraApi.status).mockResolvedValue({ connected: false });
    vi.mocked(apiKeysApi.create).mockResolvedValue({
      id: 'k1',
      label: 'CI pipeline',
      is_active: true,
      created_at: new Date().toISOString(),
      key: 'ihk_secretvalue',
    });
    renderPage();

    await userEvent.click(await screen.findByRole('button', { name: /generate new key/i }));
    await userEvent.type(screen.getByLabelText('Label'), 'CI pipeline');
    await userEvent.click(screen.getByRole('button', { name: 'Generate' }));

    expect(await screen.findByText('ihk_secretvalue')).toBeInTheDocument();
    expect(screen.getByText(/won't be shown again/)).toBeInTheDocument();
  });

  it('lists existing keys and revokes one after confirmation', async () => {
    vi.mocked(jiraApi.status).mockResolvedValue({ connected: false });
    vi.mocked(apiKeysApi.list).mockResolvedValue([
      { id: 'k1', label: 'CI pipeline', is_active: true, created_at: new Date().toISOString() },
    ]);
    vi.stubGlobal('confirm', vi.fn(() => true));
    renderPage();

    expect(await screen.findByText('CI pipeline')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Revoke CI pipeline' }));

    await waitFor(() => {
      expect(apiKeysApi.revoke).toHaveBeenCalledWith('k1');
    });
  });
});
