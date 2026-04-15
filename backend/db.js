const { Pool } = require('pg');

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error('DATABASE_URL is required');
}

const sslOverrideRaw = process.env.DATABASE_SSL;
const sslOverride =
  sslOverrideRaw === 'true' ? true : sslOverrideRaw === 'false' ? false : null;
const isLocal = /localhost|127\.0\.0\.1/i.test(connectionString);
const wantsSsl =
  /sslmode=require|ssl=true|ssl=1|sslmode=verify-full|sslmode=verify-ca/i.test(
    connectionString
  );
const useSsl = sslOverride ?? (wantsSsl || (!isLocal && process.env.NODE_ENV === 'production'));

const pool = new Pool({
  connectionString,
  ssl: useSsl ? { rejectUnauthorized: false } : undefined,
});

module.exports = { pool };
