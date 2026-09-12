/** Where the working store and the checked-in data files live, for both reads and writes. */
import "server-only";
import { join, resolve } from "node:path";

export const CHECKOUT = resolve(process.env.LEXDROID_CHECKOUT ?? join(process.cwd(), ".."));
export const BACKEND = join(CHECKOUT, "backend");
export const DB_PATH = process.env.LEXDROID_DB ?? join(BACKEND, "data/lexdroid.db");
export const RUBRIC_PATH = join(BACKEND, "data/rubric.json");
export const PROFILES_DIR = join(BACKEND, "data/profiles");
export const ENGINES_PATH = join(BACKEND, "data/engines.json");
