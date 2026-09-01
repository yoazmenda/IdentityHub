import { ConflictException, NotFoundException } from '@nestjs/common';
import { JiraTicketsService } from './jira-tickets.service';
import { FindingsDao, FindingRow } from '../dao/findings.dao';
import { JiraTicketsDao, JiraTicketRow } from '../dao/jira-tickets.dao';
import { JiraConnectionsDao, JiraConnectionRow } from '../dao/jira-connections.dao';
import { JiraService } from './jira.service';

const ORG_ID = 'org-1';

function makeFinding(): FindingRow {
  return {
    id: 'finding-1',
    organization_id: ORG_ID,
    title: 'Stale Service Account',
    description: 'Unused for 90 days',
    severity: 'high',
    status: 'open',
    created_at: new Date(),
    updated_at: new Date(),
  };
}

function makeConnection(): JiraConnectionRow {
  return {
    id: 'conn-1',
    organization_id: ORG_ID,
    site_url: 'https://acme.atlassian.net',
    cloud_id: 'cloud-1',
    access_token: 'enc',
    refresh_token: 'enc',
    token_expires_at: new Date(Date.now() + 100000),
    status: 'active',
    connected_by_user_id: 'user-1',
    created_at: new Date(),
    updated_at: new Date(),
  };
}

describe('JiraTicketsService', () => {
  let findingsDao: jest.Mocked<FindingsDao>;
  let jiraTicketsDao: jest.Mocked<JiraTicketsDao>;
  let jiraConnectionsDao: jest.Mocked<JiraConnectionsDao>;
  let jiraService: jest.Mocked<JiraService>;
  let service: JiraTicketsService;

  beforeEach(() => {
    findingsDao = { findById: jest.fn() } as never;
    jiraTicketsDao = { findByFindingId: jest.fn(), create: jest.fn(), findRecentForOrg: jest.fn() } as never;
    jiraConnectionsDao = { findForOrg: jest.fn() } as never;
    jiraService = { createIssue: jest.fn() } as never;
    service = new JiraTicketsService(findingsDao, jiraTicketsDao, jiraConnectionsDao, jiraService);
  });

  describe('createForFinding', () => {
    it('throws 404 when the finding does not exist', async () => {
      findingsDao.findById.mockResolvedValue(null);
      await expect(
        service.createForFinding(ORG_ID, 'user-1', 'missing', { project_key: 'KAN', issue_type_id: '1' }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('throws 409 with the existing key when a ticket is already linked', async () => {
      findingsDao.findById.mockResolvedValue(makeFinding());
      jiraTicketsDao.findByFindingId.mockResolvedValue({ jira_issue_key: 'KAN-41' } as JiraTicketRow);

      await expect(
        service.createForFinding(ORG_ID, 'user-1', 'finding-1', { project_key: 'KAN', issue_type_id: '1' }),
      ).rejects.toThrow('This finding already has a linked Jira ticket (KAN-41)');
    });

    it('throws 404 when Jira is not connected for this org', async () => {
      findingsDao.findById.mockResolvedValue(makeFinding());
      jiraTicketsDao.findByFindingId.mockResolvedValue(null);
      jiraConnectionsDao.findForOrg.mockResolvedValue(null);

      await expect(
        service.createForFinding(ORG_ID, 'user-1', 'finding-1', { project_key: 'KAN', issue_type_id: '1' }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('creates the Jira issue and persists the local ticket row, attributing to the calling user', async () => {
      const finding = makeFinding();
      findingsDao.findById.mockResolvedValue(finding);
      jiraTicketsDao.findByFindingId.mockResolvedValue(null);
      jiraConnectionsDao.findForOrg.mockResolvedValue(makeConnection());
      jiraService.createIssue.mockResolvedValue({ key: 'KAN-42', url: 'https://acme.atlassian.net/browse/KAN-42' });
      jiraTicketsDao.create.mockResolvedValue({ id: 't1', jira_issue_key: 'KAN-42' } as JiraTicketRow);

      await service.createForFinding(ORG_ID, 'user-1', 'finding-1', { project_key: 'KAN', issue_type_id: '1' });

      expect(jiraService.createIssue).toHaveBeenCalledWith(
        ORG_ID,
        expect.objectContaining({ projectKey: 'KAN', issueTypeId: '1', summary: finding.title, description: finding.description }),
      );
      expect(jiraTicketsDao.create).toHaveBeenCalledWith(expect.objectContaining({ createdByUserId: 'user-1' }));
    });

    it('attributes the ticket to no user (null) when called via the external API', async () => {
      findingsDao.findById.mockResolvedValue(makeFinding());
      jiraTicketsDao.findByFindingId.mockResolvedValue(null);
      jiraConnectionsDao.findForOrg.mockResolvedValue(makeConnection());
      jiraService.createIssue.mockResolvedValue({ key: 'KAN-42', url: 'https://acme.atlassian.net/browse/KAN-42' });
      jiraTicketsDao.create.mockResolvedValue({ id: 't1', jira_issue_key: 'KAN-42' } as JiraTicketRow);

      await service.createForFinding(ORG_ID, undefined, 'finding-1', { project_key: 'KAN', issue_type_id: '1' });

      expect(jiraTicketsDao.create).toHaveBeenCalledWith(expect.objectContaining({ createdByUserId: null }));
    });
  });

  describe('listRecent', () => {
    it('caps the limit at 50 and defaults to 10', async () => {
      jiraTicketsDao.findRecentForOrg.mockResolvedValue([]);

      await service.listRecent(ORG_ID, {});
      expect(jiraTicketsDao.findRecentForOrg).toHaveBeenLastCalledWith(ORG_ID, { projectKey: undefined, limit: 10 });

      await service.listRecent(ORG_ID, { limit: 500 });
      expect(jiraTicketsDao.findRecentForOrg).toHaveBeenLastCalledWith(ORG_ID, { projectKey: undefined, limit: 50 });
    });
  });
});
