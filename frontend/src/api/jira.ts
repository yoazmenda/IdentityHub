import { api } from './client';
import type { JiraIssueType, JiraProject, JiraStatus, JiraTicketSummary } from '../types';

export const jiraApi = {
  status: () => api.get<JiraStatus>('/api/jira/status'),
  /** Fetches the Atlassian authorize URL (needs our Bearer token) then hands the browser off to it. */
  connect: async () => {
    const { url } = await api.get<{ url: string }>('/api/jira/connect');
    window.location.href = url;
  },
  disconnect: () => api.delete<void>('/api/jira/connection'),
  projects: () => api.get<JiraProject[]>('/api/jira/projects'),
  issueTypes: (projectKey: string) =>
    api.get<JiraIssueType[]>(`/api/jira/projects/${encodeURIComponent(projectKey)}/issue-types`),
};

export const jiraTicketsApi = {
  createForFinding: (findingId: string, input: { project_key: string; issue_type_id: string; summary?: string; description?: string }) =>
    api.post<JiraTicketSummary>(`/api/findings/${findingId}/jira-ticket`, input),
  recent: (params: { projectKey?: string; limit?: number }) => {
    const qs = new URLSearchParams();
    if (params.projectKey) qs.set('project_key', params.projectKey);
    if (params.limit) qs.set('limit', String(params.limit));
    return api.get<{ tickets: JiraTicketSummary[] }>(`/api/jira-tickets?${qs.toString()}`);
  },
};
