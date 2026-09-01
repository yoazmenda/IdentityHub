import { Injectable, NotFoundException } from '@nestjs/common';
import { FindingsDao, FindingRow } from '../dao/findings.dao';
import { JiraTicketsDao, JiraTicketRow } from '../dao/jira-tickets.dao';
import { JiraTicketsService } from './jira-tickets.service';
import { CreateFindingDto, UpdateFindingDto } from '../dto/findings.dto';

export interface FindingWithTicket extends FindingRow {
  jira_ticket: JiraTicketRow | null;
}

@Injectable()
export class FindingsService {
  constructor(
    private readonly findingsDao: FindingsDao,
    private readonly jiraTicketsDao: JiraTicketsDao,
    private readonly jiraTicketsService: JiraTicketsService,
  ) {}

  /** Includes each finding's linked ticket (or null) — the list page's Jira Ticket column needs it. */
  async list(organizationId: string): Promise<FindingWithTicket[]> {
    const [findings, ticketsByFindingId] = await Promise.all([
      this.findingsDao.findAllForOrg(organizationId),
      this.jiraTicketsDao.findAllForOrgByFindingId(organizationId),
    ]);
    return findings.map((finding) => ({
      ...finding,
      jira_ticket: ticketsByFindingId.get(finding.id) ?? null,
    }));
  }

  async getWithTicket(id: string, organizationId: string): Promise<FindingWithTicket> {
    const finding = await this.findingsDao.findById(id, organizationId);
    if (!finding) {
      throw new NotFoundException('Finding not found');
    }
    const ticket = await this.jiraTicketsDao.findByFindingId(id, organizationId);
    return { ...finding, jira_ticket: ticket };
  }

  /** When `jira` is supplied, creation is atomic: if the Jira call fails, the finding is rolled back too. */
  async create(
    organizationId: string,
    userId: string | undefined,
    dto: CreateFindingDto,
  ): Promise<FindingWithTicket> {
    const finding = await this.findingsDao.create({
      organizationId,
      title: dto.title,
      description: dto.description,
      severity: dto.severity,
    });

    if (!dto.jira) {
      return { ...finding, jira_ticket: null };
    }

    try {
      const ticket = await this.jiraTicketsService.createForFinding(organizationId, userId, finding.id, {
        project_key: dto.jira.project_key,
        issue_type_id: dto.jira.issue_type_id,
      });
      return { ...finding, jira_ticket: ticket };
    } catch (err) {
      await this.findingsDao.delete(finding.id, organizationId);
      throw err;
    }
  }

  async update(id: string, organizationId: string, dto: UpdateFindingDto): Promise<FindingRow> {
    const updated = await this.findingsDao.update(id, organizationId, dto);
    if (!updated) {
      throw new NotFoundException('Finding not found');
    }
    return updated;
  }

  async delete(id: string, organizationId: string): Promise<void> {
    const deleted = await this.findingsDao.delete(id, organizationId);
    if (!deleted) {
      throw new NotFoundException('Finding not found');
    }
  }
}
