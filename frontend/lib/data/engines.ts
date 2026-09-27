/** The declared engines, as the interface offers them. Reads the same file a run reads. */
import "server-only";
import { existsSync, readFileSync } from "node:fs";
import { ENGINES_PATH } from "./paths";
import enginesJson from "./fixtures/engines.json";

export interface EngineChoice {
  id: string;
  label: string;
  model: string;
  declared: boolean;
}

export function getEngines(): { chosen: string; engines: EngineChoice[] } {
  const raw = (existsSync(ENGINES_PATH)
    ? JSON.parse(readFileSync(ENGINES_PATH, "utf8"))
    : enginesJson) as {
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
