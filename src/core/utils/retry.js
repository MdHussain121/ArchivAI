export const DEFAULT_RETRY_OPTIONS = {
  maxAttempts: 3,
  initialDelayMs: 1000,
  maxDelayMs: 30000,
  shouldRetry: (error) => {
    const msg = error?.message || '';
    return msg.includes('429') || /5\d{2}/.test(msg);
  },
};

export async function retryWithBackoff(fn, options = {}) {
  const { maxAttempts, initialDelayMs, maxDelayMs, shouldRetry } = {
    ...DEFAULT_RETRY_OPTIONS,
    ...options,
  };

  let lastError;
  let delay = initialDelayMs;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      if (attempt === maxAttempts || !shouldRetry(error)) break;

      const jitter = delay * 0.3 * (Math.random() * 2 - 1);
      const actualDelay = Math.max(0, delay + jitter);

      await new Promise(r => setTimeout(r, actualDelay));

      delay = Math.min(maxDelayMs, delay * 2);
    }
  }

  throw lastError;
}
