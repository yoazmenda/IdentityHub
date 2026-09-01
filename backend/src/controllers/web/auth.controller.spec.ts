import { Test } from '@nestjs/testing';
import { INestApplication, UnauthorizedException, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AuthController } from './auth.controller';
import { AuthService } from '../../services/auth.service';
import { HttpExceptionFilter } from '../../common/http-exception.filter';
import { ValidationFailedException, toValidationDetails } from '../../common/validation.exception';
import { JwtAuthGuard } from '../../middleware/jwt-auth.guard';
import { SessionsDao } from '../../dao/sessions.dao';

// Controller-level test: the service is mocked, so this only verifies the HTTP contract —
// status codes, request validation, response shape. Business logic is in auth.service.spec.ts;
// real persistence is in test/app.e2e-spec.ts.
describe('AuthController', () => {
  let app: INestApplication;
  const authService = { register: jest.fn(), login: jest.fn(), logout: jest.fn() };
  const sessionsDao = { findActiveById: jest.fn() };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        { provide: AuthService, useValue: authService },
        JwtAuthGuard,
        { provide: SessionsDao, useValue: sessionsDao },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        exceptionFactory: (errors) => new ValidationFailedException(toValidationDetails(errors)),
      }),
    );
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  afterEach(() => jest.clearAllMocks());

  describe('POST /auth/register', () => {
    it('returns 201 with the service result on valid input', async () => {
      authService.register.mockResolvedValue({ token: 'jwt', user: { id: 'u1', name: 'Ada', email: 'ada@x.com' } });

      const res = await request(app.getHttpServer())
        .post('/auth/register')
        .send({ email: 'ada@x.com', password: 'password123', name: 'Ada' });

      expect(res.status).toBe(201);
      expect(res.body).toEqual({ token: 'jwt', user: { id: 'u1', name: 'Ada', email: 'ada@x.com' } });
      expect(authService.register).toHaveBeenCalledWith({ email: 'ada@x.com', password: 'password123', name: 'Ada' });
    });

    it('returns 400 with field-level details before ever calling the service', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/register')
        .send({ email: 'not-an-email', password: 'short', name: '' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Validation failed');
      expect(res.body.details.length).toBeGreaterThan(0);
      expect(authService.register).not.toHaveBeenCalled();
    });
  });

  describe('POST /auth/login', () => {
    it('returns 200 (not 201) on success', async () => {
      authService.login.mockResolvedValue({ token: 'jwt', user: { id: 'u1', name: 'Ada', email: 'ada@x.com' } });
      const res = await request(app.getHttpServer()).post('/auth/login').send({ email: 'ada@x.com', password: 'x' });
      expect(res.status).toBe(200);
    });

    it('propagates a 401 from the service as {error: string}', async () => {
      authService.login.mockRejectedValue(new UnauthorizedException('Invalid email or password'));

      const res = await request(app.getHttpServer()).post('/auth/login').send({ email: 'ada@x.com', password: 'wrong' });
      expect(res.status).toBe(401);
      expect(res.body).toEqual({ error: 'Invalid email or password' });
    });
  });

  describe('POST /auth/logout', () => {
    it('requires authentication (401 without a token)', async () => {
      const res = await request(app.getHttpServer()).post('/auth/logout');
      expect(res.status).toBe(401);
      expect(authService.logout).not.toHaveBeenCalled();
    });
  });
});
