import { AgentResponseSchema, type AgentResponse } from '@/lib/market/ai/schemas';
import { extractJsonFromClaude } from '@/lib/market/ai/client';

/** Parse agent JSON; recover description when the model breaks JSON with literal newlines. */
export function parseAgentResponse(text: string): AgentResponse | null {
  const jsonStr = extractJsonFromClaude(text);
  try {
    return AgentResponseSchema.parse(JSON.parse(jsonStr));
  } catch {
    // continue to fallbacks
  }

  try {
    const hasDraft = /"has_draft"\s*:\s*true/i.test(jsonStr);
    if (!hasDraft) return null;

    const descKey = '"description"';
    const keyIdx = jsonStr.indexOf(descKey);
    if (keyIdx < 0) return null;

    const afterKey = jsonStr.slice(keyIdx + descKey.length);
    const colonQuote = afterKey.match(/^\s*:\s*"/);
    if (!colonQuote) return null;

    const start = keyIdx + descKey.length + colonQuote[0].length;
    let i = start;
    let desc = '';
    while (i < jsonStr.length) {
      const ch = jsonStr[i];
      if (ch === '\\' && i + 1 < jsonStr.length) {
        const next = jsonStr[i + 1];
        if (next === 'n') desc += '\n';
        else if (next === '"') desc += '"';
        else if (next === '\\') desc += '\\';
        else desc += next;
        i += 2;
        continue;
      }
      if (ch === '"') break;
      desc += ch;
      i += 1;
    }

    const cleaned = desc.trim();
    if (!cleaned) return null;
    return { has_draft: true, draft: { description: cleaned } };
  } catch {
    return null;
  }
}
