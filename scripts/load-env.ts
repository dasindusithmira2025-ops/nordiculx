/**
 * Loads `.env` into process.env for standalone scripts.
 *
 * Uses Node's built-in `process.loadEnvFile` (Node 20.6+) rather than adding a
 * dotenv dependency. Missing file is not an error — in Docker and CI the
 * variables are already in the environment.
 */
export function loadEnv(path = '.env') {
  try {
    process.loadEnvFile(path);
  } catch {
    // No .env on disk; rely on the ambient environment.
  }
}

loadEnv();
