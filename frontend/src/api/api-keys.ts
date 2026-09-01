import { api } from './client';
import type { ApiKey } from '../types';

export const apiKeysApi = {
  list: () => api.get<ApiKey[]>('/api/api-keys'),
  create: (label: string) => api.post<ApiKey & { key: string }>('/api/api-keys', { label }),
  revoke: (id: string) => api.delete<void>(`/api/api-keys/${id}`),
};
