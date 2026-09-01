export type Severity = 'critical' | 'high' | 'medium' | 'low';
export type FindingStatus = 'open' | 'resolved';

export interface User {
  id: string;
  name: string;
  email: string;
}

export interface JiraTicketSummary {
  id: string;
  jira_issue_key: string;
  jira_url: string;
  jira_project_key: string;
  title: string;
  created_at: string;
}

export interface Finding {
  id: string;
  title: string;
  description: string;
  severity: Severity;
  status: FindingStatus;
  jira_ticket?: JiraTicketSummary | null;
  created_at: string;
  updated_at: string;
}

export interface JiraProject {
  id: string;
  key: string;
  name: string;
}

export interface JiraIssueType {
  id: string;
  name: string;
}

export interface JiraStatus {
  connected: boolean;
  status?: 'active' | 'expired' | 'revoked';
  site_url?: string;
  connected_by_user_id?: string;
  created_at?: string;
}

export interface ApiKey {
  id: string;
  label: string;
  is_active: boolean;
  created_at: string;
}

export interface ApiError {
  error: string;
  details?: { field: string; message: string }[];
}

export type AutomationSchedule = 'manual' | 'hourly' | 'daily' | 'weekly';
export type AutomationRunStatus = 'success' | 'skipped' | 'failed';

export interface AutomationRun {
  id: string;
  status: AutomationRunStatus;
  summary: string;
  jira_ticket_url: string | null;
  started_at: string;
}

export interface Automation {
  id: string;
  type: 'blog_digest';
  enabled: boolean;
  schedule: AutomationSchedule;
  config: { project_key?: string; issue_type_id?: string };
  last_processed_url: string | null;
  runs: AutomationRun[];
}
