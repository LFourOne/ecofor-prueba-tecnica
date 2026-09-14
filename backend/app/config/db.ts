import "dotenv/config";
import pg from "pg";

const { Pool } = pg;

export const pool = new Pool({
  host: process.env.DB_HOST ? String(process.env.DB_HOST) : undefined,
  port: process.env.DB_PORT ? Number(process.env.DB_PORT) : undefined,
  user: process.env.DB_USER ? String(process.env.DB_USER) : undefined,
  password: process.env.DB_PASSWORD
    ? String(process.env.DB_PASSWORD)
    : undefined,
  database: process.env.DATABASE ? String(process.env.DATABASE) : undefined,
});
