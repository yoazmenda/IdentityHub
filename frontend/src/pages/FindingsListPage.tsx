import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ExternalLink, Plus, ShieldAlert, Ticket } from 'lucide-react';
import { AppLayout } from '../components/AppLayout';
import { Button } from '../components/Button';
import { SeverityBadge, StatusBadge } from '../components/Badge';
import { EmptyState } from '../components/EmptyState';
import { ErrorState } from '../components/ErrorState';
import { TableSkeleton } from '../components/Skeleton';
import { CreateJiraTicketModal } from '../components/CreateJiraTicketModal';
import { findingsApi } from '../api/findings';
import { jiraApi } from '../api/jira';
import type { Finding } from '../types';
import { ApiRequestError } from '../api/client';

export function FindingsListPage() {
  const navigate = useNavigate();
  const [findings, setFindings] = useState<Finding[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [jiraConnected, setJiraConnected] = useState(false);
  const [ticketModalFinding, setTicketModalFinding] = useState<Finding | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      setFindings(await findingsApi.list());
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.body.error : 'Failed to load findings.');
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
  }, []);

  function updateFindingTicket(id: string, ticket: Finding['jira_ticket']) {
    setFindings((prev) => prev?.map((f) => (f.id === id ? { ...f, jira_ticket: ticket } : f)) ?? prev);
  }

  return (
    <AppLayout title="Findings">
      <div className="mb-6 flex items-center justify-between">
        <p className="text-sm text-gray-500">NHI findings across your service accounts, keys, and identities.</p>
        <Button onClick={() => navigate('/findings/new')}>
          <Plus className="h-4 w-4" />
          Create Finding
        </Button>
      </div>

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-card">
        {loading ? (
          <TableSkeleton rows={6} cols={5} />
        ) : error ? (
          <div className="p-6">
            <ErrorState title="Couldn't load findings" description={error} onRetry={load} />
          </div>
        ) : findings && findings.length === 0 ? (
          <div className="p-6">
            <EmptyState
              icon={ShieldAlert}
              title="No findings yet"
              description="Findings represent NHI risks — stale service accounts, overprivileged keys, expiring credentials. Create your first one to get started."
              action={<Button onClick={() => navigate('/findings/new')}>Create Finding</Button>}
            />
          </div>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="border-b border-gray-200 bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-6 py-3 font-medium">Title</th>
                <th className="px-6 py-3 font-medium">Severity</th>
                <th className="px-6 py-3 font-medium">Status</th>
                <th className="px-6 py-3 font-medium">Jira Ticket</th>
                <th className="px-6 py-3 font-medium">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {findings!.map((f) => (
                <tr
                  key={f.id}
                  className="cursor-pointer hover:bg-gray-50"
                  onClick={() => navigate(`/findings/${f.id}`)}
                >
                  <td className="max-w-md px-6 py-4">
                    <span className="truncate font-medium text-gray-900">{f.title}</span>
                  </td>
                  <td className="px-6 py-4">
                    <SeverityBadge severity={f.severity} />
                  </td>
                  <td className="px-6 py-4">
                    <StatusBadge status={f.status} />
                  </td>
                  <td className="px-6 py-4">
                    {f.jira_ticket ? (
                      <a
                        href={f.jira_ticket.jira_url}
                        target="_blank"
                        rel="noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="inline-flex items-center gap-1.5 font-medium text-accent-600 hover:text-accent-700"
                      >
                        {f.jira_ticket.jira_issue_key}
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    ) : jiraConnected ? (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setTicketModalFinding(f);
                        }}
                        className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-accent-600 ring-1 ring-inset ring-accent-200 hover:bg-accent-50"
                      >
                        <Ticket className="h-3.5 w-3.5" />
                        Create ticket
                      </button>
                    ) : (
                      <span className="text-xs text-gray-400">Not connected</span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-gray-500">
                    {new Date(f.created_at).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {ticketModalFinding && (
        <CreateJiraTicketModal
          open={!!ticketModalFinding}
          onOpenChange={(open) => !open && setTicketModalFinding(null)}
          finding={ticketModalFinding}
          onCreated={(ticket) => updateFindingTicket(ticketModalFinding.id, ticket)}
        />
      )}
    </AppLayout>
  );
}
