import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { FindingsService } from '../../services/findings.service';
import { CreateFindingDto, UpdateFindingDto } from '../../dto/findings.dto';
import { JwtAuthGuard } from '../../middleware/jwt-auth.guard';
import { CurrentContext } from '../../middleware/current-context.decorator';
import { RequestContext } from '../../common/request-context';
import { uuidParam } from '../../common/uuid-param.pipe';

@Controller('findings')
@UseGuards(JwtAuthGuard)
export class FindingsController {
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

  @Put(':id')
  async update(
    @Param('id', uuidParam) id: string,
    @Body() dto: UpdateFindingDto,
    @CurrentContext() ctx: RequestContext,
  ) {
    return this.findingsService.update(id, ctx.organizationId, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id', uuidParam) id: string, @CurrentContext() ctx: RequestContext) {
    await this.findingsService.delete(id, ctx.organizationId);
  }
}
