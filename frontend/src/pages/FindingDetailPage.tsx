import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ExternalLink, FileWarning, Trash2 } from 'lucide-react';
import { AppLayout } from '../components/AppLayout';
import { Button } from '../components/Button';
import { SeverityBadge, StatusBadge } from '../components/Badge';
import { ErrorState } from '../components/ErrorState';
import { Skeleton } from '../components/Skeleton';
import { CreateJiraTicketModal } from '../components/CreateJiraTicketModal';
import { JiraConnectHint } from '../components/JiraConnectHint';
import { findingsApi } from '../api/findings';
import { jiraApi } from '../api/jira';
import type { Finding } from '../types';
import { ApiRequestError } from '../api/client';

export function FindingDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [finding, setFinding] = useState<Finding | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [jiraConnected, setJiraConnected] = useState(false);

  async function load() {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      setFinding(await findingsApi.get(id));
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.body.error : 'Failed to load this finding.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    jiraApi
      .status()
      .then((s) => setJiraConnected(s.connected))
      .catch(() => setJiraConnected(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function handleDelete() {
    if (!id || !confirm('Delete this finding? This cannot be undone.')) return;
    await findingsApi.delete(id);
    navigate('/findings');
  }

  return (
    <AppLayout title="Finding Detail">
      {loading ? (
        <div className="space-y-4 rounded-xl border border-gray-200 bg-white p-6 shadow-card">
          <Skeleton className="h-6 w-2/3" />
          <Skeleton className="h-4 w-1/4" />
          <Skeleton className="h-24 w-full" />
        </div>
      ) : error || !finding ? (
        <ErrorState title="Couldn't load this finding" description={error ?? 'Unknown error'} onRetry={load} />
      ) : (
        <div className="mx-auto max-w-3xl space-y-6">
          <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-card">
            <div className="mb-4 flex items-start justify-between">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">{finding.title}</h2>
                <div className="mt-2 flex items-center gap-2">
                  <SeverityBadge severity={finding.severity} />
                  <StatusBadge status={finding.status} />
                </div>
              </div>
              <Button variant="ghost" onClick={handleDelete} aria-label="Delete finding">
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-gray-700">{finding.description}</p>
            <p className="mt-4 text-xs text-gray-400">
              Created {new Date(finding.created_at).toLocaleString()}
            </p>
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-card">
            <h3 className="mb-4 text-sm font-semibold text-gray-900">Jira Ticket</h3>
            {finding.jira_ticket ? (
              <div className="flex items-center justify-between rounded-lg border border-gray-200 bg-gray-50 px-4 py-3">
                <div>
                  <a
                    href={finding.jira_ticket.jira_url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 text-sm font-semibold text-accent-600 hover:text-accent-700"
                  >
                    {finding.jira_ticket.jira_issue_key} <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                  <p className="mt-0.5 text-xs text-gray-500">
                    {finding.jira_ticket.jira_project_key} · created{' '}
                    {new Date(finding.jira_ticket.created_at).toLocaleDateString()}
                  </p>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center rounded-lg border border-dashed border-gray-300 px-4 py-8 text-center">
                <FileWarning className="mb-2 h-6 w-6 text-gray-400" />
                <p className="mb-3 text-sm text-gray-500">No Jira ticket linked to this finding yet.</p>
                {jiraConnected ? (
                  <Button onClick={() => setModalOpen(true)}>Create Jira Ticket</Button>
                ) : (
                  <JiraConnectHint action="to create a ticket for this finding." />
                )}
              </div>
            )}
          </div>

          <CreateJiraTicketModal
            open={modalOpen}
            onOpenChange={setModalOpen}
            finding={finding}
            onCreated={(ticket) => setFinding({ ...finding, jira_ticket: ticket })}
          />
        </div>
      )}
    </AppLayout>
  );
}
