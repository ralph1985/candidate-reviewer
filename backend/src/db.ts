import { Pool } from 'pg';

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error('DATABASE_URL es obligatorio');
}

export const pool = new Pool({
  connectionString: databaseUrl
});
