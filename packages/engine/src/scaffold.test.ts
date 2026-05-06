import { describe, expect, it } from "vitest";

import { enginePackageName } from "./index";

describe("@pixelaid/engine package scaffold", () => {
  it("exports an engine package marker", () => {
    expect(enginePackageName).toBe("@pixelaid/engine");
  });
});
