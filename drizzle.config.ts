import { defineConfig } from "drizzle-kit";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is required to run drizzle commands");
}

const secureUrl = new URL(connectionString);

secureUrl.searchParams.set(
  "ssl",
  JSON.stringify({ rejectUnauthorized: true }),
);

export default defineConfig({
  schema: "./drizzle/schema.ts",
  out: "./drizzle",
  dialect: "mysql",
  dbCredentials: {
    url: secureUrl.toString(),
  },
});

