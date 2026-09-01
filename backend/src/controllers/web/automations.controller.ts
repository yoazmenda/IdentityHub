import { Body, Controller, Get, Param, Post, Put, UseGuards } from '@nestjs/common';
import { AutomationsService } from '../../services/automations.service';
import { UpdateAutomationDto } from '../../dto/automations.dto';
import { JwtAuthGuard } from '../../middleware/jwt-auth.guard';
import { CurrentContext } from '../../middleware/current-context.decorator';
import { RequestContext } from '../../common/request-context';
import { uuidParam } from '../../common/uuid-param.pipe';

@Controller('automations')
@UseGuards(JwtAuthGuard)
export class AutomationsController {
  constructor(private readonly automationsService: AutomationsService) {}

  @Get()
  async list(@CurrentContext() ctx: RequestContext) {
    return this.automationsService.list(ctx.organizationId);
  }

  @Put(':id')
  async update(
    @Param('id', uuidParam) id: string,
    @Body() dto: UpdateAutomationDto,
    @CurrentContext() ctx: RequestContext,
  ) {
    return this.automationsService.update(id, ctx.organizationId, dto);
  }

  @Post(':id/run')
  async run(@Param('id', uuidParam) id: string, @CurrentContext() ctx: RequestContext) {
    return this.automationsService.runNow(id, ctx.organizationId);
  }
}
