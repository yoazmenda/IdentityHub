import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { FindingsDao } from '../dao/findings.dao';
import { JiraTicketsDao, JiraTicketRow } from '../dao/jira-tickets.dao';
import { JiraConnectionsDao } from '../dao/jira-connections.dao';
import { JiraService } from './jira.service';

interface CreateTicketInput {
  project_key: string;
  issue_type_id: string;
  summary?: string;
  description?: string;
}

@Injectable()
export class JiraTicketsService {
  constructor(
    private readonly findingsDao: FindingsDao,
    private readonly jiraTicketsDao: JiraTicketsDao,
    private readonly jiraConnectionsDao: JiraConnectionsDao,
    private readonly jiraService: JiraService,
  ) {}

  /** 409s if the finding already has a linked ticket (finding_id is NOT NULL & 1:1 in practice). */
  async createForFinding(
    organizationId: string,
    userId: string | undefined,
    findingId: string,
    input: CreateTicketInput,
  ): Promise<JiraTicketRow> {
    const finding = await this.findingsDao.findById(findingId, organizationId);
    if (!finding) {
      throw new NotFoundException('Finding not found');
    }

    const existing = await this.jiraTicketsDao.findByFindingId(findingId, organizationId);
    if (existing) {
      throw new ConflictException(
        `This finding already has a linked Jira ticket (${existing.jira_issue_key})`,
      );
    }

    const connection = await this.jiraConnectionsDao.findForOrg(organizationId);
    if (!connection || connection.status !== 'active') {
      throw new NotFoundException('Jira is not connected for this organization');
    }

    const issue = await this.jiraService.createIssue(organizationId, {
      projectKey: input.project_key,
      issueTypeId: input.issue_type_id,
      summary: input.summary ?? finding.title,
      description: input.description ?? finding.description,
    });

    return this.jiraTicketsDao.create({
      findingId,
      jiraConnectionId: connection.id,
      organizationId,
      jiraIssueKey: issue.key,
      jiraProjectKey: input.project_key,
      jiraUrl: issue.url,
      title: input.summary ?? finding.title,
      createdByUserId: userId ?? null,
    });
  }

  async listRecent(
    organizationId: string,
    params: { projectKey?: string; limit?: number },
  ): Promise<JiraTicketRow[]> {
    const limit = Math.min(params.limit ?? 10, 50);
    return this.jiraTicketsDao.findRecentForOrg(organizationId, { projectKey: params.projectKey, limit });
  }
}
