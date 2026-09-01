import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, UseGuards } from '@nestjs/common';
import { FindingsService } from '../../services/findings.service';
import { CreateFindingDto } from '../../dto/findings.dto';
import { ApiKeyAuthGuard } from '../../middleware/api-key-auth.guard';
import { CurrentContext } from '../../middleware/current-context.decorator';
import { RequestContext } from '../../common/request-context';
import { uuidParam } from '../../common/uuid-param.pipe';

/** External API for scanners/CI pipelines. Same request/response shape as the web endpoints. */
@Controller('v1/findings')
@UseGuards(ApiKeyAuthGuard)
export class FindingsApiController {
  constructor(private readonly findingsService: FindingsService) {}

  @Get()
  async list(@CurrentContext() ctx: RequestContext) {
    return this.findingsService.list(ctx.organizationId);
  }

  @Get(':id')
  async getOne(@Param('id', uuidParam) id: string, @CurrentContext() ctx: RequestContext) {
    return this.findingsService.getWithTicket(id, ctx.organizationId);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() dto: CreateFindingDto, @CurrentContext() ctx: RequestContext) {
    return this.findingsService.create(ctx.organizationId, ctx.userId, dto);
  }
}
