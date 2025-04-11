// Listen for extension installation or update
chrome.runtime.onInstalled.addListener((details) => {
    if (details.reason === 'install') {
        // Set your default API key here
        const defaultApiKey = 'YOUR_DEFAULT_API_KEY_HERE';
        
        // Check if API key already exists, if not, set the default
        chrome.storage.sync.get('geminiApiKey', (data) => {
            if (!data.geminiApiKey) {
                chrome.storage.sync.set({ geminiApiKey: defaultApiKey });
            }
        });
    }
});

// Simple background script for extension

// Listen for keyboard shortcut
chrome.commands.onCommand.addListener((command) => {
    if (command === 'take-screenshot' || command === 'take-screenshot-with-prompt' || command === 'take-multiple-screenshots') {
        // Get the current active tab
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            const activeTab = tabs[0];

            // Determine which action to take based on command
            let action = "initScreenshot";
            if (command === 'take-screenshot-with-prompt') {
                action = "initScreenshotWithPrompt";
            } else if (command === 'take-multiple-screenshots') {
                action = "initMultipleScreenshots";
            }

            // Send message to content script
            chrome.tabs.sendMessage(
                activeTab.id,
                { action: action },
                (response) => {
                    if (chrome.runtime.lastError) {
                        console.error("Error sending message:", chrome.runtime.lastError);
                        // If content script isn't ready, inject it directly
                        chrome.scripting.executeScript({
                            target: { tabId: activeTab.id },
                            files: ['content.js']
                        }).then(() => {
                            setTimeout(() => {
                                chrome.tabs.sendMessage(
                                    activeTab.id,
                                    { action: action }
                                );
                            }, 100); // Small delay to ensure content script is initialized
                        });
                    } else {
                        console.log("Message sent successfully");
                    }
                }
            );
        });
    }
});

// Listen for messages from content script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log("Message received:", request.action);
    if (request.action === "analyzeScreenshot") {
        console.log("Analyzing screenshot");
        // Get API key from storage
        chrome.storage.sync.get('geminiApiKey', async (data) => {
            if (!data.geminiApiKey) {
                chrome.tabs.sendMessage(sender.tab.id, {
                    action: "showError",
                    error: "Gemini API key not found. Please set your API key in the extension popup."
                });
                return;
            }

            try {
                // Call Gemini API with the screenshot data, passing any custom prompt
                const response = await sendToGeminiAPI(request.imageData, data.geminiApiKey, request.customPrompt);

                // Send the analyzed result back to the content script
                chrome.tabs.sendMessage(sender.tab.id, {
                    action: "displayResult",
                    result: response
                });
            } catch (error) {
                console.error("API error:", error);
                chrome.tabs.sendMessage(sender.tab.id, {
                    action: "showError",
                    error: `Error analyzing image: ${error.message}`
                });
            }
        });

        // Must return true to indicate we'll respond asynchronously
        return true;
    } else if (request.action === "analyzeMultipleScreenshots") {
        console.log("Analyzing multiple screenshots");
        // Get API key from storage
        chrome.storage.sync.get('geminiApiKey', async (data) => {
            if (!data.geminiApiKey) {
                chrome.tabs.sendMessage(sender.tab.id, {
                    action: "showError",
                    error: "Gemini API key not found. Please set your API key in the extension popup."
                });
                return;
            }

            try {
                // Call Gemini API with multiple screenshots data
                const response = await sendMultipleToGeminiAPI(
                    request.imageDataArray,
                    data.geminiApiKey,
                    request.customPrompt
                );

                // Send the analyzed result back to the content script
                chrome.tabs.sendMessage(sender.tab.id, {
                    action: "displayResult",
                    result: response
                });
            } catch (error) {
                console.error("API error:", error);
                chrome.tabs.sendMessage(sender.tab.id, {
                    action: "showError",
                    error: `Error analyzing images: ${error.message}`
                });
            }
        });

        // Must return true to indicate we'll respond asynchronously
        return true;
    }
});

// Function to send image to Gemini API
async function sendToGeminiAPI(imageData, apiKey, customPrompt = null) {
    const base64ImageData = imageData.replace(/^data:image\/(png|jpeg|jpg);base64,/, '');

    const url = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent";
    const headers = {
        "Content-Type": "application/json",
    };

    // Use custom prompt if provided, otherwise use the default
    const promptText = customPrompt || `You're an expert test solver. Look at the question and options in the screenshot and select the best answer based on the given context (if any). If it's a True/False, indicate clearly which one is correct.
                        Be concise. Just give the answer and a short explanation if needed.`;

    const requestBody = {
        contents: [
            {
                parts: [
                    {
                        text: promptText,
                    },
                    {
                        inline_data: {
                            mime_type: "image/png",
                            data: base64ImageData
                        }
                    }
                ]
            }
        ],
        generation_config: {
            max_output_tokens: 500,
            temperature: 0.4,
            top_p: 0.95,
            top_k: 40
        }
    };

    console.log("Sending request to Gemini API");
    const response = await fetch(`${url}?key=${apiKey}`, {
        method: "POST",
        headers: headers,
        body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`API error (${response.status}): ${errorText}`);
    }

    const data = await response.json();
    console.log("Received response from Gemini API");

    if (!data.candidates || data.candidates.length === 0) {
        throw new Error("No response from Gemini API");
    }

    return data.candidates[0].content.parts[0].text;
}

// Function to send multiple images to Gemini API
async function sendMultipleToGeminiAPI(imageDataArray, apiKey, customPrompt = null) {
    const url = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent";
    const headers = {
        "Content-Type": "application/json",
    };

    // Use custom prompt if provided, otherwise use a default prompt for multiple images
    const promptText = customPrompt || `Analyze these screenshots which are related to each other. They may be parts of the same question or test. 
                        Look at all the images carefully and provide a comprehensive answer that accounts for all provided information.
                        Be concise but thorough. If there are multiple questions, address each one.`;

    // Create parts array with the text prompt first
    const parts = [{ text: promptText }];

    // Add each image as a separate part
    imageDataArray.forEach(imageData => {
        const base64ImageData = imageData.replace(/^data:image\/(png|jpeg|jpg);base64,/, '');
        parts.push({
            inline_data: {
                mime_type: "image/png",
                data: base64ImageData
            }
        });
    });

    const requestBody = {
        contents: [{
            parts: parts
        }],
        generation_config: {
            max_output_tokens: 800, // Increase token limit for multiple images
            temperature: 0.4,
            top_p: 0.95,
            top_k: 40
        }
    };

    console.log(`Sending request to Gemini API with ${imageDataArray.length} images`);
    const response = await fetch(`${url}?key=${apiKey}`, {
        method: "POST",
        headers: headers,
        body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`API error (${response.status}): ${errorText}`);
    }

    const data = await response.json();
    console.log("Received response from Gemini API");

    if (!data.candidates || data.candidates.length === 0) {
        throw new Error("No response from Gemini API");
    }

    return data.candidates[0].content.parts[0].text;
}
