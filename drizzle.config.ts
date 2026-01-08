import process from 'node:process';
import { drizzleD1Config } from '@deox/drizzle-d1-utils';

export default drizzleD1Config(
  {
    out: './drizzle/migrations',
    schema: './src/db/schema.ts',
  },
  {
    accountId: process.env.CLOUDFLARE_D1_ACCOUNT_ID,
    apiToken: process.env.CLOUDFLARE_D1_API_TOKEN,
    databaseId: 'dba8eb40-30ee-4d71-982a-64ece6dca15b',
    binding: 'DB',
    remote: process.env.REMOTE === 'true' || process.env.REMOTE === '1',
  }
);
