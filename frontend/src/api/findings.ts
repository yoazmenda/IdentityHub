import { api } from './client';
import type { Finding, Severity } from '../types';

export interface CreateFindingInput {
  title: string;
  description: string;
  severity: Severity;
  jira?: { project_key: string; issue_type_id: string };
}

export const findingsApi = {
  list: () => api.get<Finding[]>('/api/findings'),
  get: (id: string) => api.get<Finding>(`/api/findings/${id}`),
  create: (input: CreateFindingInput) => api.post<Finding>('/api/findings', input),
  delete: (id: string) => api.delete<void>(`/api/findings/${id}`),
};
