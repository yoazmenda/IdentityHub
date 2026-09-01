import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'path';

import { OrganizationsDao } from './dao/organizations.dao';
import { UsersDao } from './dao/users.dao';
import { SessionsDao } from './dao/sessions.dao';
import { FindingsDao } from './dao/findings.dao';
import { JiraConnectionsDao } from './dao/jira-connections.dao';
import { JiraTicketsDao } from './dao/jira-tickets.dao';
import { ApiKeysDao } from './dao/api-keys.dao';
import { AutomationsDao } from './dao/automations.dao';
import { AutomationRunsDao } from './dao/automation-runs.dao';

import { AuthService } from './services/auth.service';
import { FindingsService } from './services/findings.service';
import { JiraService } from './services/jira.service';
import { JiraTicketsService } from './services/jira-tickets.service';
import { ApiKeysService } from './services/api-keys.service';
import { AutomationsService } from './services/automations.service';

import { JwtAuthGuard } from './middleware/jwt-auth.guard';
import { ApiKeyAuthGuard } from './middleware/api-key-auth.guard';
import { SessionsCleanupTask } from './jobs/sessions-cleanup.task';
import { AutomationsSchedulerTask } from './jobs/automations-scheduler.task';

import { AuthController } from './controllers/web/auth.controller';
import { FindingsController } from './controllers/web/findings.controller';
import { JiraController } from './controllers/web/jira.controller';
import { JiraTicketsController } from './controllers/web/jira-tickets.controller';
import { ApiKeysController } from './controllers/web/api-keys.controller';
import { AutomationsController } from './controllers/web/automations.controller';
import { FindingsApiController } from './controllers/api/findings.controller';
import { JiraTicketsApiController } from './controllers/api/jira-tickets.controller';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    // In production the backend also serves the built frontend (README -> Architecture).
    ServeStaticModule.forRoot({
      rootPath: join(__dirname, '..', 'public'),
      exclude: ['/api/*path'],
    }),
  ],
  controllers: [
    AuthController,
    FindingsController,
    JiraController,
    JiraTicketsController,
    ApiKeysController,
    AutomationsController,
    FindingsApiController,
    JiraTicketsApiController,
  ],
  providers: [
    OrganizationsDao,
    UsersDao,
    SessionsDao,
    FindingsDao,
    JiraConnectionsDao,
    JiraTicketsDao,
    ApiKeysDao,
    AutomationsDao,
    AutomationRunsDao,
    AuthService,
    FindingsService,
    JiraService,
    JiraTicketsService,
    ApiKeysService,
    AutomationsService,
    JwtAuthGuard,
    ApiKeyAuthGuard,
    SessionsCleanupTask,
    AutomationsSchedulerTask,
  ],
})
export class AppModule {}
