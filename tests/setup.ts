// Loads the local .env so integration tests reach the same database the dev
// server uses. Absent in CI, where variables come from the environment.
try {
  process.loadEnvFile('.env');
} catch {
  // No .env on disk; rely on the ambient environment.
}

// NODE_ENV is typed read-only, so it is assigned through the index signature.
const mutableEnv = process.env as Record<string, string | undefined>;
mutableEnv.NODE_ENV ??= 'test';
mutableEnv.SESSION_SECRET ??= 'test_session_secret_at_least_32_characters_long';
mutableEnv.DATABASE_URL ??=
  'postgres://nordiclux:nordiclux_dev_password@localhost:5432/nordiclux';
// Integration tests must not write analytics rows as a side effect.
mutableEnv.ANALYTICS_ENABLED = 'false';
