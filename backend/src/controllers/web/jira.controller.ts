import {
  BadRequestException,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { JiraService } from '../../services/jira.service';
import { JwtAuthGuard } from '../../middleware/jwt-auth.guard';
import { CurrentContext } from '../../middleware/current-context.decorator';
import { RequestContext } from '../../common/request-context';
import { env } from '../../config/env';

// Maps OAuth `state` -> who initiated the flow. The callback has no session of its own
// (it's a plain browser redirect), so this is how it recovers the org/user. In-memory is fine
// since the flow completes in seconds.
const pendingStates = new Map<string, { organizationId: string; userId: string; createdAt: number }>();
const STATE_TTL_MS = 10 * 60 * 1000;

@Controller('jira')
export class JiraController {
  constructor(private readonly jiraService: JiraService) {}

  // Returns the authorize URL as JSON rather than a 302, so the frontend can call this with
  // its Bearer token, then `window.location.href = url` itself to hand off to Atlassian.
  @Get('connect')
  @UseGuards(JwtAuthGuard)
  async connect(@CurrentContext() ctx: RequestContext) {
    const state = this.jiraService.generateState();
    pendingStates.set(state, { organizationId: ctx.organizationId, userId: ctx.userId!, createdAt: Date.now() });
    return { url: this.jiraService.buildAuthorizeUrl(state) };
  }

  @Get('callback')
  async callback(@Query('code') code: string, @Query('state') state: string, @Req() req: Request, @Res() res: Response) {
    const pending = state ? pendingStates.get(state) : undefined;
    if (pending) pendingStates.delete(state);
    for (const [key, value] of pendingStates) {
      if (Date.now() - value.createdAt > STATE_TTL_MS) pendingStates.delete(key);
    }

    if (!code || !pending) {
      return res.redirect(`${env.frontendOrigin}/settings?jira_error=invalid_state`);
    }

    try {
      await this.jiraService.connect({ organizationId: pending.organizationId, userId: pending.userId, code });
      return res.redirect(`${env.frontendOrigin}/settings?jira_connected=1`);
    } catch {
      return res.redirect(`${env.frontendOrigin}/settings?jira_error=connect_failed`);
    }
  }

  @Get('status')
  @UseGuards(JwtAuthGuard)
  async status(@CurrentContext() ctx: RequestContext) {
    const connection = await this.jiraService.getStatus(ctx.organizationId);
    if (!connection) {
      return { connected: false };
    }
    return {
      connected: connection.status === 'active',
      status: connection.status,
      site_url: connection.site_url,
      connected_by_user_id: connection.connected_by_user_id,
      created_at: connection.created_at,
    };
  }

  @Delete('connection')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(JwtAuthGuard)
  async disconnect(@CurrentContext() ctx: RequestContext) {
    await this.jiraService.disconnect(ctx.organizationId);
  }

  @Get('projects')
  @UseGuards(JwtAuthGuard)
  async projects(@CurrentContext() ctx: RequestContext) {
    return this.jiraService.listProjects(ctx.organizationId);
  }

  @Get('projects/:key/issue-types')
  @UseGuards(JwtAuthGuard)
  async issueTypes(@Param('key') key: string, @CurrentContext() ctx: RequestContext) {
    if (!key) throw new BadRequestException('project key is required');
    return this.jiraService.listIssueTypes(ctx.organizationId, key);
  }
}
