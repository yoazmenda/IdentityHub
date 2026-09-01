import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query, UseGuards } from '@nestjs/common';
import { JiraTicketsService } from '../../services/jira-tickets.service';
import { CreateJiraTicketDto } from '../../dto/jira.dto';
import { JwtAuthGuard } from '../../middleware/jwt-auth.guard';
import { CurrentContext } from '../../middleware/current-context.decorator';
import { RequestContext } from '../../common/request-context';
import { uuidParam } from '../../common/uuid-param.pipe';

@Controller()
@UseGuards(JwtAuthGuard)
export class JiraTicketsController {
  constructor(private readonly jiraTicketsService: JiraTicketsService) {}

  @Post('findings/:id/jira-ticket')
  @HttpCode(HttpStatus.CREATED)
  async createForFinding(
    @Param('id', uuidParam) findingId: string,
    @Body() dto: CreateJiraTicketDto,
    @CurrentContext() ctx: RequestContext,
  ) {
    return this.jiraTicketsService.createForFinding(ctx.organizationId, ctx.userId, findingId, dto);
  }

  @Get('jira-tickets')
  async listRecent(
    @Query('project_key') projectKey: string | undefined,
    @Query('limit') limit: string | undefined,
    @CurrentContext() ctx: RequestContext,
  ) {
    const tickets = await this.jiraTicketsService.listRecent(ctx.organizationId, {
      projectKey,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
    return { tickets };
  }
}
