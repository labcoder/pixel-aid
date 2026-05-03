#!/usr/bin/env node
import { stdin, stdout } from "node:process";
import type { Readable, Writable } from "node:stream";
import {
  createJsonRpcErrorResponse,
  handlePixelAidMcpRequest,
  type PixelAidMcpJsonRpcResponse,
} from "./index";

type MessageFrame = {
  body: string;
  remaining: Buffer;
};

export async function runPixelAidMcpStdioServer(
  input: Readable = stdin,
  output: Writable = stdout,
): Promise<void> {
  let buffer: Buffer = Buffer.alloc(0);

  for await (const chunk of input) {
    buffer = Buffer.concat([buffer, toBuffer(chunk)]);
    buffer = await drainMessages(buffer, output);
  }

  const trailingMessage = buffer.toString("utf8").trim();
  if (trailingMessage.length > 0) {
    const response = await handleRawMessage(trailingMessage);
    if (response) {
      writeMcpMessage(output, response);
    }
  }
}

async function drainMessages(buffer: Buffer, output: Writable): Promise<Buffer> {
  let remaining = buffer;
  while (remaining.length > 0) {
    const frame = readNextMessage(remaining);
    if (!frame) {
      return remaining;
    }

    remaining = frame.remaining;
    const response = await handleRawMessage(frame.body);
    if (response) {
      writeMcpMessage(output, response);
    }
  }

  return remaining;
}

async function handleRawMessage(rawMessage: string): Promise<PixelAidMcpJsonRpcResponse | undefined> {
  const trimmed = rawMessage.trim();
  if (trimmed.length === 0) {
    return undefined;
  }

  let request: unknown;
  try {
    request = JSON.parse(trimmed);
  } catch (error) {
    return createJsonRpcErrorResponse(
      null,
      -32700,
      "Parse error",
      "parse_error",
      error instanceof Error ? error.message : "Could not parse JSON-RPC message.",
    );
  }

  return handlePixelAidMcpRequest(request);
}

function readNextMessage(buffer: Buffer): MessageFrame | undefined {
  const contentLengthFrame = readContentLengthMessage(buffer);
  if (contentLengthFrame === "waiting") {
    return undefined;
  }
  if (contentLengthFrame) {
    return contentLengthFrame;
  }

  if (startsWithContentLengthHeader(buffer)) {
    return undefined;
  }

  const newlineIndex = buffer.indexOf("\n");
  if (newlineIndex === -1) {
    return undefined;
  }

  return {
    body: buffer.subarray(0, newlineIndex).toString("utf8"),
    remaining: buffer.subarray(newlineIndex + 1),
  };
}

function readContentLengthMessage(buffer: Buffer): MessageFrame | "waiting" | undefined {
  const headerEnd = findHeaderEnd(buffer);
  if (!headerEnd) {
    return undefined;
  }

  const header = buffer.subarray(0, headerEnd.index).toString("ascii");
  const contentLength = parseContentLength(header);
  if (contentLength === undefined) {
    return undefined;
  }

  const bodyStart = headerEnd.index + headerEnd.length;
  const bodyEnd = bodyStart + contentLength;
  if (buffer.length < bodyEnd) {
    return "waiting";
  }

  return {
    body: buffer.subarray(bodyStart, bodyEnd).toString("utf8"),
    remaining: buffer.subarray(bodyEnd),
  };
}

function findHeaderEnd(buffer: Buffer): { index: number; length: number } | undefined {
  const crlfIndex = buffer.indexOf("\r\n\r\n");
  const lfIndex = buffer.indexOf("\n\n");
  if (crlfIndex === -1 && lfIndex === -1) {
    return undefined;
  }
  if (crlfIndex !== -1 && (lfIndex === -1 || crlfIndex < lfIndex)) {
    return { index: crlfIndex, length: 4 };
  }
  return { index: lfIndex, length: 2 };
}

function parseContentLength(header: string): number | undefined {
  const match = /^content-length:\s*(\d+)$/im.exec(header);
  if (!match?.[1]) {
    return undefined;
  }

  const length = Number(match[1]);
  return Number.isSafeInteger(length) && length >= 0 ? length : undefined;
}

function startsWithContentLengthHeader(buffer: Buffer): boolean {
  const prefix = buffer.subarray(0, Math.min(buffer.length, "content-length:".length)).toString("ascii").toLowerCase();
  return "content-length:".startsWith(prefix) || prefix.startsWith("content-length:");
}

function writeMcpMessage(output: Writable, response: PixelAidMcpJsonRpcResponse): void {
  const payload = JSON.stringify(response);
  output.write(`Content-Length: ${Buffer.byteLength(payload, "utf8")}\r\n\r\n${payload}`);
}

function toBuffer(chunk: unknown): Buffer {
  return Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk), "utf8");
}

