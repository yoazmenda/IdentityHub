import { NotFoundException } from '@nestjs/common';
import { JiraConnectionsDao } from '../../src/dao/jira-connections.dao';

/**
 * Stands in for JiraService in e2e tests: mocks only the boundary that would otherwise make a
 * real HTTP call to Atlassian (OAuth exchange, project/issue-type/issue-create REST calls).
 * Everything else — reading/writing jira_connections — goes through the real DAO against the
 * real (test) database, so the connect/status/disconnect lifecycle is exercised for real.
 */
export class FakeJiraService {
  public readonly createIssue = jest.fn().mockResolvedValue({
    key: 'TST-1',
    url: 'https://acme-test.atlassian.net/browse/TST-1',
  });

  constructor(private readonly jiraConnectionsDao: JiraConnectionsDao) {}

  generateState(): string {
    return `fake-state-${Math.random().toString(36).slice(2)}`;
  }

  buildAuthorizeUrl(state: string): string {
    return `https://auth.atlassian.test/authorize?state=${state}&mock=1`;
  }

  async connect(params: { organizationId: string; userId: string; code: string }): Promise<void> {
    if (params.code === 'invalid-code') {
      throw new Error('simulated Atlassian token exchange failure');
    }
    await this.jiraConnectionsDao.upsert({
      organizationId: params.organizationId,
      siteUrl: 'https://acme-test.atlassian.net',
      cloudId: 'cloud-1',
      accessToken: 'fake-encrypted-access-token',
      refreshToken: 'fake-encrypted-refresh-token',
      tokenExpiresAt: new Date(Date.now() + 3600_000),
      connectedByUserId: params.userId,
    });
  }

  async getStatus(organizationId: string) {
    return this.jiraConnectionsDao.findForOrg(organizationId);
  }

  async disconnect(organizationId: string): Promise<void> {
    await this.jiraConnectionsDao.revoke(organizationId, 'scrubbed');
  }

  async listProjects(organizationId: string) {
    await this.assertConnected(organizationId);
    return [
      { id: '10000', key: 'TST', name: 'Test Project' },
      { id: '10001', key: 'SEC', name: 'Security' },
    ];
  }

  async listIssueTypes(organizationId: string, _projectKey: string) {
    await this.assertConnected(organizationId);
    return [
      { id: '10001', name: 'Task' },
      { id: '10002', name: 'Bug' },
    ];
  }

  private async assertConnected(organizationId: string): Promise<void> {
    const connection = await this.jiraConnectionsDao.findForOrg(organizationId);
    if (!connection || connection.status !== 'active') {
      throw new NotFoundException('Jira is not connected for this organization');
    }
  }
}
