import { Injectable } from '@nestjs/common';
import { withTenant } from '../config/database';

export interface JiraTicketRow {
  id: string;
  finding_id: string;
  jira_connection_id: string;
  organization_id: string;
  jira_issue_key: string;
  jira_project_key: string;
  jira_url: string;
  title: string;
  created_by_user_id: string | null;
  created_at: Date;
}

@Injectable()
export class JiraTicketsDao {
  async findByFindingId(findingId: string, organizationId: string): Promise<JiraTicketRow | null> {
    return withTenant(organizationId, async (client) => {
      const { rows } = await client.query<JiraTicketRow>(
        'SELECT * FROM jira_tickets WHERE finding_id = $1 AND organization_id = $2',
        [findingId, organizationId],
      );
      return rows[0] ?? null;
    });
  }

  /** Used by FindingsService.list to attach each finding's ticket (drives the list page's Jira Ticket column). */
  async findAllForOrgByFindingId(organizationId: string): Promise<Map<string, JiraTicketRow>> {
    return withTenant(organizationId, async (client) => {
      const { rows } = await client.query<JiraTicketRow>(
        'SELECT * FROM jira_tickets WHERE organization_id = $1',
        [organizationId],
      );
      return new Map(rows.map((row) => [row.finding_id, row]));
    });
  }

  async create(params: {
    findingId: string;
    jiraConnectionId: string;
    organizationId: string;
    jiraIssueKey: string;
    jiraProjectKey: string;
    jiraUrl: string;
    title: string;
    createdByUserId: string | null;
  }): Promise<JiraTicketRow> {
    return withTenant(params.organizationId, async (client) => {
      const { rows } = await client.query<JiraTicketRow>(
        `INSERT INTO jira_tickets
           (finding_id, jira_connection_id, organization_id, jira_issue_key, jira_project_key, jira_url, title, created_by_user_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
        [
          params.findingId,
          params.jiraConnectionId,
          params.organizationId,
          params.jiraIssueKey,
          params.jiraProjectKey,
          params.jiraUrl,
          params.title,
          params.createdByUserId,
        ],
      );
      return rows[0];
    });
  }

  /** Recent tickets, optionally scoped to one Jira project (see README -> Design Decisions & Assumptions). */
  async findRecentForOrg(
    organizationId: string,
    params: { projectKey?: string; limit: number },
  ): Promise<JiraTicketRow[]> {
    return withTenant(organizationId, async (client) => {
      if (params.projectKey) {
        const { rows } = await client.query<JiraTicketRow>(
          `SELECT * FROM jira_tickets
           WHERE organization_id = $1 AND jira_project_key = $2
           ORDER BY created_at DESC LIMIT $3`,
          [organizationId, params.projectKey, params.limit],
        );
        return rows;
      }
      const { rows } = await client.query<JiraTicketRow>(
        `SELECT * FROM jira_tickets WHERE organization_id = $1 ORDER BY created_at DESC LIMIT $2`,
        [organizationId, params.limit],
      );
      return rows;
    });
  }
}
