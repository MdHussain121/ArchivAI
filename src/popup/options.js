document.addEventListener('DOMContentLoaded', async () => {
  const keyInput = document.getElementById('api-key');
  const saveBtn = document.getElementById('save-key-btn');
  const testBtn = document.getElementById('test-key-btn');
  const status = document.getElementById('key-status');

  const result = await chrome.storage.local.get('geminiApiKey');
  if (result.geminiApiKey) {
    keyInput.value = result.geminiApiKey;
  }

  saveBtn.addEventListener('click', async () => {
    const key = keyInput.value.trim();
    if (!key) {
      showStatus('Please enter an API key', 'error');
      return;
    }

    await chrome.storage.local.set({ geminiApiKey: key });
    await chrome.runtime.sendMessage({ action: 'apiKeyUpdated' });
    showStatus('API key saved!', 'success');
  });

  testBtn.addEventListener('click', async () => {
    const key = keyInput.value.trim();
    if (!key) {
      showStatus('Please enter an API key first', 'error');
      return;
    }

    showStatus('Testing key...', 'pending');
    testBtn.disabled = true;

    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models?key=${key}`
      );
      if (res.ok) {
        showStatus('API key is valid!', 'success');
      } else {
        showStatus('Invalid API key. Check your key.', 'error');
      }
    } catch (err) {
      showStatus('Network error: ' + err.message, 'error');
    } finally {
      testBtn.disabled = false;
    }
  });

  function showStatus(message, type) {
    status.textContent = message;
    status.className = 'status status-badge status-badge--' + type;
    status.style.display = 'block';
    setTimeout(() => { status.style.display = 'none'; }, type === 'success' ? 3000 : 6000);
  }
});
