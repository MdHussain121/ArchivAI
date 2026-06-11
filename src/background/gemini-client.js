import { retryWithBackoff } from '../core/utils/retry.js';

export class GeminiClient {
  constructor() {
    this.baseUrl = 'https://generativelanguage.googleapis.com/v1beta';
    this.model = 'gemini-2.5-flash';
    this.systemInstruction = 'You are a precise content analysis engine. Always return valid JSON only. Analyze the provided webpage content and generate:\n- 5-10 specific, relevant tags (not generic like "article" or "web")\n- A 1-2 sentence summary capturing key points\n- A single category from the allowed list\n- Estimated reading time in minutes\nNever include markdown formatting, explanations, or anything outside the JSON. If the content is empty or unreadable, return {"tags":[],"summary":"","category":"other","readingTime":0}.';
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
          system_instruction: { parts: [{ text: this.systemInstruction }] },
          contents: [{
            parts: [{ text: prompt }]
          }],
          generationConfig: {
            temperature: 0.2,
            maxOutputTokens: 512,
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
    const truncated = (text || '').slice(0, 12000);
    return JSON.stringify({
      task: 'analyze_content',
      title: title || '',
      content: truncated,
    });
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
