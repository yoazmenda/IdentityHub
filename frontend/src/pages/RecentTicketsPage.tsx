import { useEffect, useState } from 'react';
import { ExternalLink, Ticket } from 'lucide-react';
import { AppLayout } from '../components/AppLayout';
import { SelectField } from '../components/FormField';
import { EmptyState } from '../components/EmptyState';
import { ErrorState } from '../components/ErrorState';
import { TableSkeleton } from '../components/Skeleton';
import { jiraApi, jiraTicketsApi } from '../api/jira';
import type { JiraProject, JiraTicketSummary } from '../types';
import { ApiRequestError } from '../api/client';
import { Link } from 'react-router-dom';

export function RecentTicketsPage() {
  const [connected, setConnected] = useState<boolean | null>(null);
  const [projects, setProjects] = useState<JiraProject[] | null>(null);
  const [projectKey, setProjectKey] = useState('');
  const [tickets, setTickets] = useState<JiraTicketSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    jiraApi
      .status()
      .then((s) => {
        setConnected(s.connected);
        if (!s.connected) {
          setLoading(false);
          return;
        }
        return jiraApi.projects().then((ps) => {
          setProjects(ps);
          if (ps.length > 0) setProjectKey(ps[0].key);
          else setLoading(false);
        });
      })
      .catch(() => {
        setConnected(false);
        setLoading(false);
      });
  }, []);

  async function loadTickets(key: string) {
    setLoading(true);
    setError(null);
    try {
      const { tickets } = await jiraTicketsApi.recent({ projectKey: key, limit: 10 });
      setTickets(tickets);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.body.error : 'Failed to load recent tickets.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (projectKey) loadTickets(projectKey);
  }, [projectKey]);

  return (
    <AppLayout title="Recent Tickets">
      {connected === false ? (
        <EmptyState
          icon={Ticket}
          title="Jira not connected"
          description="Connect your Jira workspace in Settings to see tickets created from IdentityHub."
          action={
            <Link to="/settings" className="text-sm font-medium text-accent-600 hover:text-accent-700">
              Go to Settings →
            </Link>
          }
        />
      ) : (
        <>
          <div className="mb-6 flex items-center justify-between">
            <p className="text-sm text-gray-500">The 10 most recent Jira tickets created from IdentityHub.</p>
            {projects && projects.length > 0 && (
              <div className="w-64">
                <SelectField
                  id="project-filter"
                  label="Project"
                  value={projectKey}
                  onChange={(e) => setProjectKey(e.target.value)}
                >
                  {projects.map((p) => (
                    <option key={p.key} value={p.key}>
                      {p.name} ({p.key})
                    </option>
                  ))}
                </SelectField>
              </div>
            )}
          </div>

          <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-card">
            {loading ? (
              <TableSkeleton rows={5} cols={3} />
            ) : error ? (
              <div className="p-6">
                <ErrorState title="Couldn't load tickets" description={error} onRetry={() => loadTickets(projectKey)} />
              </div>
            ) : tickets && tickets.length === 0 ? (
              <div className="p-6">
                <EmptyState
                  icon={Ticket}
                  title="No tickets yet"
                  description="Tickets created from a finding in this project will show up here."
                />
              </div>
            ) : (
              <table className="w-full text-left text-sm">
                <thead className="border-b border-gray-200 bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
                  <tr>
                    <th className="px-6 py-3 font-medium">Ticket</th>
                    <th className="px-6 py-3 font-medium">Title</th>
                    <th className="px-6 py-3 font-medium">Created</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {tickets!.map((t) => (
                    <tr key={t.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4">
                        <a
                          href={t.jira_url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1.5 font-medium text-accent-600 hover:text-accent-700"
                        >
                          {t.jira_issue_key} <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                      </td>
                      <td className="px-6 py-4 text-gray-700">{t.title}</td>
                      <td className="px-6 py-4 text-gray-500">{new Date(t.created_at).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}
    </AppLayout>
  );
}
