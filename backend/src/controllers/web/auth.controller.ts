import { Body, Controller, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { AuthService } from '../../services/auth.service';
import { RegisterDto, LoginDto } from '../../dto/auth.dto';
import { JwtAuthGuard } from '../../middleware/jwt-auth.guard';
import { CurrentSessionId } from '../../middleware/current-session-id.decorator';
import { CurrentContext } from '../../middleware/current-context.decorator';
import { RequestContext } from '../../common/request-context';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  async register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() dto: LoginDto) {
    return this.authService.login(dto.email, dto.password);
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(JwtAuthGuard)
  async logout(@CurrentSessionId() sessionId: string, @CurrentContext() ctx: RequestContext) {
    await this.authService.logout(sessionId, ctx.organizationId);
  }
}
