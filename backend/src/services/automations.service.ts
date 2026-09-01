import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AutomationsDao, AutomationRow, AutomationSchedule } from '../dao/automations.dao';
import { AutomationRunsDao, AutomationRunRow } from '../dao/automation-runs.dao';
import { JiraConnectionsDao } from '../dao/jira-connections.dao';
import { JiraService } from './jira.service';
import { fetchLatestPost, fetchPostBody, summarize } from '../jobs/blog-digest.job';

export interface AutomationWithRuns extends AutomationRow {
  runs: AutomationRunRow[];
}

export interface RunResult {
  status: 'success' | 'skipped';
  run: AutomationRunRow;
}

const SCHEDULE_INTERVAL_MS: Record<Exclude<AutomationSchedule, 'manual'>, number> = {
  hourly: 60 * 60 * 1000,
  daily: 24 * 60 * 60 * 1000,
  weekly: 7 * 24 * 60 * 60 * 1000,
};

/** True if a non-manual automation's schedule interval has elapsed since its last run (or it has never run). */
export function isDue(schedule: AutomationSchedule, lastRunAt: Date | null, now: Date): boolean {
  if (schedule === 'manual') return false;
  if (!lastRunAt) return true;
  return now.getTime() - lastRunAt.getTime() >= SCHEDULE_INTERVAL_MS[schedule];
}

@Injectable()
export class AutomationsService {
  constructor(
    private readonly automationsDao: AutomationsDao,
    private readonly automationRunsDao: AutomationRunsDao,
    private readonly jiraConnectionsDao: JiraConnectionsDao,
    private readonly jiraService: JiraService,
  ) {}

  async list(organizationId: string): Promise<AutomationWithRuns[]> {
    const blogDigest = await this.automationsDao.getOrCreate(organizationId, 'blog_digest');
    const runs = await this.automationRunsDao.findRecentForAutomation(blogDigest.id, organizationId, 10);
    return [{ ...blogDigest, runs }];
  }

  async update(
    id: string,
    organizationId: string,
    dto: { enabled?: boolean; schedule?: AutomationSchedule; project_key?: string; issue_type_id?: string },
  ): Promise<AutomationRow> {
    const existing = await this.automationsDao.findById(id, organizationId);
    if (!existing) {
      throw new NotFoundException('Automation not found');
    }
    const updated = await this.automationsDao.update(id, organizationId, {
      enabled: dto.enabled,
      schedule: dto.schedule,
      config:
        dto.project_key !== undefined || dto.issue_type_id !== undefined
          ? {
              project_key: dto.project_key ?? existing.config.project_key,
              issue_type_id: dto.issue_type_id ?? existing.config.issue_type_id,
            }
          : undefined,
    });
    return updated!;
  }

  /** Manual "Run now" (controller) and the scheduler tick both call this — same code path either way. */
  async runNow(id: string, organizationId: string): Promise<RunResult> {
    const automation = await this.automationsDao.findById(id, organizationId);
    if (!automation) {
      throw new NotFoundException('Automation not found');
    }

    try {
      const result = await this.executeBlogDigest(automation);
      await this.automationRunsDao.create({
        automationId: automation.id,
        organizationId,
        status: result.status,
        summary: result.summary,
        jiraTicketUrl: result.jiraTicketUrl,
      });
      if (result.status === 'success' && result.processedUrl) {
        await this.automationsDao.setLastProcessedUrl(automation.id, organizationId, result.processedUrl);
      }
      const run = await this.automationRunsDao.findMostRecentForAutomation(automation.id, organizationId);
      return { status: result.status, run: run! };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      await this.automationRunsDao.create({
        automationId: automation.id,
        organizationId,
        status: 'failed',
        summary: message,
      });
      throw err;
    }
  }

  private async executeBlogDigest(automation: AutomationRow): Promise<{
    status: 'success' | 'skipped';
    summary: string;
    jiraTicketUrl?: string;
    processedUrl?: string;
  }> {
    const { project_key: projectKey, issue_type_id: issueTypeId } = automation.config;
    if (!projectKey || !issueTypeId) {
      throw new BadRequestException('Configure a target project and issue type before running this automation.');
    }

    const connection = await this.jiraConnectionsDao.findForOrg(automation.organization_id);
    if (!connection || connection.status !== 'active') {
      throw new NotFoundException('Jira is not connected for this organization');
    }

    const post = await fetchLatestPost();
    if (post.url === automation.last_processed_url) {
      return { status: 'skipped', summary: `Already processed the latest post: "${post.title}"` };
    }

    const body = await fetchPostBody(post.url);
    const summary = await summarize(post.title, body, post.excerpt);

    const issue = await this.jiraService.createIssue(automation.organization_id, {
      projectKey,
      issueTypeId,
      summary: `NHI Blog Digest: ${post.title}`,
      description: `${summary}\n\nOriginal post: ${post.url}`,
    });

    return {
      status: 'success',
      summary: `Created ${issue.key} from "${post.title}"`,
      jiraTicketUrl: issue.url,
      processedUrl: post.url,
    };
  }
}
