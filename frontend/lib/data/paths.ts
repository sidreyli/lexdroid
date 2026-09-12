/** Where the working store and the checked-in data files live, for both reads and writes. */
import "server-only";
import { join, resolve } from "node:path";

// The store sits beside this app, not inside it. Traced, that path would pull the whole
// checkout into the build output, so the bundler is told to leave it alone.
export const CHECKOUT = resolve(/* turbopackIgnore: true */ process.env.LEXDROID_CHECKOUT ?? join(process.cwd(), ".."));
export const BACKEND = join(CHECKOUT, "backend");
export const DB_PATH = process.env.LEXDROID_DB ?? join(BACKEND, "data/lexdroid.db");
export const RUBRIC_PATH = join(BACKEND, "data/rubric.json");
export const PROFILES_DIR = join(BACKEND, "data/profiles");
export const ENGINES_PATH = join(BACKEND, "data/engines.json");
