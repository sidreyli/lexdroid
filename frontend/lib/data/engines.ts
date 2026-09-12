/** The declared engines, as the interface offers them. Reads the same file a run reads. */
import "server-only";
import { existsSync, readFileSync } from "node:fs";
import { ENGINES_PATH } from "./paths";

export interface EngineChoice {
  id: string;
  label: string;
  model: string;
  declared: boolean;
}

export function getEngines(): { chosen: string; engines: EngineChoice[] } {
  if (!existsSync(ENGINES_PATH)) return { chosen: "", engines: [] };
  const raw = JSON.parse(readFileSync(ENGINES_PATH, "utf8")) as {
    default: string;
    engines: EngineChoice[];
  };
  return {
    chosen: raw.default,
    engines: raw.engines.map((e) => ({
      id: e.id,
      label: e.label,
      model: e.model,
      declared: e.declared,
    })),
  };
}
