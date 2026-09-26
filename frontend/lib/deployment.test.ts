import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { isReadOnlyDeployment } from "./deployment";

describe("isReadOnlyDeployment", () => {
  it("is enabled automatically on Vercel", () => {
    expect(isReadOnlyDeployment({ VERCEL: "1" })).toBe(true);
  });

  it("can be enabled on another host", () => {
    expect(isReadOnlyDeployment({ LEXDROID_READ_ONLY: "1" })).toBe(true);
  });

  it("keeps a normal local checkout writable", () => {
    expect(isReadOnlyDeployment({})).toBe(false);
  });
});
