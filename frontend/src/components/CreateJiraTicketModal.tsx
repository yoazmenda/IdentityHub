import { useEffect, useState } from 'react';
import { CheckCircle2, ExternalLink } from 'lucide-react';
import { Modal } from './Modal';
import { Button } from './Button';
import { SelectField, TextField, TextAreaField } from './FormField';
import { jiraApi, jiraTicketsApi } from '../api/jira';
import type { Finding, JiraIssueType, JiraProject, JiraTicketSummary } from '../types';
import { ApiRequestError } from '../api/client';

interface CreateJiraTicketModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  finding: Finding;
  onCreated: (ticket: JiraTicketSummary) => void;
}

export function CreateJiraTicketModal({ open, onOpenChange, finding, onCreated }: CreateJiraTicketModalProps) {
  const [projects, setProjects] = useState<JiraProject[] | null>(null);
  const [issueTypes, setIssueTypes] = useState<JiraIssueType[] | null>(null);
  const [projectKey, setProjectKey] = useState('');
  const [issueTypeId, setIssueTypeId] = useState('');
  const [summary, setSummary] = useState(finding.title);
  const [description, setDescription] = useState(finding.description);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<JiraTicketSummary | null>(null);

  useEffect(() => {
    if (!open) return;
    setCreated(null);
    setError(null);
    setProjects(null);
    setSummary(finding.title);
    setDescription(finding.description);
    jiraApi
      .projects()
      .then(setProjects)
      .catch((err) => {
        setProjects([]);
        setError(err instanceof ApiRequestError ? err.body.error : 'Failed to load Jira projects.');
      });
  }, [open, finding]);

  useEffect(() => {
    if (!projectKey) {
      setIssueTypes(null);
      setIssueTypeId('');
      return;
    }
    jiraApi
      .issueTypes(projectKey)
      .then((types) => {
        setIssueTypes(types);
        setIssueTypeId(types[0]?.id ?? '');
      })
      .catch((err) => {
        setIssueTypes([]);
        setError(err instanceof ApiRequestError ? err.body.error : 'Failed to load issue types.');
      });
  }, [projectKey]);

  async function handleSubmit() {
    setError(null);
    setSubmitting(true);
    try {
      const ticket = await jiraTicketsApi.createForFinding(finding.id, {
        project_key: projectKey,
        issue_type_id: issueTypeId,
        summary,
        description,
      });
      setCreated(ticket);
      onCreated(ticket);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.body.error : 'Failed to create the Jira ticket.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal open={open} onOpenChange={onOpenChange} title="Create Jira Ticket" description="File this finding as a ticket in your connected Jira workspace.">
      {created ? (
        <div className="flex flex-col items-center py-4 text-center">
          <CheckCircle2 className="mb-3 h-10 w-10 text-emerald-500" />
          <p className="text-sm font-medium text-gray-900">{created.jira_issue_key} created successfully</p>
          <a
            href={created.jira_url}
            target="_blank"
            rel="noreferrer"
            className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-accent-600 hover:text-accent-700"
          >
            Open in Jira <ExternalLink className="h-3.5 w-3.5" />
          </a>
          <Button variant="secondary" className="mt-6" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <SelectField id="modal-project" label="Project" value={projectKey} onChange={(e) => setProjectKey(e.target.value)}>
              <option value="">{!projects ? 'Loading…' : error ? 'Unavailable' : 'Select a project'}</option>
              {projects?.map((p) => (
                <option key={p.key} value={p.key}>
                  {p.name} ({p.key})
                </option>
              ))}
            </SelectField>
            <SelectField
              id="modal-issue-type"
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
          <TextField id="modal-summary" label="Summary" value={summary} onChange={(e) => setSummary(e.target.value)} />
          <TextAreaField
            id="modal-description"
            label="Description"
            rows={4}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="secondary" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button onClick={handleSubmit} loading={submitting} disabled={!projectKey || !issueTypeId}>
              Create Ticket
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
