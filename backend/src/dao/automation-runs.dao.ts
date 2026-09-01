import { Injectable } from '@nestjs/common';
import { withTenant } from '../config/database';

export type AutomationRunStatus = 'success' | 'skipped' | 'failed';

export interface AutomationRunRow {
  id: string;
  automation_id: string;
  organization_id: string;
  status: AutomationRunStatus;
  summary: string;
  jira_ticket_url: string | null;
  started_at: Date;
  finished_at: Date;
}

@Injectable()
export class AutomationRunsDao {
  async create(params: {
    automationId: string;
    organizationId: string;
    status: AutomationRunStatus;
    summary: string;
    jiraTicketUrl?: string | null;
  }): Promise<AutomationRunRow> {
    return withTenant(params.organizationId, async (client) => {
      const { rows } = await client.query<AutomationRunRow>(
        `INSERT INTO automation_runs (automation_id, organization_id, status, summary, jira_ticket_url)
         VALUES ($1, $2, $3, $4, $5) RETURNING *`,
        [params.automationId, params.organizationId, params.status, params.summary, params.jiraTicketUrl ?? null],
      );
      return rows[0];
    });
  }

  async findRecentForAutomation(
    automationId: string,
    organizationId: string,
    limit = 10,
  ): Promise<AutomationRunRow[]> {
    return withTenant(organizationId, async (client) => {
      const { rows } = await client.query<AutomationRunRow>(
        `SELECT * FROM automation_runs WHERE automation_id = $1 AND organization_id = $2
         ORDER BY started_at DESC LIMIT $3`,
        [automationId, organizationId, limit],
      );
      return rows;
    });
  }

  async findMostRecentForAutomation(automationId: string, organizationId: string): Promise<AutomationRunRow | null> {
    return withTenant(organizationId, async (client) => {
      const { rows } = await client.query<AutomationRunRow>(
        'SELECT * FROM automation_runs WHERE automation_id = $1 AND organization_id = $2 ORDER BY started_at DESC LIMIT 1',
        [automationId, organizationId],
      );
      return rows[0] ?? null;
    });
  }
}
