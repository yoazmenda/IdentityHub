import { Test } from '@nestjs/testing';
import { INestApplication, NotFoundException, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import * as jwt from 'jsonwebtoken';
import { FindingsController } from './findings.controller';
import { FindingsService } from '../../services/findings.service';
import { JwtAuthGuard } from '../../middleware/jwt-auth.guard';
import { SessionsDao } from '../../dao/sessions.dao';
import { HttpExceptionFilter } from '../../common/http-exception.filter';
import { ValidationFailedException, toValidationDetails } from '../../common/validation.exception';

jest.mock('../../config/env', () => ({ env: { jwtSecret: 'test-secret-value-not-real' } }));

const ORG_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const FINDING_ID = '33333333-3333-4333-8333-333333333333';

describe('FindingsController', () => {
  let app: INestApplication;
  let token: string;
  const findingsService = { list: jest.fn(), getWithTicket: jest.fn(), create: jest.fn(), update: jest.fn(), delete: jest.fn() };
  const sessionsDao = { findActiveById: jest.fn() };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [FindingsController],
      providers: [
        { provide: FindingsService, useValue: findingsService },
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

    token = jwt.sign({ sub: USER_ID, org: ORG_ID }, 'test-secret-value-not-real', { jwtid: 'session-1' });
    sessionsDao.findActiveById.mockResolvedValue({
      id: 'session-1',
      user_id: USER_ID,
      organization_id: ORG_ID,
      expires_at: new Date(Date.now() + 100000),
      created_at: new Date(),
    });
  });

  afterAll(async () => app.close());
  afterEach(() => jest.clearAllMocks());

  const auth = () => `Bearer ${token}`;

  it('GET /findings scopes the call to the caller organization', async () => {
    findingsService.list.mockResolvedValue([]);
    const res = await request(app.getHttpServer()).get('/findings').set('Authorization', auth());
    expect(res.status).toBe(200);
    expect(findingsService.list).toHaveBeenCalledWith(ORG_ID);
  });

  it('GET /findings/:id 400s on a non-UUID id without reaching the service', async () => {
    const res = await request(app.getHttpServer()).get('/findings/not-a-uuid').set('Authorization', auth());
    expect(res.status).toBe(400);
    expect(findingsService.getWithTicket).not.toHaveBeenCalled();
  });

  it('GET /findings/:id maps a NotFoundException to 404 {error}', async () => {
    findingsService.getWithTicket.mockRejectedValue(new NotFoundException('Finding not found'));
    const res = await request(app.getHttpServer()).get(`/findings/${FINDING_ID}`).set('Authorization', auth());
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Finding not found' });
  });

  it('POST /findings returns 201 and forwards the caller userId + orgId', async () => {
    findingsService.create.mockResolvedValue({ id: FINDING_ID, jira_ticket: null });
    const res = await request(app.getHttpServer())
      .post('/findings')
      .set('Authorization', auth())
      .send({ title: 'X', description: 'Y', severity: 'high' });

    expect(res.status).toBe(201);
    expect(findingsService.create).toHaveBeenCalledWith(
      ORG_ID,
      USER_ID,
      expect.objectContaining({ title: 'X', description: 'Y', severity: 'high' }),
    );
  });

  it('DELETE /findings/:id returns 204 with no body', async () => {
    findingsService.delete.mockResolvedValue(undefined);
    const res = await request(app.getHttpServer()).delete(`/findings/${FINDING_ID}`).set('Authorization', auth());
    expect(res.status).toBe(204);
    expect(res.body).toEqual({});
  });

  it('rejects every route without a valid Authorization header', async () => {
    const res = await request(app.getHttpServer()).get('/findings');
    expect(res.status).toBe(401);
  });
});
