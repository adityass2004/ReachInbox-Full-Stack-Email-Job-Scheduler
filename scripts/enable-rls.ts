import { prisma } from '../packages/shared/src/db/index.js';

async function main() {
  const tables = [
    'users',
    'senders',
    'campaigns',
    'email_jobs',
    'slack_connections',
    'slack_oauth_states',
    'google_oauth_states',
  ];

  for (const table of tables) {
    try {
      await prisma.$executeRawUnsafe(`ALTER TABLE "${table}" ENABLE ROW LEVEL SECURITY;`);
      console.log(`[RLS] Successfully enabled Row Level Security on "${table}"`);
    } catch (e: any) {
      console.error(`[RLS] Error on "${table}":`, e.message);
    }
  }

  // Verify
  const result: any[] = await prisma.$queryRawUnsafe(`
    SELECT tablename, rowsecurity 
    FROM pg_tables 
    WHERE schemaname = 'public';
  `);
  console.log('[RLS] Current table status:');
  for (const row of result) {
    console.log(`  - ${row.tablename}: rowsecurity = ${row.rowsecurity}`);
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
