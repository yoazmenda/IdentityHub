import { ConflictException, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import axios from 'axios';
import { randomBytes } from 'crypto';
import { JiraConnectionsDao, JiraConnectionRow } from '../dao/jira-connections.dao';
import { encrypt, decrypt } from '../common/crypto.util';
import { env } from '../config/env';

const AUTHORIZE_URL = 'https://auth.atlassian.com/authorize';
const TOKEN_URL = 'https://auth.atlassian.com/oauth/token';
const ACCESSIBLE_RESOURCES_URL = 'https://api.atlassian.com/oauth/token/accessible-resources';
const SCOPES = 'read:jira-work write:jira-work read:jira-user offline_access';

// Refresh proactively once less than this much of the token's life remains.
const REFRESH_MARGIN_MS = 5 * 60 * 1000;

interface TokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
}

interface AccessibleResource {
  id: string; // cloudId
  url: string;
  name: string;
}

export interface JiraProject {
  id: string;
  key: string;
  name: string;
}

export interface JiraIssueType {
  id: string;
  name: string;
}

export interface CreatedJiraIssue {
  key: string;
  url: string;
}

@Injectable()
export class JiraService {
  constructor(private readonly jiraConnectionsDao: JiraConnectionsDao) {}

  /** `state` is verified in the callback to prevent CSRF. */
  buildAuthorizeUrl(state: string): string {
    const params = new URLSearchParams({
      audience: 'api.atlassian.com',
      client_id: env.jiraClientId,
      scope: SCOPES,
      redirect_uri: env.jiraRedirectUri,
      state,
      response_type: 'code',
      prompt: 'consent',
    });
    return `${AUTHORIZE_URL}?${params.toString()}`;
  }

  generateState(): string {
    return randomBytes(24).toString('hex');
  }

  /** Steps 2-4: exchange the code, discover the site, store encrypted tokens. */
  async connect(params: { organizationId: string; userId: string; code: string }): Promise<void> {
    const tokens = await this.exchangeCode(params.code);
    const resource = await this.getFirstAccessibleResource(tokens.access_token);

    await this.jiraConnectionsDao.upsert({
      organizationId: params.organizationId,
      siteUrl: resource.url,
      cloudId: resource.id,
      accessToken: encrypt(tokens.access_token),
      refreshToken: encrypt(tokens.refresh_token),
      tokenExpiresAt: new Date(Date.now() + tokens.expires_in * 1000),
      connectedByUserId: params.userId,
    });
  }

  async getStatus(organizationId: string): Promise<JiraConnectionRow | null> {
    return this.jiraConnectionsDao.findForOrg(organizationId);
  }

  async disconnect(organizationId: string): Promise<void> {
    await this.jiraConnectionsDao.revoke(organizationId, encrypt(''));
  }

  async listProjects(organizationId: string): Promise<JiraProject[]> {
    const { accessToken, cloudId } = await this.getValidAccessToken(organizationId);
    const { data } = await this.callJira(organizationId, () =>
      axios.get(`https://api.atlassian.com/ex/jira/${cloudId}/rest/api/3/project/search`, {
        headers: this.authHeaders(accessToken),
      }),
    );
    return (data.values as Array<{ id: string; key: string; name: string }>).map((p) => ({
      id: p.id,
      key: p.key,
      name: p.name,
    }));
  }

  async listIssueTypes(organizationId: string, projectKey: string): Promise<JiraIssueType[]> {
    const { accessToken, cloudId } = await this.getValidAccessToken(organizationId);
    const { data } = await this.callJira(organizationId, () =>
      axios.get(`https://api.atlassian.com/ex/jira/${cloudId}/rest/api/3/project/${encodeURIComponent(projectKey)}`, {
        headers: this.authHeaders(accessToken),
      }),
    );
    return (data.issueTypes as Array<{ id: string; name: string; subtask: boolean }>)
      .filter((t) => !t.subtask)
      .map((t) => ({ id: t.id, name: t.name }));
  }

  /** README -> Jira Ticket Creation: only project, issue type, summary, description are ever sent. */
  async createIssue(
    organizationId: string,
    params: { projectKey: string; issueTypeId: string; summary: string; description: string },
  ): Promise<CreatedJiraIssue> {
    const { accessToken, cloudId, siteUrl } = await this.getValidAccessToken(organizationId);
    const { data } = await this.callJira(organizationId, () =>
      axios.post(
        `https://api.atlassian.com/ex/jira/${cloudId}/rest/api/3/issue`,
        {
          fields: {
            project: { key: params.projectKey },
            issuetype: { id: params.issueTypeId },
            summary: params.summary,
            description: toAdf(params.description),
          },
        },
        { headers: this.authHeaders(accessToken) },
      ),
    );
    return { key: data.key, url: `${siteUrl}/browse/${data.key}` };
  }

  // --- internals ---

  private authHeaders(accessToken: string) {
    return { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' };
  }

  private async exchangeCode(code: string): Promise<TokenResponse> {
    const { data } = await axios.post<TokenResponse>(TOKEN_URL, {
      grant_type: 'authorization_code',
      client_id: env.jiraClientId,
      client_secret: env.jiraClientSecret,
      code,
      redirect_uri: env.jiraRedirectUri,
    });
    return data;
  }

  private async refreshTokens(refreshToken: string): Promise<TokenResponse> {
    const { data } = await axios.post<TokenResponse>(TOKEN_URL, {
      grant_type: 'refresh_token',
      client_id: env.jiraClientId,
      client_secret: env.jiraClientSecret,
      refresh_token: refreshToken,
    });
    return data;
  }

  private async getFirstAccessibleResource(accessToken: string): Promise<AccessibleResource> {
    const { data } = await axios.get<AccessibleResource[]>(ACCESSIBLE_RESOURCES_URL, {
      headers: this.authHeaders(accessToken),
    });
    if (data.length === 0) {
      throw new ConflictException(
        'This Atlassian account has no accessible Jira sites. Create a Jira site and try again.',
      );
    }
    return data[0];
  }

  /** Refreshes the token if it's near expiry. On refresh failure, marks the connection `expired` (409) instead of surfacing a raw Jira error. */
  private async getValidAccessToken(
    organizationId: string,
  ): Promise<{ accessToken: string; cloudId: string; siteUrl: string }> {
    const connection = await this.jiraConnectionsDao.findForOrg(organizationId);
    if (!connection || connection.status === 'revoked') {
      throw new NotFoundException('Jira is not connected for this organization');
    }
    if (connection.status === 'expired') {
      throw new ConflictException('Jira connection has expired. Please reconnect in Settings.');
    }

    const expiresInMs = connection.token_expires_at.getTime() - Date.now();
    if (expiresInMs > REFRESH_MARGIN_MS) {
      return {
        accessToken: decrypt(connection.access_token),
        cloudId: connection.cloud_id,
        siteUrl: connection.site_url,
      };
    }

    try {
      const tokens = await this.refreshTokens(decrypt(connection.refresh_token));
      await this.jiraConnectionsDao.updateTokens(organizationId, {
        accessToken: encrypt(tokens.access_token),
        refreshToken: encrypt(tokens.refresh_token),
        tokenExpiresAt: new Date(Date.now() + tokens.expires_in * 1000),
      });
      return { accessToken: tokens.access_token, cloudId: connection.cloud_id, siteUrl: connection.site_url };
    } catch {
      await this.jiraConnectionsDao.markExpired(organizationId);
      throw new ConflictException('Jira connection has expired. Please reconnect in Settings.');
    }
  }

  /**
   * Wraps a real Jira API call. Our stored token can look unexpired yet still be rejected by
   * Jira (access revoked on the Atlassian side, workspace deleted, etc.) — a 401/403 here means
   * the connection is actually dead, so record that instead of leaking a raw axios error.
   * Anything else (Jira down, network blip) is transient: surface it as 503, don't touch status.
   */
  private async callJira<T>(organizationId: string, fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (err) {
      const status = axios.isAxiosError(err) ? err.response?.status : undefined;
      if (status === 401 || status === 403) {
        await this.jiraConnectionsDao.markExpired(organizationId);
        throw new ConflictException('Jira connection has expired. Please reconnect in Settings.');
      }
      throw new ServiceUnavailableException("Couldn't reach Jira. Please try again in a moment.");
    }
  }
}

/** Jira's create-issue API requires the description as Atlassian Document Format, not plain text. */
function toAdf(text: string): object {
  return {
    type: 'doc',
    version: 1,
    content: [
      {
        type: 'paragraph',
        content: text ? [{ type: 'text', text }] : [],
      },
    ],
  };
}
