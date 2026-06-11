export class ErrorHandler {
  static handleApiError(error) {
    const msg = error?.message || '';

    if (msg.includes('API key not configured')) {
      return { userMessage: 'Configure your Gemini API key in Settings', type: 'warning' };
    }
    if (msg.includes('429')) {
      return { userMessage: 'Rate limited. Waiting before retry...', type: 'warning' };
    }
    if (msg.includes('403') || msg.includes('401')) {
      return { userMessage: 'Invalid API key. Check your Settings.', type: 'error' };
    }
    if (!navigator.onLine) {
      return { userMessage: 'Offline. AI analysis will resume when connected.', type: 'pending' };
    }
    return { userMessage: 'An error occurred. Please try again.', type: 'error' };
  }

  static handleStorageError(error) {
    console.error('Storage error:', error);
    return { userMessage: 'Storage error. Try restarting Chrome.', type: 'error' };
  }

  static handleExtractionError(error) {
    return { userMessage: 'Could not read this page. Try a different page.', type: 'error' };
  }
}
