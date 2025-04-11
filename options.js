// Simple script to set API key directly
document.addEventListener('DOMContentLoaded', () => {
    const apiKeyInput = document.getElementById('apiKeyInput');
    const saveButton = document.getElementById('saveButton');
    const statusText = document.getElementById('statusText');

    // Load existing API key if available
    chrome.storage.sync.get('geminiApiKey', (data) => {
        if (data.geminiApiKey) {
            apiKeyInput.value = data.geminiApiKey;
            statusText.textContent = 'API key is set';
            statusText.className = 'success';
        }
    });

    // Save API key when button is clicked
    saveButton.addEventListener('click', () => {
        const apiKey = apiKeyInput.value.trim();

        if (!apiKey) {
            statusText.textContent = 'Please enter a valid API key';
            statusText.className = 'error';
            return;
        }

        chrome.storage.sync.set({ geminiApiKey: apiKey }, () => {
            statusText.textContent = 'API key saved successfully!';
            statusText.className = 'success';

            setTimeout(() => {
                if (statusText.textContent === 'API key saved successfully!') {
                    statusText.textContent = 'API key is set';
                }
            }, 3000);
        });
    });
});
