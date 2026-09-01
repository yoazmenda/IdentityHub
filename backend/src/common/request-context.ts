/**
 * The shape both auth guards produce. Services only ever see this — they don't know
 * (and don't care) whether the caller authenticated via JWT session or API key.
 */
export interface RequestContext {
  organizationId: string;
  /** Set for JWT (web) auth; undefined for API-key (external) auth. */
  userId?: string;
}
