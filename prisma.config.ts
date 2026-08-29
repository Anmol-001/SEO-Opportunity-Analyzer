import "dotenv/config";
import { defineConfig } from "prisma/config";

const placeholderUrl =
  "postgresql://placeholder:placeholder@localhost:5432/searchlight";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: process.env.DATABASE_URL ?? placeholderUrl,
  },
});
