import { retryWithBackoff } from '../core/utils/retry.js';

export class NimClient {
  constructor() {
    this.baseUrl = 'https://integrate.api.nvidia.com/v1';
    this.model = 'step3.7-flash';
    this.systemInstruction = 'You are a precise content analysis engine. Always return valid JSON only. Analyze the provided webpage content and generate:\n- 5-10 specific, relevant tags (not generic like "article" or "web")\n- A 1-2 sentence summary capturing key points\n- A single category from the allowed list\n- Estimated reading time in minutes\nNever include markdown formatting, explanations, or anything outside the JSON. If the content is empty or unreadable, return {"tags":[],"summary":"","category":"other","readingTime":0}.';
  }

  async getApiKey() {
    const result = await chrome.storage.local.get('nimApiKey');
    if (!result.nimApiKey) throw new Error('Nvidia NIM API key not configured');
    return result.nimApiKey;
  }

  async analyze(text, title) {
    const apiKey = await this.getApiKey();
    const prompt = this.buildTaggingPrompt(text, title);

    const response = await retryWithBackoff(() =>
      fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          messages: [
            { role: 'system', content: this.systemInstruction },
            { role: 'user', content: prompt },
          ],
          temperature: 0.2,
          max_tokens: 512,
        }),
      })
    );

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`NIM API error ${response.status}: ${err}`);
    }

    const data = await response.json();
    return this.parseResponse(data);
  }

  buildTaggingPrompt(text, title) {
    const truncated = (text || '').slice(0, 12000);
    return JSON.stringify({
      task: 'analyze_content',
      title: title || '',
      content: truncated,
    });
  }

  parseResponse(data) {
    const text = data?.choices?.[0]?.message?.content || '{}';
    const cleaned = text.replace(/```(json)?/g, '').trim();
    return JSON.parse(cleaned);
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
