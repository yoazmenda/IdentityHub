import * as bcrypt from 'bcrypt';
import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';
import { UsersDao } from '../dao/users.dao';
import { OrganizationsDao } from '../dao/organizations.dao';
import { SessionsDao } from '../dao/sessions.dao';

jest.mock('../config/env', () => ({ env: { jwtSecret: 'test-secret-value-not-real' } }));

describe('AuthService', () => {
  let usersDao: jest.Mocked<UsersDao>;
  let organizationsDao: jest.Mocked<OrganizationsDao>;
  let sessionsDao: jest.Mocked<SessionsDao>;
  let service: AuthService;

  beforeEach(() => {
    usersDao = { findByEmail: jest.fn(), findById: jest.fn(), create: jest.fn() } as never;
    organizationsDao = { create: jest.fn(), findById: jest.fn() } as never;
    sessionsDao = { create: jest.fn(), findActiveById: jest.fn(), delete: jest.fn(), deleteExpired: jest.fn() } as never;
    service = new AuthService(usersDao, organizationsDao, sessionsDao);
  });

  describe('register', () => {
    it('creates a new organization and user, and returns a session token', async () => {
      usersDao.findByEmail.mockResolvedValue(null);
      organizationsDao.create.mockResolvedValue({ id: 'org-1', name: "Ada's Organization", created_at: new Date() });
      usersDao.create.mockResolvedValue({
        id: 'user-1',
        organization_id: 'org-1',
        email: 'ada@example.com',
        password_hash: 'hashed',
        name: 'Ada',
        created_at: new Date(),
      });
      sessionsDao.create.mockResolvedValue({
        id: 'session-1',
        user_id: 'user-1',
        organization_id: 'org-1',
        expires_at: new Date(Date.now() + 1000),
        created_at: new Date(),
      });

      const result = await service.register({ email: 'ada@example.com', password: 'password123', name: 'Ada' });

      expect(organizationsDao.create).toHaveBeenCalledWith("Ada's Organization");
      expect(result.user).toEqual({ id: 'user-1', name: 'Ada', email: 'ada@example.com' });
      expect(typeof result.token).toBe('string');
    });

    it('rejects registering an email that already exists', async () => {
      usersDao.findByEmail.mockResolvedValue({
        id: 'existing',
        organization_id: 'org-1',
        email: 'ada@example.com',
        password_hash: 'x',
        name: 'Ada',
        created_at: new Date(),
      });

      await expect(
        service.register({ email: 'ada@example.com', password: 'password123', name: 'Ada' }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(organizationsDao.create).not.toHaveBeenCalled();
    });
  });

  describe('login', () => {
    it('rejects an unknown email without revealing whether the account exists', async () => {
      usersDao.findByEmail.mockResolvedValue(null);
      await expect(service.login('nobody@example.com', 'whatever')).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('rejects a wrong password', async () => {
      const hash = await bcrypt.hash('correct-password', 4);
      usersDao.findByEmail.mockResolvedValue({
        id: 'user-1',
        organization_id: 'org-1',
        email: 'ada@example.com',
        password_hash: hash,
        name: 'Ada',
        created_at: new Date(),
      });

      await expect(service.login('ada@example.com', 'wrong-password')).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('issues a session on correct credentials', async () => {
      const hash = await bcrypt.hash('correct-password', 4);
      usersDao.findByEmail.mockResolvedValue({
        id: 'user-1',
        organization_id: 'org-1',
        email: 'ada@example.com',
        password_hash: hash,
        name: 'Ada',
        created_at: new Date(),
      });
      sessionsDao.create.mockResolvedValue({
        id: 'session-1',
        user_id: 'user-1',
        organization_id: 'org-1',
        expires_at: new Date(Date.now() + 1000),
        created_at: new Date(),
      });

      const result = await service.login('ada@example.com', 'correct-password');
      expect(result.user.id).toBe('user-1');
    });
  });

  describe('logout', () => {
    it('deletes the session row, revoking that JWT immediately', async () => {
      await service.logout('session-1', 'org-1');
      expect(sessionsDao.delete).toHaveBeenCalledWith('session-1', 'org-1');
    });
  });
});
