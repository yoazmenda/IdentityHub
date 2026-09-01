import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { SessionsDao } from '../dao/sessions.dao';

/** Housekeeping: expired session rows are harmless (the guard already ignores them) but no reason to keep them. */
@Injectable()
export class SessionsCleanupTask {
  private readonly logger = new Logger(SessionsCleanupTask.name);

  constructor(private readonly sessionsDao: SessionsDao) {}

  @Cron(CronExpression.EVERY_HOUR)
  async handleCron(): Promise<void> {
    await this.sessionsDao.deleteExpired();
    this.logger.debug('Cleaned up expired sessions');
  }
}
