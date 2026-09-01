import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { AutomationsDao } from '../dao/automations.dao';
import { AutomationRunsDao } from '../dao/automation-runs.dao';
import { AutomationsService, isDue } from '../services/automations.service';

// Ticks hourly and asks, per org, "is this org's enabled blog_digest automation due yet?" —
// one shared tick over N rows rather than per-tenant dynamic cron registration.
@Injectable()
export class AutomationsSchedulerTask {
  private readonly logger = new Logger(AutomationsSchedulerTask.name);

  constructor(
    private readonly automationsDao: AutomationsDao,
    private readonly automationRunsDao: AutomationRunsDao,
    private readonly automationsService: AutomationsService,
  ) {}

  @Cron(CronExpression.EVERY_HOUR)
  async handleCron(): Promise<void> {
    const candidates = await this.automationsDao.findAllEnabledByType('blog_digest');
    const now = new Date();

    for (const automation of candidates) {
      const lastRun = await this.automationRunsDao.findMostRecentForAutomation(automation.id, automation.organization_id);
      if (!isDue(automation.schedule, lastRun?.started_at ?? null, now)) continue;

      try {
        const result = await this.automationsService.runNow(automation.id, automation.organization_id);
        this.logger.log(`[org ${automation.organization_id}] blog_digest: ${result.status} — ${result.run.summary}`);
      } catch (err) {
        // Already recorded to automation_runs by the service — just don't let it block the batch.
        this.logger.warn(`[org ${automation.organization_id}] blog_digest failed: ${(err as Error).message}`);
      }
    }
  }
}
