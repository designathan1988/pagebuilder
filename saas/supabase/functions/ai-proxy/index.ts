// The editor's AI assistant, through the platform: the editor speaks the Anthropic Messages API format with
// streaming (src/editor/assistant/provider.ts) and sends the session token in the x-api-key header. Here the
// Anthropic key is the server's, the model comes from an allow list, and each response deducts workspace credits
// by actual usage (usage.input_tokens in message_start, usage.output_tokens in message_delta).
// POST /ai-proxy?workspace=<id>   body: the Messages API JSON (stream: true)
import { adminClient, env } from '../_shared/env.ts';
import { EDITORS, caller, corsHeaders, failure, roleIn } from '../_shared/http.ts';

// the current models (Claude Opus 5.5 is the default); any other request falls back to the default
const MODELS = new Set(['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-5-5']);
const DEFAULT_MODEL = 'claude-opus-5-5';
const MAX_TOKENS = 64000;
// 1 credit = 10 thousand equivalent input tokens; output weighs 5 times input (Anthropic's price is 5x)
const creditsOf = (input: number, output: number) => Math.max(1, Math.ceil((input + 5 * output) / 10000));

// reads the copied SSE and adds up the usage the API reports
async function usageOf(stream: ReadableStream<Uint8Array>): Promise<{ input: number; output: number }> {
  const reader = stream.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = '';
  let input = 0;
  let output = 0;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += value;
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      if (!line.startsWith('data:')) continue;
      try {
        const data = JSON.parse(line.slice(5).trim()) as { type?: string; message?: { usage?: Record<string, number> }; usage?: Record<string, number> };
        if (data.type === 'message_start') {
          const u = data.message?.usage ?? {};
          input = (u.input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0);
        }
        if (data.type === 'message_delta' && data.usage?.output_tokens !== undefined) output = data.usage.output_tokens;
      } catch {
        // a line that is not JSON (ping, comment) does not change the count
        continue;
      }
    }
  }
  return { input, output };
}

export default {
  fetch: async (req: Request): Promise<Response> => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders() });
    if (req.method !== 'POST') return failure('method_not_allowed', 405);
    const who = await caller(req);
    if (!who) return failure('unauthorized', 401);
    const workspaceId = new URL(req.url).searchParams.get('workspace') ?? '';
    const role = await roleIn(who, workspaceId);
    if (!role || !EDITORS.includes(role)) return failure('forbidden', 403);
    const admin = adminClient();
    const { data: plan } = await admin.rpc('workspace_plan', { ws: workspaceId }).single();
    const { data: used } = await admin.rpc('ai_credits_used', { ws: workspaceId });
    if ((used as number ?? 0) >= (plan as { ai_credits_month: number }).ai_credits_month) return failure('ai_credits_exhausted', 402);

    const body = await req.json().catch(() => null) as Record<string, unknown> | null;
    if (!body || !Array.isArray(body.messages)) return failure('bad_request', 400);
    const request = {
      ...body,
      model: MODELS.has(String(body.model)) ? body.model : DEFAULT_MODEL,
      max_tokens: Math.min(Number(body.max_tokens) || 16000, MAX_TOKENS),
      stream: true,
    };
    const upstream = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': env.required('ANTHROPIC_API_KEY'), 'anthropic-version': '2023-06-01' },
      body: JSON.stringify(request),
    });
    const headers = { ...corsHeaders(), 'content-type': upstream.headers.get('content-type') ?? 'text/event-stream', 'cache-control': 'no-store' };
    if (!upstream.ok || !upstream.body) return new Response(upstream.body, { status: upstream.status, headers });
    const [toEditor, toMeter] = upstream.body.tee();
    // the count closes when the stream ends, without holding the response (EdgeRuntime.waitUntil)
    const meter = usageOf(toMeter).then(({ input, output }) => admin.from('ai_usage').insert({
      workspace_id: workspaceId, user_id: who.user.id, input_tokens: input, output_tokens: output, credits: creditsOf(input, output),
    }));
    (globalThis as unknown as { EdgeRuntime?: { waitUntil(p: Promise<unknown>): void } }).EdgeRuntime?.waitUntil(meter);
    return new Response(toEditor, { status: 200, headers });
  },
};
