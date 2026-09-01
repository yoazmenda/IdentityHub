function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

/** Centralized, typed access to env vars — nothing in the app reads process.env directly outside this file. */
export const env = {
  get jwtSecret(): string {
    return required('JWT_SECRET');
  },
  get encryptionKey(): string {
    return required('ENCRYPTION_KEY');
  },
  get jiraClientId(): string {
    return required('JIRA_CLIENT_ID');
  },
  get jiraClientSecret(): string {
    return required('JIRA_CLIENT_SECRET');
  },
  get jiraRedirectUri(): string {
    return required('JIRA_REDIRECT_URI');
  },
  get port(): number {
    return process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
  },
  get frontendOrigin(): string {
    return process.env.FRONTEND_ORIGIN || 'http://localhost:5173';
  },
  get openaiApiKey(): string | undefined {
    return process.env.OPENAI_API_KEY;
  },
};
