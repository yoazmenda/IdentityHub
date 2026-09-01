import { BadRequestException, NotFoundException } from '@nestjs/common';
import { AutomationsService, isDue } from './automations.service';
import { AutomationsDao, AutomationRow } from '../dao/automations.dao';
import { AutomationRunsDao, AutomationRunRow } from '../dao/automation-runs.dao';
import { JiraConnectionsDao, JiraConnectionRow } from '../dao/jira-connections.dao';
import { JiraService } from './jira.service';
import * as blogDigestJob from '../jobs/blog-digest.job';

jest.mock('../jobs/blog-digest.job');

const ORG_ID = 'org-1';

function makeAutomation(overrides: Partial<AutomationRow> = {}): AutomationRow {
  return {
    id: 'auto-1',
    organization_id: ORG_ID,
    type: 'blog_digest',
    enabled: true,
    schedule: 'daily',
    config: { project_key: 'KAN', issue_type_id: '10001' },
    last_processed_url: null,
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides,
  };
}

function makeConnection(overrides: Partial<JiraConnectionRow> = {}): JiraConnectionRow {
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
    ...overrides,
  };
}

describe('isDue', () => {
  const now = new Date('2026-01-08T12:00:00Z');

  it('manual schedules are never due automatically', () => {
    expect(isDue('manual', null, now)).toBe(false);
    expect(isDue('manual', new Date('2000-01-01'), now)).toBe(false);
  });

  it('is due immediately if it has never run', () => {
    expect(isDue('daily', null, now)).toBe(true);
  });

  it.each([
    ['hourly', new Date('2026-01-08T10:59:00Z'), true], // > 1h ago
    ['hourly', new Date('2026-01-08T11:30:00Z'), false], // < 1h ago
    ['daily', new Date('2026-01-07T11:00:00Z'), true], // > 24h ago
    ['daily', new Date('2026-01-08T00:00:00Z'), false], // < 24h ago
    ['weekly', new Date('2026-01-01T00:00:00Z'), true], // > 7d ago
    ['weekly', new Date('2026-01-05T00:00:00Z'), false], // < 7d ago
  ] as const)('%s schedule, last run %s -> due=%s', (schedule, lastRunAt, expected) => {
    expect(isDue(schedule, lastRunAt, now)).toBe(expected);
  });
});

describe('AutomationsService', () => {
  let automationsDao: jest.Mocked<AutomationsDao>;
  let automationRunsDao: jest.Mocked<AutomationRunsDao>;
  let jiraConnectionsDao: jest.Mocked<JiraConnectionsDao>;
  let jiraService: jest.Mocked<JiraService>;
  let service: AutomationsService;

  beforeEach(() => {
    automationsDao = {
      findAllForOrg: jest.fn(),
      findById: jest.fn(),
      getOrCreate: jest.fn(),
      update: jest.fn(),
      setLastProcessedUrl: jest.fn(),
      findAllEnabledByType: jest.fn(),
    } as never;
    automationRunsDao = {
      create: jest.fn(),
      findRecentForAutomation: jest.fn(),
      findMostRecentForAutomation: jest.fn(),
    } as never;
    jiraConnectionsDao = { findForOrg: jest.fn() } as never;
    jiraService = { createIssue: jest.fn() } as never;
    service = new AutomationsService(automationsDao, automationRunsDao, jiraConnectionsDao, jiraService);
    jest.clearAllMocks();
  });

  describe('list', () => {
    it('auto-provisions the blog_digest automation and attaches its recent runs', async () => {
      const automation = makeAutomation();
      automationsDao.getOrCreate.mockResolvedValue(automation);
      automationRunsDao.findRecentForAutomation.mockResolvedValue([]);

      const result = await service.list(ORG_ID);

      expect(automationsDao.getOrCreate).toHaveBeenCalledWith(ORG_ID, 'blog_digest');
      expect(result).toEqual([{ ...automation, runs: [] }]);
    });
  });

  describe('runNow', () => {
    it('throws 404 for an automation that does not belong to this org', async () => {
      automationsDao.findById.mockResolvedValue(null);
      await expect(service.runNow('auto-1', ORG_ID)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('records and rethrows a failed run when project/issue type are not configured', async () => {
      automationsDao.findById.mockResolvedValue(makeAutomation({ config: {} }));

      await expect(service.runNow('auto-1', ORG_ID)).rejects.toBeInstanceOf(BadRequestException);

      expect(automationRunsDao.create).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'failed', automationId: 'auto-1' }),
      );
    });

    it('records and rethrows a failed run when Jira is not connected', async () => {
      automationsDao.findById.mockResolvedValue(makeAutomation());
      jiraConnectionsDao.findForOrg.mockResolvedValue(null);

      await expect(service.runNow('auto-1', ORG_ID)).rejects.toBeInstanceOf(NotFoundException);
      expect(automationRunsDao.create).toHaveBeenCalledWith(expect.objectContaining({ status: 'failed' }));
    });

    it('skips (without creating a ticket) when the latest post was already processed', async () => {
      const automation = makeAutomation({ last_processed_url: 'https://oasis.security/blog/same-post' });
      automationsDao.findById.mockResolvedValue(automation);
      jiraConnectionsDao.findForOrg.mockResolvedValue(makeConnection());
      jest.mocked(blogDigestJob.fetchLatestPost).mockResolvedValue({
        url: 'https://oasis.security/blog/same-post',
        title: 'Same Post',
        excerpt: '...',
      });
      automationRunsDao.findMostRecentForAutomation.mockResolvedValue({ status: 'skipped' } as AutomationRunRow);

      const result = await service.runNow('auto-1', ORG_ID);

      expect(result.status).toBe('skipped');
      expect(jiraService.createIssue).not.toHaveBeenCalled();
      expect(automationsDao.setLastProcessedUrl).not.toHaveBeenCalled();
      expect(automationRunsDao.create).toHaveBeenCalledWith(expect.objectContaining({ status: 'skipped' }));
    });

    it('creates a ticket and records a success run for a new post', async () => {
      const automation = makeAutomation({ last_processed_url: 'https://oasis.security/blog/old-post' });
      automationsDao.findById.mockResolvedValue(automation);
      jiraConnectionsDao.findForOrg.mockResolvedValue(makeConnection());
      jest.mocked(blogDigestJob.fetchLatestPost).mockResolvedValue({
        url: 'https://oasis.security/blog/new-post',
        title: 'New Post',
        excerpt: 'excerpt',
      });
      jest.mocked(blogDigestJob.fetchPostBody).mockResolvedValue('full body text');
      jest.mocked(blogDigestJob.summarize).mockResolvedValue('a summary');
      jiraService.createIssue.mockResolvedValue({ key: 'KAN-9', url: 'https://acme.atlassian.net/browse/KAN-9' });
      automationRunsDao.findMostRecentForAutomation.mockResolvedValue({ status: 'success' } as AutomationRunRow);

      const result = await service.runNow('auto-1', ORG_ID);

      expect(result.status).toBe('success');
      expect(jiraService.createIssue).toHaveBeenCalledWith(
        ORG_ID,
        expect.objectContaining({ projectKey: 'KAN', issueTypeId: '10001', summary: 'NHI Blog Digest: New Post' }),
      );
      expect(automationsDao.setLastProcessedUrl).toHaveBeenCalledWith(
        'auto-1',
        ORG_ID,
        'https://oasis.security/blog/new-post',
      );
      expect(automationRunsDao.create).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'success', jiraTicketUrl: 'https://acme.atlassian.net/browse/KAN-9' }),
      );
    });
  });

  describe('update', () => {
    it('throws 404 for an automation that does not belong to this org', async () => {
      automationsDao.findById.mockResolvedValue(null);
      await expect(service.update('auto-1', ORG_ID, { enabled: true })).rejects.toBeInstanceOf(NotFoundException);
    });

    it('merges partial config updates onto the existing config rather than replacing it', async () => {
      automationsDao.findById.mockResolvedValue(makeAutomation({ config: { project_key: 'KAN', issue_type_id: '1' } }));
      automationsDao.update.mockResolvedValue(makeAutomation());

      await service.update('auto-1', ORG_ID, { project_key: 'SEC' });

      expect(automationsDao.update).toHaveBeenCalledWith(
        'auto-1',
        ORG_ID,
        expect.objectContaining({ config: { project_key: 'SEC', issue_type_id: '1' } }),
      );
    });
  });
});
