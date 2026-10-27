#!/usr/bin/env node
/**
 * Runs one turn of an agentic chat loop against the Claude API (billed, not your
 * Claude subscription — this exists specifically as a fallback for when that's
 * exhausted), using the same MCP tools your Claude Desktop/Code sessions use: this
 * project's own pantry MCP server (spawned fresh, same as any other MCP client
 * would) and, if Cronometer credentials are configured, cronometer-api-mcp.
 *
 * Reads {"messages": Anthropic.MessageParam[]} as JSON from a file whose path is
 * passed as argv[2] — the full prior conversation plus the new user message already
 * appended. (Not stdin: PHP's built-in dev server, used for local development, does
 * not reliably close a piped Process::input() stream, which left this script's stdin
 * read hanging indefinitely under `php artisan serve` specifically — a file sidesteps
 * that, and matches the argv-based pattern the other bridge scripts already use.)
 * Loops: send to the Messages API, execute any tool_use blocks via the MCP clients,
 * feed back tool_results, repeat until Claude gives a final non-tool response (or a
 * hard cap of iterations, to bound cost if something goes wrong). Prints the full
 * updated message array as JSON to stdout — the caller just replaces its stored
 * history with this each turn.
 *
 * Env vars: ANTHROPIC_API_KEY (required), ANTHROPIC_MODEL (optional, defaults to
 * claude-haiku-4-5-20251001), PANTRY_API_URL/PANTRY_API_TOKEN (for the pantry MCP server),
 * CRONOMETER_* (optional — cronometer-api-mcp is only connected if username and
 * password are both set), CRONOMETER_UVX_PATH (optional override).
 */
import { fileURLToPath } from "node:url";
import path from "node:path";
import { readFile } from "node:fs/promises";
import Anthropic from "@anthropic-ai/sdk";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const MAX_TOOL_ITERATIONS = 8;
// Generous headroom for a single turn that calls many tools at once (e.g. "add all
// these items to my pantry" against a long list) — too small a budget here doesn't
// just truncate the reply, it truncates *mid tool-call-batch*, silently discarding
// whichever calls never got emitted (see the loop below, which used to gate tool
// execution on stop_reason === "tool_use" and treated a max_tokens cutoff as "done").
const MAX_TOKENS = 4096;

const SYSTEM_PROMPT =
  "You are the assistant embedded in SimpleFood, a personal pantry-tracking app. You have " +
  "tools to manage the user's pantry and, if configured, their Cronometer nutrition diary. " +
  "Follow whatever behavior each tool's own description specifies (for example: automatically " +
  "logging food to Cronometer when the user says they ate something, without asking for " +
  "confirmation first; never inventing a shelf-life estimate for opened food). Keep replies " +
  "concise and conversational — this is a chat, not a report.\n\n" +
  "Only help with things related to the user's pantry, food, nutrition, or their Cronometer " +
  "diary — this app's actual purpose. This billed API call exists specifically as that, not " +
  "as a general-purpose assistant. If asked for anything else (general chit-chat, unrelated " +
  "advice, writing, coding, etc.), decline briefly in one sentence and redirect to what you " +
  "can actually help with here — don't lecture or over-explain.";

type McpToolInfo = { name: string; description?: string; inputSchema: unknown };

const MCP_CONNECT_TIMEOUT_MS = 20_000;

/**
 * Wraps client.connect() with our own timeout, distinct from and shorter than the
 * outer Process::timeout(90) in ChatAgentService — without this, a stuck MCP server
 * (e.g. `uvx cronometer-api-mcp` hanging on a slow login) is indistinguishable from
 * any other kind of stall: the caller just sees a generic "exceeded 90 seconds" with
 * no indication of which connection never came up.
 */
async function connectMcp(label: string, command: string, args: string[]): Promise<Client> {
  const transport = new StdioClientTransport({ command, args, env: process.env as Record<string, string> });
  const client = new Client({ name: "simplefood-chat-agent", version: "1.0.0" });

  const timeout = new Promise<never>((_, reject) => {
    setTimeout(
      () => reject(new Error(`Timed out connecting to ${label} after ${MCP_CONNECT_TIMEOUT_MS / 1000}s.`)),
      MCP_CONNECT_TIMEOUT_MS
    );
  });

  await Promise.race([client.connect(transport), timeout]);
  return client;
}

function toAnthropicTools(tools: McpToolInfo[]): Anthropic.Tool[] {
  return tools.map((t) => ({
    name: t.name,
    description: t.description ?? "",
    input_schema: t.inputSchema as Anthropic.Tool.InputSchema,
  }));
}

/**
 * A tool_use block with no arguments round-trips through PHP as `{"input": {}}` —
 * but Eloquent's array cast can't distinguish an empty JSON object from an empty
 * JSON array, and re-encodes it as `[]`. Anthropic rejects `[]` as a tool_use input
 * (it requires an object), so conversation history loaded back from the database
 * needs this coerced back before being replayed.
 */
function sanitizeStoredMessage(message: Anthropic.MessageParam): Anthropic.MessageParam {
  if (!Array.isArray(message.content)) return message;

  return {
    ...message,
    content: message.content.map((block) =>
      block.type === "tool_use" && Array.isArray(block.input) ? { ...block, input: {} } : block
    ),
  };
}

/**
 * Anthropic requires every tool_use block to be immediately followed by a message
 * carrying a matching tool_result for each one. Normally this file's own loop always
 * writes both halves together — but any interruption between those two writes (a
 * crash, a killed process, a bug since fixed) can leave a trailing tool_use with no
 * result stuck in the saved conversation forever: every future turn replays that same
 * broken history and Anthropic rejects the request outright before ever seeing the
 * new message, permanently bricking the conversation. Surgically drop just the broken
 * assistant message (and its would-be result message, if that's what follows it) and
 * keep everything else — including whatever real conversation came after — so a bad
 * pair heals itself on the very next message instead of requiring a manual "New chat"
 * reset, or losing history that had nothing to do with the break.
 */
function repairToolUseBalance(messages: Anthropic.MessageParam[]): Anthropic.MessageParam[] {
  const repaired: Anthropic.MessageParam[] = [];

  for (let i = 0; i < messages.length; i++) {
    const message = messages[i];
    const content = message.content;

    if (!Array.isArray(content)) {
      repaired.push(message);
      continue;
    }

    const toolUseIds = content.filter((b) => b.type === "tool_use").map((b) => b.id);

    if (toolUseIds.length === 0) {
      repaired.push(message);
      continue;
    }

    const nextContent = messages[i + 1]?.content;
    const resultIds = new Set(
      Array.isArray(nextContent)
        ? nextContent.filter((b) => b.type === "tool_result").map((b) => b.tool_use_id)
        : []
    );

    if (toolUseIds.every((id) => resultIds.has(id))) {
      repaired.push(message);
      continue;
    }

    process.stderr.write(`Warning: dropping unresolved tool_use message at index ${i}.\n`);

    // If what follows is entirely tool_result blocks, it was clearly meant to pair
    // with the message we just dropped — a lone tool_result with no preceding
    // tool_use would itself be rejected by the API, so drop it too and skip past it.
    if (Array.isArray(nextContent) && nextContent.length > 0 && nextContent.every((b) => b.type === "tool_result")) {
      i++;
    }
  }

  return repaired;
}

function toolResultText(result: Awaited<ReturnType<Client["callTool"]>>): string {
  const content = result.content as Array<{ type: string; text?: string }> | undefined;
  return content?.map((c) => (c.type === "text" ? c.text ?? "" : "")).join("\n") ?? "";
}

async function main() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is required.");
  const model = process.env.ANTHROPIC_MODEL || "claude-haiku-4-5-20251001";

  const inputFile = process.argv[2];
  if (!inputFile) throw new Error("Usage: chat-agent-bridge.js <input-json-file>");
  const input = JSON.parse(await readFile(inputFile, "utf8")) as { messages: Anthropic.MessageParam[] };
  const messages: Anthropic.MessageParam[] = repairToolUseBalance(input.messages.map(sanitizeStoredMessage));

  const pantryEntry = path.join(path.dirname(fileURLToPath(import.meta.url)), "index.js");
  const pantryClient = await connectMcp("pantry-mcp", "node", [pantryEntry]);
  const pantryTools = (await pantryClient.listTools()).tools;

  let cronometerClient: Client | null = null;
  let cronometerTools: McpToolInfo[] = [];
  if (process.env.CRONOMETER_USERNAME && process.env.CRONOMETER_PASSWORD) {
    try {
      cronometerClient = await connectMcp("cronometer-api-mcp", process.env.CRONOMETER_UVX_PATH || "uvx", [
        "cronometer-api-mcp",
      ]);
      cronometerTools = (await cronometerClient.listTools()).tools;
    } catch (err) {
      // Cronometer being slow/unreachable shouldn't block pantry-only chat — surface it
      // as a system note instead of failing the whole turn.
      process.stderr.write(
        `Warning: cronometer-api-mcp unavailable, continuing with pantry tools only: ${
          err instanceof Error ? err.message : String(err)
        }\n`
      );
      cronometerClient = null;
      cronometerTools = [];
    }
  }

  const toolOwners = new Map<string, Client>();
  for (const t of pantryTools) toolOwners.set(t.name, pantryClient);
  for (const t of cronometerTools) toolOwners.set(t.name, cronometerClient as Client);

  const tools = toAnthropicTools([...pantryTools, ...cronometerTools]);
  const anthropic = new Anthropic({ apiKey });

  for (let i = 0; i < MAX_TOOL_ITERATIONS; i++) {
    const response = await anthropic.messages.create({
      model,
      max_tokens: MAX_TOKENS,
      system: SYSTEM_PROMPT,
      tools: tools.length > 0 ? tools : undefined,
      messages,
    });

    messages.push({ role: "assistant", content: response.content });

    // Execute whatever complete tool_use blocks are actually present, regardless of
    // *why* the response ended — not just when stop_reason is literally "tool_use".
    // A response can also end on "max_tokens" partway through emitting a batch of
    // tool calls (e.g. a bulk "add all these items" turn), and it would still include
    // whichever tool_use blocks were fully formed before the cutoff. Gating on
    // stop_reason alone silently dropped those: the message announcing them was
    // still saved, but nothing was ever run, and no error was ever raised.
    const toolUseBlocks = response.content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");

    if (toolUseBlocks.length === 0) {
      break;
    }

    const toolResults: Anthropic.ToolResultBlockParam[] = await Promise.all(
      toolUseBlocks.map(async (block): Promise<Anthropic.ToolResultBlockParam> => {
        const client = toolOwners.get(block.name);
        if (!client) {
          return { type: "tool_result", tool_use_id: block.id, content: `Unknown tool: ${block.name}`, is_error: true };
        }
        try {
          const result = await client.callTool({ name: block.name, arguments: block.input as Record<string, unknown> });
          return {
            type: "tool_result",
            tool_use_id: block.id,
            content: toolResultText(result),
            is_error: Boolean(result.isError),
          };
        } catch (err) {
          return {
            type: "tool_result",
            tool_use_id: block.id,
            content: err instanceof Error ? err.message : String(err),
            is_error: true,
          };
        }
      })
    );

    messages.push({ role: "user", content: toolResults });
  }

  await pantryClient.close();
  if (cronometerClient) await cronometerClient.close();

  await writeAndExit(process.stdout, JSON.stringify({ messages }), 0);
}

main().catch(async (err) => {
  await writeAndExit(process.stderr, JSON.stringify({ error: err instanceof Error ? err.message : String(err) }), 1);
});

/**
 * process.exit() right after process.stdout/stderr.write() is a known Node.js trap:
 * when the stream is a pipe (as it is here — PHP reads this via Process::run) and the
 * write is larger than the OS pipe buffer (~64KB on Linux), write() queues the rest
 * asynchronously and exit() does not wait for it to actually drain, silently
 * truncating the output. A big linking request (many parallel Cronometer search
 * results) routinely exceeds that in a single turn, so this must wait for the write's
 * own callback — confirming the OS actually accepted the data — before exiting.
 */
function writeAndExit(stream: NodeJS.WriteStream, data: string, exitCode: number): Promise<void> {
  return new Promise((resolve) => {
    stream.write(data, () => {
      process.exit(exitCode);
      resolve();
    });
  });
}
