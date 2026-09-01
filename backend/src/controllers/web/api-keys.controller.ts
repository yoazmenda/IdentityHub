import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Post, UseGuards } from '@nestjs/common';
import { ApiKeysService } from '../../services/api-keys.service';
import { CreateApiKeyDto } from '../../dto/api-keys.dto';
import { JwtAuthGuard } from '../../middleware/jwt-auth.guard';
import { CurrentContext } from '../../middleware/current-context.decorator';
import { RequestContext } from '../../common/request-context';
import { uuidParam } from '../../common/uuid-param.pipe';

@Controller('api-keys')
@UseGuards(JwtAuthGuard)
export class ApiKeysController {
  constructor(private readonly apiKeysService: ApiKeysService) {}

  @Get()
  async list(@CurrentContext() ctx: RequestContext) {
    return this.apiKeysService.list(ctx.organizationId);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() dto: CreateApiKeyDto, @CurrentContext() ctx: RequestContext) {
    return this.apiKeysService.create(ctx.organizationId, ctx.userId!, dto.label);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async revoke(@Param('id', uuidParam) id: string, @CurrentContext() ctx: RequestContext) {
    await this.apiKeysService.revoke(id, ctx.organizationId);
  }
}
