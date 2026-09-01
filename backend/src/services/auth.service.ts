import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import * as jwt from 'jsonwebtoken';
import { UsersDao } from '../dao/users.dao';
import { OrganizationsDao } from '../dao/organizations.dao';
import { SessionsDao } from '../dao/sessions.dao';
import { env } from '../config/env';

const BCRYPT_ROUNDS = 12;
const ACCESS_TOKEN_TTL_SECONDS = 15 * 60; // 15 min

export interface AuthResult {
  token: string;
  user: { id: string; name: string; email: string };
}

@Injectable()
export class AuthService {
  constructor(
    private readonly usersDao: UsersDao,
    private readonly organizationsDao: OrganizationsDao,
    private readonly sessionsDao: SessionsDao,
  ) {}

  /** No invite flow (POC): registering always creates a brand-new org with the caller as its first user. */
  async register(params: { email: string; password: string; name: string }): Promise<AuthResult> {
    const existing = await this.usersDao.findByEmail(params.email);
    if (existing) {
      throw new ConflictException('An account with this email already exists');
    }

    const organization = await this.organizationsDao.create(`${params.name}'s Organization`);
    const passwordHash = await bcrypt.hash(params.password, BCRYPT_ROUNDS);
    const user = await this.usersDao.create({
      organizationId: organization.id,
      email: params.email,
      passwordHash,
      name: params.name,
    });

    return this.issueSession(user.id, organization.id, user.name, user.email);
  }

  async login(email: string, password: string): Promise<AuthResult> {
    const user = await this.usersDao.findByEmail(email);
    if (!user) {
      throw new UnauthorizedException('Invalid email or password');
    }
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      throw new UnauthorizedException('Invalid email or password');
    }
    return this.issueSession(user.id, user.organization_id, user.name, user.email);
  }

  /** Deletes the server-side session row, immediately invalidating the JWT. */
  async logout(sessionId: string, organizationId: string): Promise<void> {
    await this.sessionsDao.delete(sessionId, organizationId);
  }

  private async issueSession(
    userId: string,
    organizationId: string,
    name: string,
    email: string,
  ): Promise<AuthResult> {
    const expiresAt = new Date(Date.now() + ACCESS_TOKEN_TTL_SECONDS * 1000);
    const session = await this.sessionsDao.create({ userId, organizationId, expiresAt });

    const token = jwt.sign({ sub: userId, org: organizationId }, env.jwtSecret, {
      expiresIn: ACCESS_TOKEN_TTL_SECONDS,
      jwtid: session.id,
    });

    return { token, user: { id: userId, name, email } };
  }
}
