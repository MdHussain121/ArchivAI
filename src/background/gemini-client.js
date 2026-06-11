import { retryWithBackoff } from '../core/utils/retry.js';

export class GeminiClient {
  constructor() {
    this.baseUrl = 'https://generativelanguage.googleapis.com/v1beta';
    this.model = 'gemini-2.0-flash';
  }

  async getApiKey() {
    const result = await chrome.storage.local.get('geminiApiKey');
    if (!result.geminiApiKey) throw new Error('Gemini API key not configured');
    return result.geminiApiKey;
  }

  async analyze(text, title) {
    const apiKey = await this.getApiKey();
    const prompt = this.buildTaggingPrompt(text, title);

    const response = await retryWithBackoff(() =>
      fetch(`${this.baseUrl}/models/${this.model}:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [{ text: prompt }]
          }],
          generationConfig: {
            temperature: 0.3,
            maxOutputTokens: 256,
            responseMimeType: 'application/json',
          }
        }),
      })
    );

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Gemini API error ${response.status}: ${err}`);
    }

    const data = await response.json();
    return this.parseTaggingResponse(data);
  }

  buildTaggingPrompt(text, title) {
    const truncated = (text || '').slice(0, 8000);
    return `You are a content analysis engine. Analyze the following article and return ONLY valid JSON.

Title: ${title || ''}

Content: ${truncated}

Return JSON with this exact structure:
{
  "tags": ["tag1", "tag2", "tag3", "tag4", "tag5"],
  "summary": "One sentence summary (max 30 words)",
  "category": "one of: technology, science, design, business, health, education, entertainment, lifestyle, news, other",
  "readingTime": estimated minutes as number
}`;
  }

  parseTaggingResponse(data) {
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
    const cleaned = text.replace(/```(json)?/g, '').trim();
    return JSON.parse(cleaned);
  }

  async setApiKey(key) {
    if (!key || !key.startsWith('AI')) {
      throw new Error('Invalid Gemini API key format');
    }
    await chrome.storage.local.set({ geminiApiKey: key });
  }

  async validateApiKey() {
    try {
      const apiKey = await this.getApiKey();
      const res = await fetch(`${this.baseUrl}/models?key=${apiKey}`);
      return res.ok;
    } catch {
      return false;
    }
  }
}
