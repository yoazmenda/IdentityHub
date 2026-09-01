import { NotFoundException } from '@nestjs/common';
import { FindingsService } from './findings.service';
import { FindingsDao, FindingRow } from '../dao/findings.dao';
import { JiraTicketsDao, JiraTicketRow } from '../dao/jira-tickets.dao';
import { JiraTicketsService } from './jira-tickets.service';

const ORG_ID = 'org-1';

function makeFinding(overrides: Partial<FindingRow> = {}): FindingRow {
  return {
    id: 'finding-1',
    organization_id: ORG_ID,
    title: 'Stale Service Account',
    description: 'Unused for 90 days',
    severity: 'high',
    status: 'open',
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides,
  };
}

describe('FindingsService', () => {
  let findingsDao: jest.Mocked<FindingsDao>;
  let jiraTicketsDao: jest.Mocked<JiraTicketsDao>;
  let jiraTicketsService: jest.Mocked<JiraTicketsService>;
  let service: FindingsService;

  beforeEach(() => {
    findingsDao = {
      findAllForOrg: jest.fn(),
      findById: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    } as never;
    jiraTicketsDao = {
      findByFindingId: jest.fn(),
      findAllForOrgByFindingId: jest.fn(),
    } as never;
    jiraTicketsService = { createForFinding: jest.fn() } as never;
    service = new FindingsService(findingsDao, jiraTicketsDao, jiraTicketsService);
  });

  describe('list', () => {
    it('attaches each finding its linked ticket (or null) — required for the list page Jira icon', async () => {
      const withTicket = makeFinding({ id: 'f1' });
      const withoutTicket = makeFinding({ id: 'f2' });
      findingsDao.findAllForOrg.mockResolvedValue([withTicket, withoutTicket]);
      const ticket = { id: 't1', finding_id: 'f1', jira_issue_key: 'KAN-1' } as JiraTicketRow;
      jiraTicketsDao.findAllForOrgByFindingId.mockResolvedValue(new Map([['f1', ticket]]));

      const result = await service.list(ORG_ID);

      expect(result.find((f) => f.id === 'f1')?.jira_ticket).toEqual(ticket);
      expect(result.find((f) => f.id === 'f2')?.jira_ticket).toBeNull();
    });
  });

  describe('getWithTicket', () => {
    it('throws 404 for a finding that does not exist in this org', async () => {
      findingsDao.findById.mockResolvedValue(null);
      await expect(service.getWithTicket('missing', ORG_ID)).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('create', () => {
    it('creates a finding only, when no jira block is supplied', async () => {
      const finding = makeFinding();
      findingsDao.create.mockResolvedValue(finding);

      const result = await service.create(ORG_ID, 'user-1', {
        title: finding.title,
        description: finding.description,
        severity: finding.severity,
      });

      expect(result.jira_ticket).toBeNull();
      expect(jiraTicketsService.createForFinding).not.toHaveBeenCalled();
    });

    it('rolls back the finding if the requested Jira ticket creation fails', async () => {
      const finding = makeFinding();
      findingsDao.create.mockResolvedValue(finding);
      jiraTicketsService.createForFinding.mockRejectedValue(new Error('Jira API down'));

      await expect(
        service.create(ORG_ID, 'user-1', {
          title: finding.title,
          description: finding.description,
          severity: finding.severity,
          jira: { project_key: 'KAN', issue_type_id: '10001' },
        }),
      ).rejects.toThrow('Jira API down');

      expect(findingsDao.delete).toHaveBeenCalledWith(finding.id, ORG_ID);
    });

    it('returns the finding with its ticket when Jira creation succeeds', async () => {
      const finding = makeFinding();
      findingsDao.create.mockResolvedValue(finding);
      const ticket = { id: 't1', jira_issue_key: 'KAN-1' } as JiraTicketRow;
      jiraTicketsService.createForFinding.mockResolvedValue(ticket);

      const result = await service.create(ORG_ID, 'user-1', {
        title: finding.title,
        description: finding.description,
        severity: finding.severity,
        jira: { project_key: 'KAN', issue_type_id: '10001' },
      });

      expect(result.jira_ticket).toEqual(ticket);
      expect(findingsDao.delete).not.toHaveBeenCalled();
    });
  });

  describe('delete', () => {
    it('throws 404 when nothing was deleted (wrong org or missing id)', async () => {
      findingsDao.delete.mockResolvedValue(false);
      await expect(service.delete('finding-1', ORG_ID)).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
