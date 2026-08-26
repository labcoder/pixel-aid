import { describe, expect, test, vi } from "vitest";

import {
  pixelAidSiteToolNames,
  pixelAidSiteTools,
  registerPixelAidSiteTools,
  type ModelContextLike,
  type PixelAidSiteToolName
} from "./siteTools";

describe("PixelAid Site Tools", () => {
  test("defines a focused tool set with closed object schemas", () => {
    expect(pixelAidSiteTools.map((tool) => tool.name)).toEqual(pixelAidSiteToolNames);
    expect(new Set(pixelAidSiteToolNames).size).toBe(pixelAidSiteToolNames.length);

    for (const tool of pixelAidSiteTools) {
      expect(tool.inputSchema).toMatchObject({ type: "object", additionalProperties: false });
      expect(tool.title.length).toBeGreaterThan(0);
      expect(tool.description.length).toBeGreaterThan(20);
    }

    expect(pixelAidSiteTools.find((tool) => tool.name === "get_editor_state")?.annotations).toEqual({ readOnlyHint: true });
    expect(pixelAidSiteTools.filter((tool) => tool.annotations?.readOnlyHint)).toHaveLength(1);
    expect(pixelAidSiteTools.find((tool) => tool.name === "fix_with_settings")?.inputSchema.properties).toMatchObject({
      size: { type: "integer", minimum: 1, maximum: 4096 },
      targetWidth: { type: "integer", minimum: 1, maximum: 4096 },
      targetHeight: { type: "integer", minimum: 1, maximum: 4096 },
      maxColors: { type: "integer", minimum: 2, maximum: 256 },
      gridStrategy: { type: "string", enum: ["classic", "robust"] }
    });
  });

  test("routes registered tool calls to the executor and scopes them to an abort signal", async () => {
    const registered = new Map<PixelAidSiteToolName, Parameters<ModelContextLike["registerTool"]>[0]>();
    const signals: AbortSignal[] = [];
    const registerTool: ModelContextLike["registerTool"] = vi.fn((tool, options) => {
      registered.set(tool.name, tool);
      if (options?.signal) {
        signals.push(options.signal);
      }
    });
    const execute = vi.fn(async (toolName: PixelAidSiteToolName, input: Record<string, unknown>) => ({
      ok: true,
      tool: toolName,
      input
    }));

    const registration = registerPixelAidSiteTools({ document: { modelContext: { registerTool } }, execute });
    await registration.ready;

    expect(registration.supported).toBe(true);
    expect(registerTool).toHaveBeenCalledTimes(pixelAidSiteTools.length);
    expect(signals).toHaveLength(pixelAidSiteTools.length);
    expect(signals.every((signal) => !signal.aborted)).toBe(true);

    const result = await registered.get("set_view_mode")?.execute({ mode: "compare", compareLayout: "slider" });
    expect(result).toEqual({
      ok: true,
      tool: "set_view_mode",
      input: { mode: "compare", compareLayout: "slider" }
    });

    registration.dispose();
    expect(signals.every((signal) => signal.aborted)).toBe(true);
  });

  test("is a no-op when Site Tools are unsupported", async () => {
    const execute = vi.fn();
    const registration = registerPixelAidSiteTools({ document: {}, execute });

    await registration.ready;
    registration.dispose();

    expect(registration.supported).toBe(false);
    expect(execute).not.toHaveBeenCalled();
  });

  test("normalizes invalid execute input to an empty object", async () => {
    let registeredTool: Parameters<ModelContextLike["registerTool"]>[0] | undefined;
    const execute = vi.fn(async () => ({ ok: true }));
    const registration = registerPixelAidSiteTools({
      document: {
        modelContext: {
          registerTool: (tool) => {
            if (tool.name === "get_editor_state") {
              registeredTool = tool;
            }
          }
        }
      },
      execute
    });
    await registration.ready;

    await registeredTool?.execute(null as unknown as Record<string, unknown>);
    expect(execute).toHaveBeenCalledWith("get_editor_state", {});
  });
});
