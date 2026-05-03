import { PassThrough } from "node:stream";
import { describe, expect, it } from "vitest";
import { runPixelAidMcpStdioServer } from "./server";

describe("PixelAid MCP stdio server", () => {
  it("serves initialize and tools/list over content-length framing", async () => {
    const input = new PassThrough();
    const output = new PassThrough();
    const chunks: Buffer[] = [];
    output.on("data", (chunk: Buffer) => chunks.push(chunk));

    const running = runPixelAidMcpStdioServer(input, output);
    const initialize = frameMessage({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2024-11-05" } });
    const toolsList = frameMessage({ jsonrpc: "2.0", id: 2, method: "tools/list" });
    input.write(initialize.slice(0, 12));
    input.write(initialize.slice(12));
    input.write(toolsList);
    input.end();
    await running;

    const responses = parseFrames(Buffer.concat(chunks));
    expect(responses).toHaveLength(2);
    expect(responses[0]).toMatchObject({
      jsonrpc: "2.0",
      id: 1,
      result: { capabilities: { tools: {} } },
    });
    expect(responses[1]).toMatchObject({
      jsonrpc: "2.0",
      id: 2,
      result: { tools: expect.arrayContaining([expect.objectContaining({ name: "inspect_image" })]) },
    });
  });

  it("returns sanitized parse errors for malformed newline-delimited requests", async () => {
    const input = new PassThrough();
    const output = new PassThrough();
    const chunks: Buffer[] = [];
    output.on("data", (chunk: Buffer) => chunks.push(chunk));

    const running = runPixelAidMcpStdioServer(input, output);
    input.end("{not-json}\n");
    await running;

    expect(parseFrames(Buffer.concat(chunks))[0]).toMatchObject({
      jsonrpc: "2.0",
      id: null,
      error: {
        code: -32700,
        message: "Parse error",
        data: { error: { code: "parse_error" } },
      },
    });
  });
});

function frameMessage(message: unknown): string {
  const body = JSON.stringify(message);
  return `Content-Length: ${Buffer.byteLength(body, "utf8")}\r\n\r\n${body}`;
}

function parseFrames(buffer: Buffer): unknown[] {
  const responses: unknown[] = [];
  let remaining = buffer;

  while (remaining.length > 0) {
    const headerEnd = remaining.indexOf("\r\n\r\n");
    if (headerEnd === -1) {
      throw new Error(`Missing MCP frame header in ${remaining.toString("utf8")}`);
    }
    const header = remaining.subarray(0, headerEnd).toString("ascii");
    const length = Number(/^Content-Length:\s*(\d+)$/im.exec(header)?.[1]);
    if (!Number.isSafeInteger(length)) {
      throw new Error(`Missing content length in ${header}`);
    }
    const bodyStart = headerEnd + 4;
    const bodyEnd = bodyStart + length;
    responses.push(JSON.parse(remaining.subarray(bodyStart, bodyEnd).toString("utf8")) as unknown);
    remaining = remaining.subarray(bodyEnd);
  }

  return responses;
}
