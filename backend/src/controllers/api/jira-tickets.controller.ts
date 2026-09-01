import { Body, Controller, HttpCode, HttpStatus, Param, Post, UseGuards } from '@nestjs/common';
import { JiraTicketsService } from '../../services/jira-tickets.service';
import { CreateJiraTicketDto } from '../../dto/jira.dto';
import { ApiKeyAuthGuard } from '../../middleware/api-key-auth.guard';
import { CurrentContext } from '../../middleware/current-context.decorator';
import { RequestContext } from '../../common/request-context';
import { uuidParam } from '../../common/uuid-param.pipe';

@Controller('v1/findings')
@UseGuards(ApiKeyAuthGuard)
export class JiraTicketsApiController {
  constructor(private readonly jiraTicketsService: JiraTicketsService) {}

  @Post(':id/jira-ticket')
  @HttpCode(HttpStatus.CREATED)
  async createForFinding(
    @Param('id', uuidParam) findingId: string,
    @Body() dto: CreateJiraTicketDto,
    @CurrentContext() ctx: RequestContext,
  ) {
    return this.jiraTicketsService.createForFinding(ctx.organizationId, ctx.userId, findingId, dto);
  }
}
