import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { createHash } from 'crypto';
import request from 'supertest';
import { FindingsApiController } from './findings.controller';
import { FindingsService } from '../../services/findings.service';
import { ApiKeyAuthGuard } from '../../middleware/api-key-auth.guard';
import { ApiKeysDao } from '../../dao/api-keys.dao';
import { HttpExceptionFilter } from '../../common/http-exception.filter';
import { ValidationFailedException, toValidationDetails } from '../../common/validation.exception';

const ORG_ID = 'org-1';
const PLAIN_KEY = 'ihk_test_key_123';

describe('FindingsApiController (external API)', () => {
  let app: INestApplication;
  const findingsService = { list: jest.fn(), getWithTicket: jest.fn(), create: jest.fn() };
  const apiKeysDao = { findActiveByHash: jest.fn() };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [FindingsApiController],
      providers: [
        { provide: FindingsService, useValue: findingsService },
        ApiKeyAuthGuard,
        { provide: ApiKeysDao, useValue: apiKeysDao },
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

  afterAll(async () => app.close());
  afterEach(() => jest.clearAllMocks());

  it('rejects a request with no X-API-Key header', async () => {
    const res = await request(app.getHttpServer()).get('/v1/findings');
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'Missing X-API-Key header' });
  });

  it('rejects an unrecognized key', async () => {
    apiKeysDao.findActiveByHash.mockResolvedValue(null);
    const res = await request(app.getHttpServer()).get('/v1/findings').set('X-API-Key', 'bogus');
    expect(res.status).toBe(401);
  });

  it('accepts a valid key and scopes the call to that key’s organization, not any userId', async () => {
    apiKeysDao.findActiveByHash.mockResolvedValue({ organization_id: ORG_ID });
    findingsService.list.mockResolvedValue([]);

    const res = await request(app.getHttpServer()).get('/v1/findings').set('X-API-Key', PLAIN_KEY);

    expect(res.status).toBe(200);
    expect(apiKeysDao.findActiveByHash).toHaveBeenCalledWith(createHash('sha256').update(PLAIN_KEY).digest('hex'));
    expect(findingsService.list).toHaveBeenCalledWith(ORG_ID);
  });

  it('POST /v1/findings validates input the same way as the web endpoint', async () => {
    apiKeysDao.findActiveByHash.mockResolvedValue({ organization_id: ORG_ID });
    const res = await request(app.getHttpServer())
      .post('/v1/findings')
      .set('X-API-Key', PLAIN_KEY)
      .send({ title: '', description: '', severity: 'not-a-severity' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Validation failed');
    expect(findingsService.create).not.toHaveBeenCalled();
  });

  it('POST /v1/findings creates with userId undefined (no authenticated user for API-key callers)', async () => {
    apiKeysDao.findActiveByHash.mockResolvedValue({ organization_id: ORG_ID });
    findingsService.create.mockResolvedValue({ id: 'f1', jira_ticket: null });

    const res = await request(app.getHttpServer())
      .post('/v1/findings')
      .set('X-API-Key', PLAIN_KEY)
      .send({ title: 'X', description: 'Y', severity: 'low' });

    expect(res.status).toBe(201);
    expect(findingsService.create).toHaveBeenCalledWith(ORG_ID, undefined, expect.objectContaining({ title: 'X' }));
  });
});
