const ANTHROPIC_MODEL =
  process.env.ANTHROPIC_MODEL?.trim() || 'claude-sonnet-4-6';

type ClaudeImageSource =
  | { type: 'url'; url: string }
  | { type: 'base64'; media_type: string; data: string };

export type ClaudeMessageContent =
  | { type: 'text'; text: string }
  | { type: 'image'; source: ClaudeImageSource };

export type ClaudeCallResult = {
  text: string;
  tokensIn?: number;
  tokensOut?: number;
};

export type ClaudeCallOutcome =
  | { ok: true; result: ClaudeCallResult }
  | { ok: false; reason: 'missing_key' | 'api_error' | 'empty_response'; detail?: string };

export async function callClaude(
  system: string,
  userContent: ClaudeMessageContent[],
  maxTokens = 1024
): Promise<ClaudeCallOutcome> {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) {
    return { ok: false, reason: 'missing_key' };
  }

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: ANTHROPIC_MODEL,
      max_tokens: maxTokens,
      system,
      messages: [{ role: 'user', content: userContent }],
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    console.error('Anthropic API error:', res.status, errText);
    return { ok: false, reason: 'api_error', detail: `${res.status}` };
  }

  const data = (await res.json()) as {
    content?: { type: string; text?: string }[];
    usage?: { input_tokens?: number; output_tokens?: number };
  };

  const text = data.content?.find((c) => c.type === 'text')?.text ?? '';
  if (!text.trim()) {
    return { ok: false, reason: 'empty_response' };
  }

  return {
    ok: true,
    result: {
      text,
      tokensIn: data.usage?.input_tokens,
      tokensOut: data.usage?.output_tokens,
    },
  };
}

export function extractJsonFromClaude(text: string): string {
  const trimmed = text.trim();
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) return fence[1].trim();
  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start >= 0 && end > start) return trimmed.slice(start, end + 1);
  return trimmed;
}

export { ANTHROPIC_MODEL };
