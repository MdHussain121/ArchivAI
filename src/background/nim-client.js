import { retryWithBackoff } from '../core/utils/retry.js';

const FETCH_TIMEOUT_MS = 60000;

export class NimClient {
  constructor() {
    this.baseUrl = 'https://integrate.api.nvidia.com/v1';
    this.model = 'nvidia/nemotron-3-super-120b-a12b';
  }

  async getApiKey() {
    const result = await chrome.storage.local.get('nimApiKey');
    if (!result.nimApiKey) throw new Error('Nvidia NIM API key not configured');
    return result.nimApiKey;
  }

  async analyze(text, title) {
    const apiKey = await this.getApiKey();
    const prompt = this.buildTaggingPrompt(text, title);

    const { summaryLength } = await chrome.storage.local.get('summaryLength');
    const summaryGuide = {
      short: '1-2 sentences',
      medium: 'a paragraph (3-5 sentences)',
      long: 'a detailed multi-paragraph summary',
    }[summaryLength || 'short'];

    const instruction = `You are a precise content analysis engine. Return ONLY valid JSON.

Analyze the webpage content and return this exact JSON structure:
{
  "tags": ["tag1", "tag2", ...],
  "summary": "${summaryGuide}",
  "category": "Technology|Design|Science|Business|Health|Education|Entertainment|News|Other",
  "readingTime": <number>
}

Rules:
- tags: 5-10 specific, relevant tags (NOT generic like "article" or "web")
- summary: concise key points
- category: choose ONE from the list above
- readingTime: integer, estimated minutes
- Return ONLY the JSON object. No markdown, no code fences, no other text.
- If content is empty or unreadable: {"tags":[],"summary":"","category":"Other","readingTime":0}`;

    const response = await retryWithBackoff(async () => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
      try {
        return await fetch(`${this.baseUrl}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model: this.model,
            messages: [
              { role: 'user', content: `${instruction}\n\nTitle: ${title || ''}\n\nContent:\n${(text || '').slice(0, 8000)}` },
            ],
            temperature: 0.01,
            max_tokens: summaryLength === 'long' ? 4096 : 2048,
          }),
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timeout);
      }
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`NIM API error ${response.status}: ${err}`);
    }

    const data = await response.json();
    return this.parseResponse(data);
  }

  buildTaggingPrompt(text, title) {
    return '';
  }

  parseResponse(data) {
    const raw = data?.choices?.[0]?.message?.content;

    if (!raw) {
      const snippet = JSON.stringify(data).slice(0, 1000);
      throw new Error(`AI returned empty response. Raw API response: ${snippet}`);
    }

    let cleaned = raw.trim();
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      cleaned = jsonMatch[0];
    }
    cleaned = cleaned.replace(/```(json)?/gi, '').trim();

    try {
      const result = JSON.parse(cleaned);
      const tags = Array.isArray(result.tags) ? result.tags : [];
      const summary = typeof result.summary === 'string' ? result.summary : '';
      const category = typeof result.category === 'string' ? result.category : 'Other';
      const readingTime = typeof result.readingTime === 'number' ? result.readingTime : 0;

      if (tags.length === 0 && !summary) {
        throw new Error(`AI returned empty fields. Raw response: ${raw.slice(0, 500)}`);
      }

      return { tags, summary, category, readingTime };
    } catch (e) {
      if (e.message.startsWith('AI returned')) throw e;
      throw new Error(`Failed to parse AI response: ${e.message}. Raw: ${raw.slice(0, 500)}`);
    }
  }

  async setApiKey(key) {
    if (!key) throw new Error('API key is required');
    await chrome.storage.local.set({ nimApiKey: key });
  }

  async validateApiKey() {
    try {
      const apiKey = await this.getApiKey();
      const res = await fetch(`${this.baseUrl}/models`, {
        headers: { 'Authorization': `Bearer ${apiKey}` },
      });
      return res.ok;
    } catch {
      return false;
    }
  }
}
