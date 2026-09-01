import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CreateJiraTicketModal } from './CreateJiraTicketModal';
import { jiraApi, jiraTicketsApi } from '../api/jira';
import { ApiRequestError } from '../api/client';
import type { Finding } from '../types';

vi.mock('../api/jira');

const finding: Finding = {
  id: 'f1',
  title: 'Stale Service Account',
  description: 'Unused for 90 days',
  severity: 'high',
  status: 'open',
  jira_ticket: null,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

describe('CreateJiraTicketModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(jiraApi.projects).mockResolvedValue([{ id: '1', key: 'KAN', name: 'My Software Team' }]);
    vi.mocked(jiraApi.issueTypes).mockResolvedValue([{ id: '10001', name: 'Task' }]);
  });

  it('prefills Summary and Description from the finding when opened', async () => {
    render(<CreateJiraTicketModal open onOpenChange={vi.fn()} finding={finding} onCreated={vi.fn()} />);

    expect(await screen.findByLabelText('Summary')).toHaveValue(finding.title);
    expect(screen.getByLabelText('Description')).toHaveValue(finding.description);
  });

  it('disables Create Ticket until a project and issue type are chosen', async () => {
    render(<CreateJiraTicketModal open onOpenChange={vi.fn()} finding={finding} onCreated={vi.fn()} />);

    expect(await screen.findByRole('button', { name: 'Create Ticket' })).toBeDisabled();

    await userEvent.selectOptions(screen.getByLabelText('Project'), 'KAN');
    await waitFor(() => expect(screen.getByLabelText('Issue Type')).not.toBeDisabled());
    await userEvent.selectOptions(screen.getByLabelText('Issue Type'), '10001');

    expect(screen.getByRole('button', { name: 'Create Ticket' })).toBeEnabled();
  });

  it('shows a success state with an "Open in Jira" link, and calls onCreated', async () => {
    const onCreated = vi.fn();
    vi.mocked(jiraTicketsApi.createForFinding).mockResolvedValue({
      id: 't1',
      jira_issue_key: 'KAN-4',
      jira_url: 'https://acme.atlassian.net/browse/KAN-4',
      jira_project_key: 'KAN',
      title: finding.title,
      created_at: new Date().toISOString(),
    });
    render(<CreateJiraTicketModal open onOpenChange={vi.fn()} finding={finding} onCreated={onCreated} />);

    await userEvent.selectOptions(await screen.findByLabelText('Project'), 'KAN');
    await waitFor(() => expect(screen.getByLabelText('Issue Type')).not.toBeDisabled());
    await userEvent.selectOptions(screen.getByLabelText('Issue Type'), '10001');
    await userEvent.click(screen.getByRole('button', { name: 'Create Ticket' }));

    expect(await screen.findByText('KAN-4 created successfully')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /open in jira/i })).toHaveAttribute(
      'href',
      'https://acme.atlassian.net/browse/KAN-4',
    );
    expect(onCreated).toHaveBeenCalledWith(expect.objectContaining({ jira_issue_key: 'KAN-4' }));
  });

  it('surfaces the real error instead of a silently empty project list when the connection is broken', async () => {
    vi.mocked(jiraApi.projects).mockRejectedValue(
      new ApiRequestError(409, { error: 'Jira connection has expired. Please reconnect in Settings.' }),
    );
    render(<CreateJiraTicketModal open onOpenChange={vi.fn()} finding={finding} onCreated={vi.fn()} />);

    expect(await screen.findByText('Jira connection has expired. Please reconnect in Settings.')).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Unavailable' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create Ticket' })).toBeDisabled();
  });

  it('surfaces an error when issue types fail to load for the selected project', async () => {
    vi.mocked(jiraApi.issueTypes).mockRejectedValue(new ApiRequestError(503, { error: "Couldn't reach Jira. Please try again in a moment." }));
    render(<CreateJiraTicketModal open onOpenChange={vi.fn()} finding={finding} onCreated={vi.fn()} />);

    await userEvent.selectOptions(await screen.findByLabelText('Project'), 'KAN');

    expect(await screen.findByText("Couldn't reach Jira. Please try again in a moment.")).toBeInTheDocument();
  });

  it('shows the server error message on failure, without crashing', async () => {
    vi.mocked(jiraTicketsApi.createForFinding).mockRejectedValue(
      new ApiRequestError(409, { error: 'This finding already has a linked Jira ticket (KAN-1)' }),
    );
    render(<CreateJiraTicketModal open onOpenChange={vi.fn()} finding={finding} onCreated={vi.fn()} />);

    await userEvent.selectOptions(await screen.findByLabelText('Project'), 'KAN');
    await waitFor(() => expect(screen.getByLabelText('Issue Type')).not.toBeDisabled());
    await userEvent.selectOptions(screen.getByLabelText('Issue Type'), '10001');
    await userEvent.click(screen.getByRole('button', { name: 'Create Ticket' }));

    expect(await screen.findByText('This finding already has a linked Jira ticket (KAN-1)')).toBeInTheDocument();
  });
});
