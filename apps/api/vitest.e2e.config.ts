import { defineConfig } from "vitest/config";
import swc from "unplugin-swc";

export default defineConfig({
  // SWC transform so Nest decorators emit design metadata for DI in tests
  plugins: [swc.vite({ module: { type: "es6" } })],
  test: {
    include: ["test/**/*.e2e-spec.ts"],
    testTimeout: 30_000,
    hookTimeout: 60_000,
    env: {
      NODE_ENV: "test",
      DATABASE_URL:
        process.env.DATABASE_URL ?? "postgresql://scm:scm@localhost:5432/scm_test",
      REDIS_URL: process.env.REDIS_URL ?? "redis://localhost:6379",
      JWT_SECRET: "test-secret-test-secret-test-secret-42",
      TOKEN_ENCRYPTION_KEY:
        "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
      S3_ENDPOINT: "http://localhost:9000",
      S3_BUCKET: "scm-media",
      S3_ACCESS_KEY: "x",
      S3_SECRET_KEY: "x",
    },
  },
});
