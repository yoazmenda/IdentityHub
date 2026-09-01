import { api } from './client';
import type { Automation, AutomationSchedule } from '../types';

export interface UpdateAutomationInput {
  enabled?: boolean;
  schedule?: AutomationSchedule;
  project_key?: string;
  issue_type_id?: string;
}

export interface RunAutomationResult {
  status: 'success' | 'skipped';
  run: Automation['runs'][number];
}

export const automationsApi = {
  list: () => api.get<Automation[]>('/api/automations'),
  update: (id: string, input: UpdateAutomationInput) => api.put<Automation>(`/api/automations/${id}`, input),
  run: (id: string) => api.post<RunAutomationResult>(`/api/automations/${id}/run`),
};
