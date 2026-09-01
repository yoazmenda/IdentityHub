import 'dotenv/config';
import * as bcrypt from 'bcrypt';
import { Pool } from 'pg';
import organizations from './organizations.json';
import users from './users.json';
import findings from './findings.json';

/** Idempotent: re-running `make seed` upserts by fixed id rather than duplicating rows. */
async function seed(): Promise<void> {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  for (const org of organizations) {
    await pool.query(
      `INSERT INTO organizations (id, name) VALUES ($1, $2)
       ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name`,
      [org.id, org.name],
    );
  }
  console.log(`Seeded ${organizations.length} organizations`);

  for (const user of users) {
    const passwordHash = await bcrypt.hash(user.password, 12);
    await pool.query(
      `INSERT INTO users (id, organization_id, email, password_hash, name) VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (id) DO UPDATE SET password_hash = EXCLUDED.password_hash, name = EXCLUDED.name`,
      [user.id, user.organization_id, user.email, passwordHash, user.name],
    );
  }
  console.log(`Seeded ${users.length} users (password: password123 for all)`);

  for (const finding of findings) {
    await pool.query(
      `INSERT INTO findings (id, organization_id, title, description, severity, status)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (id) DO UPDATE SET
         title = EXCLUDED.title, description = EXCLUDED.description,
         severity = EXCLUDED.severity, status = EXCLUDED.status`,
      [finding.id, finding.organization_id, finding.title, finding.description, finding.severity, finding.status],
    );
  }
  console.log(`Seeded ${findings.length} findings`);

  await pool.end();
  console.log('Seed complete.');
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
