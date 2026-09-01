import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import * as Switch from '@radix-ui/react-switch';
import { AlertCircle } from 'lucide-react';
import { AppLayout } from '../components/AppLayout';
import { Button } from '../components/Button';
import { TextField, TextAreaField, SelectField } from '../components/FormField';
import { findingsApi } from '../api/findings';
import { jiraApi } from '../api/jira';
import type { JiraIssueType, JiraProject, Severity } from '../types';
import { ApiRequestError } from '../api/client';

const SEVERITIES: Severity[] = ['critical', 'high', 'medium', 'low'];

export function CreateFindingPage() {
  const navigate = useNavigate();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [severity, setSeverity] = useState<Severity>('medium');

  const [alsoCreateTicket, setAlsoCreateTicket] = useState(false);
  const [jiraConnected, setJiraConnected] = useState<boolean | null>(null);
  const [projects, setProjects] = useState<JiraProject[] | null>(null);
  const [issueTypes, setIssueTypes] = useState<JiraIssueType[] | null>(null);
  const [projectKey, setProjectKey] = useState('');
  const [issueTypeId, setIssueTypeId] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    jiraApi
      .status()
      .then((s) => setJiraConnected(s.connected))
      .catch(() => setJiraConnected(false));
  }, []);

  useEffect(() => {
    if (!alsoCreateTicket || !jiraConnected || projects) return;
    jiraApi.projects().then(setProjects).catch(() => setProjects([]));
  }, [alsoCreateTicket, jiraConnected, projects]);

  useEffect(() => {
    if (!projectKey) {
      setIssueTypes(null);
      setIssueTypeId('');
      return;
    }
    jiraApi.issueTypes(projectKey).then((types) => {
      setIssueTypes(types);
      setIssueTypeId(types[0]?.id ?? '');
    });
  }, [projectKey]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setFieldErrors({});
    setSubmitting(true);
    try {
      const finding = await findingsApi.create({
        title,
        description,
        severity,
        jira: alsoCreateTicket && projectKey && issueTypeId ? { project_key: projectKey, issue_type_id: issueTypeId } : undefined,
      });
      navigate(`/findings/${finding.id}`);
    } catch (err) {
      if (err instanceof ApiRequestError) {
        setError(err.body.error);
        if (err.body.details) {
          setFieldErrors(Object.fromEntries(err.body.details.map((d) => [d.field, d.message])));
        }
      } else {
        setError('Something went wrong. Please try again.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AppLayout title="Create Finding">
      <div className="mx-auto max-w-2xl">
        <form onSubmit={handleSubmit} className="space-y-6 rounded-xl border border-gray-200 bg-white p-6 shadow-card">
          <TextField
            id="title"
            label="Title"
            placeholder="Stale Service Account: svc-deploy-prod"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            error={fieldErrors.title}
            required
          />
          <TextAreaField
            id="description"
            label="Description"
            rows={5}
            placeholder="Details about the finding — what identity, what risk, what evidence."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            error={fieldErrors.description}
            required
          />
          <SelectField
            id="severity"
            label="Severity"
            value={severity}
            onChange={(e) => setSeverity(e.target.value as Severity)}
            error={fieldErrors.severity}
          >
            {SEVERITIES.map((s) => (
              <option key={s} value={s}>
                {s[0].toUpperCase() + s.slice(1)}
              </option>
            ))}
          </SelectField>

          <div className="rounded-lg border border-gray-200 p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-900">Also create a Jira ticket</p>
                <p className="text-sm text-gray-500">File this finding to Jira in the same step.</p>
              </div>
              <Switch.Root
                checked={alsoCreateTicket}
                onCheckedChange={setAlsoCreateTicket}
                disabled={jiraConnected === false}
                className="relative h-6 w-11 flex-shrink-0 rounded-full bg-gray-200 outline-none transition-colors data-[state=checked]:bg-accent-600 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Switch.Thumb className="block h-5 w-5 translate-x-0.5 rounded-full bg-white shadow transition-transform data-[state=checked]:translate-x-[22px]" />
              </Switch.Root>
            </div>

            {jiraConnected === false && (
              <p className="mt-3 flex items-center gap-1.5 text-sm text-amber-700">
                <AlertCircle className="h-4 w-4 flex-shrink-0" />
                Connect Jira in Settings to create tickets from findings.
              </p>
            )}

            {alsoCreateTicket && jiraConnected && (
              <div className="mt-4 grid grid-cols-2 gap-4">
                <SelectField
                  id="project"
                  label="Project"
                  value={projectKey}
                  onChange={(e) => setProjectKey(e.target.value)}
                >
                  <option value="">{projects ? 'Select a project' : 'Loading…'}</option>
                  {projects?.map((p) => (
                    <option key={p.key} value={p.key}>
                      {p.name} ({p.key})
                    </option>
                  ))}
                </SelectField>
                <SelectField
                  id="issueType"
                  label="Issue Type"
                  value={issueTypeId}
                  onChange={(e) => setIssueTypeId(e.target.value)}
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
            )}
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex justify-end gap-3">
            <Button type="button" variant="secondary" onClick={() => navigate('/findings')}>
              Cancel
            </Button>
            <Button type="submit" loading={submitting}>
              Create Finding
            </Button>
          </div>
        </form>
      </div>
    </AppLayout>
  );
}
