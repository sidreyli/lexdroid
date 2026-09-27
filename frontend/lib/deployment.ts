import "server-only";

export const READ_ONLY_DEPLOYMENT_MESSAGE =
  "This hosted deployment is a read-only snapshot. Run the pipeline locally to start runs or save reviews.";

/** Vercel cannot persist LexDroid's SQLite store or keep its pipeline worker alive. */
export function isReadOnlyDeployment(
  env: Record<string, string | undefined> = process.env,
): boolean {
  return env.VERCEL === "1" || env.LEXDROID_READ_ONLY === "1";
}
