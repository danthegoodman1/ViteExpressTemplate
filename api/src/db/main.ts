import pg from "pg"

export const pool = new pg.Pool({
  connectionString: process.env.PG_DSN,
  connectionTimeoutMillis: 5000,
  ssl: {
    rejectUnauthorized: false,
  },
})
