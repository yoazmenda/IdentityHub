import { useEffect, useState } from 'react';
import * as Switch from '@radix-ui/react-switch';
import { CheckCircle2, ExternalLink, History, Play, XCircle, Zap } from 'lucide-react';
import { AppLayout } from '../components/AppLayout';
import { Button } from '../components/Button';
import { Badge } from '../components/Badge';
import { SelectField } from '../components/FormField';
import { EmptyState } from '../components/EmptyState';
import { ErrorState } from '../components/ErrorState';
import { Skeleton } from '../components/Skeleton';
import { JiraConnectHint } from '../components/JiraConnectHint';
import { automationsApi } from '../api/automations';
import { jiraApi } from '../api/jira';
import type { Automation, AutomationRunStatus, JiraIssueType, JiraProject } from '../types';
import { ApiRequestError } from '../api/client';

const SCHEDULE_LABELS: Record<Automation['schedule'], string> = {
  manual: 'Manual only',
  hourly: 'Every hour',
  daily: 'Once a day',
  weekly: 'Once a week',
};

const RUN_STATUS_TONE: Record<AutomationRunStatus, 'success' | 'danger' | 'neutral'> = {
  success: 'success',
  failed: 'danger',
  skipped: 'neutral',
};

export function AutomationsPage() {
  const [automations, setAutomations] = useState<Automation[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [jiraConnected, setJiraConnected] = useState(false);
  const [projects, setProjects] = useState<JiraProject[] | null>(null);
  const [issueTypesByProject, setIssueTypesByProject] = useState<Record<string, JiraIssueType[]>>({});
  const [runningId, setRunningId] = useState<string | null>(null);
  const [runMessage, setRunMessage] = useState<{ id: string; tone: 'success' | 'error'; text: string } | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      setAutomations(await automationsApi.list());
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.body.error : 'Failed to load automations.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    jiraApi
      .status()
      .then((s) => {
        setJiraConnected(s.connected);
        if (s.connected) return jiraApi.projects().then(setProjects);
      })
      .catch(() => setJiraConnected(false));
  }, []);

  // Prefetch issue types for an already-configured project — onChange alone won't fire on load.
  useEffect(() => {
    automations?.forEach((a) => {
      if (a.config.project_key) ensureIssueTypes(a.config.project_key);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [automations]);

  async function ensureIssueTypes(projectKey: string) {
    if (!projectKey || issueTypesByProject[projectKey]) return;
    const types = await jiraApi.issueTypes(projectKey);
    setIssueTypesByProject((prev) => ({ ...prev, [projectKey]: types }));
  }

  async function patch(automation: Automation, input: Parameters<typeof automationsApi.update>[1]) {
    const updated = await automationsApi.update(automation.id, input);
    setAutomations((prev) => prev?.map((a) => (a.id === automation.id ? { ...updated, runs: a.runs } : a)) ?? prev);
  }

  async function handleRunNow(automation: Automation) {
    setRunningId(automation.id);
    setRunMessage(null);
    try {
      const result = await automationsApi.run(automation.id);
      setRunMessage({
        id: automation.id,
        tone: 'success',
        text: result.status === 'success' ? result.run.summary : 'Already up to date — nothing new to file.',
      });
      await load();
    } catch (err) {
      setRunMessage({
        id: automation.id,
        tone: 'error',
        text: err instanceof ApiRequestError ? err.body.error : 'Run failed. Please try again.',
      });
    } finally {
      setRunningId(null);
    }
  }

  return (
    <AppLayout title="Automations">
      <p className="mb-6 text-sm text-gray-500">
        Background jobs IdentityHub runs on your behalf — enable one, set a schedule, or trigger it manually.
      </p>

      {loading ? (
        <Skeleton className="h-64 w-full rounded-xl" />
      ) : error ? (
        <ErrorState title="Couldn't load automations" description={error} onRetry={load} />
      ) : (
        <div className="space-y-6">
          {automations!.map((automation) => {
            const projectKey = automation.config.project_key ?? '';
            const issueTypeId = automation.config.issue_type_id ?? '';
            const issueTypes = projectKey ? issueTypesByProject[projectKey] : undefined;
            const canRun = jiraConnected && !!projectKey && !!issueTypeId;
            const message = runMessage?.id === automation.id ? runMessage : null;

            return (
              <div key={automation.id} className="rounded-xl border border-gray-200 bg-white p-6 shadow-card">
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-accent-50">
                      <Zap className="h-4.5 w-4.5 text-accent-600" />
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold text-gray-900">NHI Blog Digest</h3>
                      <p className="mt-0.5 max-w-lg text-sm text-gray-500">
                        Fetches the latest Oasis Security blog post, summarizes it with AI, and files a Jira ticket.
                      </p>
                    </div>
                  </div>
                  <Switch.Root
                    checked={automation.enabled}
                    onCheckedChange={(enabled) => patch(automation, { enabled })}
                    disabled={!jiraConnected}
                    className="relative h-6 w-11 flex-shrink-0 rounded-full bg-gray-200 outline-none transition-colors data-[state=checked]:bg-accent-600 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <Switch.Thumb className="block h-5 w-5 translate-x-0.5 rounded-full bg-white shadow transition-transform data-[state=checked]:translate-x-[22px]" />
                  </Switch.Root>
                </div>

                {!jiraConnected ? (
                  <div className="mt-4">
                    <JiraConnectHint action="to configure and run this automation." />
                  </div>
                ) : (
                  <>
                    <div className="mt-4 grid grid-cols-3 gap-4">
                      <SelectField
                        id={`schedule-${automation.id}`}
                        label="Schedule"
                        value={automation.schedule}
                        onChange={(e) => patch(automation, { schedule: e.target.value as Automation['schedule'] })}
                      >
                        {Object.entries(SCHEDULE_LABELS).map(([value, label]) => (
                          <option key={value} value={value}>
                            {label}
                          </option>
                        ))}
                      </SelectField>
                      <SelectField
                        id={`project-${automation.id}`}
                        label="Project"
                        value={projectKey}
                        onChange={(e) => {
                          const key = e.target.value;
                          ensureIssueTypes(key);
                          patch(automation, { project_key: key, issue_type_id: '' });
                        }}
                      >
                        <option value="">{projects ? 'Select a project' : 'Loading…'}</option>
                        {projects?.map((p) => (
                          <option key={p.key} value={p.key}>
                            {p.name} ({p.key})
                          </option>
                        ))}
                      </SelectField>
                      <SelectField
                        id={`issue-type-${automation.id}`}
                        label="Issue Type"
                        value={issueTypeId}
                        onChange={(e) => patch(automation, { issue_type_id: e.target.value })}
                        disabled={!projectKey}
                      >
                        <option value="">{!projectKey ? 'Select a project first' : issueTypes ? 'Select a type' : 'Loading…'}</option>
                        {issueTypes?.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.name}
                          </option>
                        ))}
                      </SelectField>
                    </div>

                    <div className="mt-5 flex items-center gap-3">
                      <Button
                        variant="secondary"
                        onClick={() => handleRunNow(automation)}
                        loading={runningId === automation.id}
                        disabled={!canRun}
                      >
                        <Play className="h-4 w-4" />
                        Run now
                      </Button>
                      {message && (
                        <span
                          className={`inline-flex items-center gap-1.5 text-sm ${
                            message.tone === 'success' ? 'text-emerald-700' : 'text-red-600'
                          }`}
                        >
                          {message.tone === 'success' ? (
                            <CheckCircle2 className="h-4 w-4 flex-shrink-0" />
                          ) : (
                            <XCircle className="h-4 w-4 flex-shrink-0" />
                          )}
                          {message.text}
                        </span>
                      )}
                    </div>
                  </>
                )}

                <div className="mt-6 border-t border-gray-100 pt-5">
                  <h4 className="mb-3 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500">
                    <History className="h-3.5 w-3.5" />
                    Recent Runs
                  </h4>
                  {automation.runs.length === 0 ? (
                    <p className="text-sm text-gray-400">No runs yet — run it now, or wait for the next scheduled run.</p>
                  ) : (
                    <ul className="divide-y divide-gray-100">
                      {automation.runs.map((run) => (
                        <li key={run.id} className="flex items-center justify-between py-2.5 text-sm">
                          <div className="flex items-center gap-3">
                            <Badge tone={RUN_STATUS_TONE[run.status]}>{run.status}</Badge>
                            <span className="text-gray-700">{run.summary}</span>
                            {run.jira_ticket_url && (
                              <a
                                href={run.jira_ticket_url}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-1 font-medium text-accent-600 hover:text-accent-700"
                              >
                                Open <ExternalLink className="h-3 w-3" />
                              </a>
                            )}
                          </div>
                          <span className="flex-shrink-0 text-gray-400">{new Date(run.started_at).toLocaleString()}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            );
          })}

          {automations!.length === 0 && (
            <EmptyState icon={Zap} title="No automations yet" description="Automations will appear here as they become available." />
          )}
        </div>
      )}
    </AppLayout>
  );
}
