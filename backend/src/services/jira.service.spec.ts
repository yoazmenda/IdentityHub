import axios from 'axios';
import { ConflictException, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { JiraService } from './jira.service';
import { JiraConnectionsDao, JiraConnectionRow } from '../dao/jira-connections.dao';

jest.mock('axios');
// Real encrypt/decrypt needs a 32-byte ENCRYPTION_KEY; irrelevant to what this suite tests, so pass tokens through as-is.
jest.mock('../common/crypto.util', () => ({ encrypt: (s: string) => s, decrypt: (s: string) => s }));
jest.mock('../config/env', () => ({
  env: {
    jiraClientId: 'client-id',
    jiraClientSecret: 'client-secret',
    jiraRedirectUri: 'https://app.test/callback',
    jiraConfigured: true,
  },
}));
import { env } from '../config/env';
const mockedAxios = axios as jest.Mocked<typeof axios>;

const ORG_ID = 'org-1';

function makeConnection(overrides: Partial<JiraConnectionRow> = {}): JiraConnectionRow {
  return {
    id: 'conn-1',
    organization_id: ORG_ID,
    site_url: 'https://acme.atlassian.net',
    cloud_id: 'cloud-1',
    access_token: 'enc:token',
    refresh_token: 'enc:refresh',
    token_expires_at: new Date(Date.now() + 60 * 60 * 1000),
    status: 'active',
    connected_by_user_id: 'user-1',
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides,
  };
}

function axiosError(status: number) {
  const err = Object.assign(new Error('request failed'), { isAxiosError: true, response: { status } });
  return err;
}

describe('JiraService', () => {
  let jiraConnectionsDao: jest.Mocked<JiraConnectionsDao>;
  let service: JiraService;

  beforeEach(() => {
    jiraConnectionsDao = {
      findForOrg: jest.fn(),
      markExpired: jest.fn(),
      updateTokens: jest.fn(),
    } as never;
    service = new JiraService(jiraConnectionsDao);
    mockedAxios.isAxiosError.mockImplementation((err: unknown) => (err as { isAxiosError?: boolean })?.isAxiosError === true);
  });

  describe('buildAuthorizeUrl', () => {
    afterEach(() => {
      (env as { jiraConfigured: boolean }).jiraConfigured = true;
    });

    it('returns the Atlassian authorize URL when Jira OAuth is configured', () => {
      const url = service.buildAuthorizeUrl('some-state');
      expect(url).toContain('https://auth.atlassian.com/authorize');
      expect(url).toContain('client_id=client-id');
      expect(url).toContain('state=some-state');
    });

    it('throws 503 instead of an unhandled crash when JIRA_CLIENT_ID/SECRET are unset', () => {
      (env as { jiraConfigured: boolean }).jiraConfigured = false;
      expect(() => service.buildAuthorizeUrl('some-state')).toThrow(ServiceUnavailableException);
    });
  });

  describe('listProjects', () => {
    it('throws 404 when Jira is not connected', async () => {
      jiraConnectionsDao.findForOrg.mockResolvedValue(null);
      await expect(service.listProjects(ORG_ID)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('throws 404 when the connection was revoked', async () => {
      jiraConnectionsDao.findForOrg.mockResolvedValue(makeConnection({ status: 'revoked' }));
      await expect(service.listProjects(ORG_ID)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('throws 409 when the connection is already marked expired', async () => {
      jiraConnectionsDao.findForOrg.mockResolvedValue(makeConnection({ status: 'expired' }));
      await expect(service.listProjects(ORG_ID)).rejects.toThrow('Jira connection has expired');
    });

    it('marks the connection expired and throws 409 when Jira rejects the token (401/403)', async () => {
      jiraConnectionsDao.findForOrg.mockResolvedValue(makeConnection());
      mockedAxios.get.mockRejectedValue(axiosError(401));

      await expect(service.listProjects(ORG_ID)).rejects.toBeInstanceOf(ConflictException);
      expect(jiraConnectionsDao.markExpired).toHaveBeenCalledWith(ORG_ID);
    });

    it('throws 503 without touching connection status when Jira is unreachable', async () => {
      jiraConnectionsDao.findForOrg.mockResolvedValue(makeConnection());
      mockedAxios.get.mockRejectedValue(axiosError(500));

      await expect(service.listProjects(ORG_ID)).rejects.toBeInstanceOf(ServiceUnavailableException);
      expect(jiraConnectionsDao.markExpired).not.toHaveBeenCalled();
    });

    it('returns projects mapped from the Jira response on success', async () => {
      jiraConnectionsDao.findForOrg.mockResolvedValue(makeConnection());
      mockedAxios.get.mockResolvedValue({ data: { values: [{ id: '1', key: 'KAN', name: 'Kanban' }] } });

      await expect(service.listProjects(ORG_ID)).resolves.toEqual([{ id: '1', key: 'KAN', name: 'Kanban' }]);
    });
  });

  describe('token refresh', () => {
    it('proactively refreshes a near-expiry token before calling Jira', async () => {
      jiraConnectionsDao.findForOrg.mockResolvedValue(
        makeConnection({ token_expires_at: new Date(Date.now() + 1000) }),
      );
      mockedAxios.post.mockResolvedValue({ data: { access_token: 'new', refresh_token: 'new-r', expires_in: 3600 } });
      mockedAxios.get.mockResolvedValue({ data: { values: [] } });

      await service.listProjects(ORG_ID);

      expect(jiraConnectionsDao.updateTokens).toHaveBeenCalledWith(ORG_ID, expect.objectContaining({ tokenExpiresAt: expect.any(Date) }));
    });

    it('marks the connection expired when the refresh call itself fails', async () => {
      jiraConnectionsDao.findForOrg.mockResolvedValue(
        makeConnection({ token_expires_at: new Date(Date.now() + 1000) }),
      );
      mockedAxios.post.mockRejectedValue(new Error('refresh failed'));

      await expect(service.listProjects(ORG_ID)).rejects.toBeInstanceOf(ConflictException);
      expect(jiraConnectionsDao.markExpired).toHaveBeenCalledWith(ORG_ID);
    });
  });
});
