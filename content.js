// Content script for screenshot functionality
console.log("Content script loaded");

// Variables to track screenshot selection
let isSelecting = false;
let startX = 0;
let startY = 0;
let selectionBox = null;
let overlay = null;

// Variables to track multiple screenshots
let capturedScreenshots = [];
let isMultiScreenshotMode = false;
let multiScreenshotStatusBar = null;

// Listen for messages from the background script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log("Content script received message:", request.action);
    if (request.action === "initScreenshot" || request.action === "initScreenshotWithPrompt") {
        console.log("Init screenshot command received. isSelecting:", isSelecting);

        // Store if we need to edit prompt after capture
        const shouldEditPrompt = request.action === "initScreenshotWithPrompt";

        // If already selecting, cancel it instead of starting a new selection
        if (isSelecting) {
            console.log("Selection already active, canceling selection");
            cleanupScreenshotMode();
            sendResponse({ status: "canceled" });
        } else {
            console.log("Initializing screenshot selection");
            initScreenshotSelection(shouldEditPrompt);
            sendResponse({ status: "ok" });
        }
    } else if (request.action === "initMultipleScreenshots") {
        console.log("Init multiple screenshots command received");

        // If already in multi-screenshot mode, cancel it
        if (isMultiScreenshotMode) {
            console.log("Multiple screenshot mode already active, canceling");
            cancelMultiScreenshotMode();
            sendResponse({ status: "canceled" });
        } else {
            console.log("Initializing multiple screenshot mode");
            initMultipleScreenshotsMode();
            sendResponse({ status: "ok" });
        }
    } else if (request.action === "displayResult") {
        displayResult(request.result);
    } else if (request.action === "showError") {
        showError(request.error);
    }
    return true;
});

// Initialize screenshot selection mode
function initScreenshotSelection(shouldEditPrompt = false, isMultiScreenshot = false) {
    // Flag to indicate if we should edit prompt after capture
    window.shouldEditPrompt = shouldEditPrompt;

    // Create transparent overlay (no dimming)
    overlay = document.createElement('div');
    overlay.className = 'gemini-screenshot-overlay';
    overlay.style.position = 'fixed';
    overlay.style.top = '0';
    overlay.style.left = '0';
    overlay.style.width = '100%';
    overlay.style.height = '100%';
    overlay.style.backgroundColor = 'transparent'; // No background color
    overlay.style.zIndex = '2147483646'; // Highest possible z-index
    overlay.style.cursor = 'crosshair';
    document.body.appendChild(overlay);    // Create selection box
    selectionBox = document.createElement('div');
    selectionBox.className = 'gemini-selection-box';
    selectionBox.style.position = 'fixed';
    selectionBox.style.border = '2px dashed #ffffff';
    selectionBox.style.backgroundColor = 'rgba(128, 128, 128, 0.3)'; // Changed to grey background
    selectionBox.style.zIndex = '2147483647';
    selectionBox.style.display = 'none';
    document.body.appendChild(selectionBox);

    // No instructions element - removed as requested    // Set up event listeners
    document.addEventListener('mousedown', startSelection);
    document.addEventListener('mousemove', updateSelection);
    document.addEventListener('mouseup', endSelection);
    document.addEventListener('keydown', handleKeyDown); // Add keyboard event listener for Escape key

    // Prevent normal interactions while selecting
    document.addEventListener('click', preventDefault, true);
    document.addEventListener('contextmenu', preventDefault, true);

    // Set selecting flag
    isSelecting = true;
    console.log("Screenshot selection mode initialized");
}

// Start the selection process
function startSelection(e) {
    if (!isSelecting) return;

    startX = e.clientX;
    startY = e.clientY;

    selectionBox.style.left = startX + 'px';
    selectionBox.style.top = startY + 'px';
    selectionBox.style.width = '0px';
    selectionBox.style.height = '0px';
    selectionBox.style.display = 'block';

    e.preventDefault();
    console.log("Selection started at:", startX, startY);
}

// Update the selection box as the user drags
function updateSelection(e) {
    if (!isSelecting || selectionBox.style.display !== 'block') return;

    const currentX = e.clientX;
    const currentY = e.clientY;

    const width = Math.abs(currentX - startX);
    const height = Math.abs(currentY - startY);

    const left = Math.min(currentX, startX);
    const top = Math.min(currentY, startY);

    selectionBox.style.left = left + 'px';
    selectionBox.style.top = top + 'px';
    selectionBox.style.width = width + 'px';
    selectionBox.style.height = height + 'px';
}

// Cleanup function when selection is canceled via Escape key
function handleKeyDown(e) {
    if (e.key === 'Escape' && isSelecting) {
        console.log('Selection canceled with Escape key');
        cleanupScreenshotMode();
    }
}

// End the selection and capture the screenshot
function endSelection(e) {
    if (!isSelecting) return;
    isSelecting = false;

    console.log("Selection ended");

    // Remove event listeners
    document.removeEventListener('mousedown', startSelection);
    document.removeEventListener('mousemove', updateSelection);
    document.removeEventListener('mouseup', endSelection);
    document.removeEventListener('click', preventDefault, true);
    document.removeEventListener('contextmenu', preventDefault, true);

    const left = parseInt(selectionBox.style.left, 10);
    const top = parseInt(selectionBox.style.top, 10);
    const width = parseInt(selectionBox.style.width, 10);
    const height = parseInt(selectionBox.style.height, 10);

    // Check if selection is too small
    if (width < 10 || height < 10) {
        console.log("Selection too small, aborting");
        cleanupScreenshotMode();
        return;
    }

    // Show loading indicator
    showLoadingIndicator(left + width / 2, top + height / 2);

    // Need to wait a moment for the overlay to be removed before capturing
    setTimeout(() => {
        captureScreenshot(left, top, width, height);
    }, 100);
}

// Prevent default actions during selection
function preventDefault(e) {
    if (isSelecting) {
        e.preventDefault();
        e.stopPropagation();
        return false;
    }
}

// Capture the screenshot of the selected area using HTML5 Canvas
function captureScreenshot(left, top, width, height) {
    console.log("Capturing screenshot with dimensions:", width, height);

    // Get current scroll position
    const scrollX = window.pageXOffset || document.documentElement.scrollLeft;
    const scrollY = window.pageYOffset || document.documentElement.scrollTop;
    console.log("Current scroll position:", scrollX, scrollY);

    // Convert viewport coordinates to absolute document coordinates
    const absoluteLeft = left + scrollX;
    const absoluteTop = top + scrollY;

    console.log("Capturing area at absolute position:", absoluteLeft, absoluteTop);

    // Hide the overlay and selection box for clean screenshot
    overlay.style.display = 'none';
    selectionBox.style.display = 'none';

    // Use HTML Canvas to capture the screenshot
    try {
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');

        // Create an image of the current viewport
        html2canvas(document.documentElement, {
            x: absoluteLeft,
            y: absoluteTop,
            width: width,
            height: height,
            useCORS: true,
            allowTaint: true,
            scrollX: 0,
            scrollY: 0
        }).then(canvas => {                // Get the image data
            const imageData = canvas.toDataURL('image/png');
            console.log("Screenshot captured successfully");

            // Check if we're in multi-screenshot mode
            if (isMultiScreenshotMode) {
                // Add to captured screenshots array
                capturedScreenshots.push(imageData);

                // Update status bar
                updateMultiScreenshotStatus();

                // Clean up current selection
                cleanupScreenshotMode();

                // Ready for next screenshot
                setTimeout(() => {
                    initScreenshotSelection(false, true);
                }, 100);
            } else if (window.shouldEditPrompt) {
                showPromptEditor(imageData);
                cleanupScreenshotMode();
            } else {
                // Send directly to background script for API call
                chrome.runtime.sendMessage({
                    action: "analyzeScreenshot",
                    imageData: imageData
                });

                // Cleanup
                cleanupScreenshotMode();
            }
        }).catch(error => {
            console.error("Screenshot capture error:", error);
            showError('Failed to capture screenshot: ' + error.message);
            cleanupScreenshotMode();
        });
    } catch (error) {
        console.error("Screenshot capture error:", error);
        showError('Failed to capture screenshot: ' + error.message);
        cleanupScreenshotMode();
    }
}

// Show a loading indicator in the lower right corner
function showLoadingIndicator() {
    console.log("Showing loading indicator");

    const loading = document.createElement('div');
    loading.className = 'gemini-loading';
    loading.style.position = 'fixed';
    loading.style.width = '30px'; // Smaller size
    loading.style.height = '30px'; // Smaller size
    loading.style.zIndex = '2147483647';
    loading.style.border = '3px solid rgba(243, 243, 243, 0.3)'; // More transparent border
    loading.style.borderTop = '3px solid rgba(52, 152, 219, 0.7)'; // More transparent highlight
    loading.style.borderRadius = '50%';
    loading.style.right = '20px'; // Fixed position in lower right
    loading.style.bottom = '20px'; // Fixed position in lower right
    loading.style.opacity = '0.7'; // Make it less noticeable

    // Add animation
    const style = document.createElement('style');
    style.textContent = '@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }';
    style.textContent += '.gemini-loading { animation: spin 1s linear infinite; }';
    document.head.appendChild(style);
    document.body.appendChild(loading);
}

// Clean up screenshot mode elements
function cleanupScreenshotMode() {
    console.log("Cleaning up screenshot mode");

    if (overlay && overlay.parentNode) {
        overlay.parentNode.removeChild(overlay);
    }

    if (selectionBox && selectionBox.parentNode) {
        selectionBox.parentNode.removeChild(selectionBox);
    }

    const instructions = document.querySelector('.gemini-instructions');
    if (instructions && instructions.parentNode) {
        instructions.parentNode.removeChild(instructions);
    }

    const loading = document.querySelector('.gemini-loading');
    if (loading && loading.parentNode) {
        loading.parentNode.removeChild(loading);
    }
}

// Initialize multiple screenshots selection mode
function initMultipleScreenshotsMode() {
    // Reset the screenshots array
    capturedScreenshots = [];
    isMultiScreenshotMode = true;

    // Create status bar to show how many screenshots have been taken
    showMultiScreenshotStatusBar();

    // Start the first screenshot capture
    initScreenshotSelection(false, true);
}

// Show status bar for multiple screenshots mode
function showMultiScreenshotStatusBar() {
    // Create status bar element
    multiScreenshotStatusBar = document.createElement('div');
    multiScreenshotStatusBar.className = 'gemini-multi-status'; multiScreenshotStatusBar.style.position = 'fixed';
    multiScreenshotStatusBar.style.bottom = '20px';
    multiScreenshotStatusBar.style.left = '50%';
    multiScreenshotStatusBar.style.transform = 'translateX(-50%)';
    multiScreenshotStatusBar.style.backgroundColor = 'rgba(0, 0, 0, 0.4)'; // Less opaque
    multiScreenshotStatusBar.style.color = '#fff';
    multiScreenshotStatusBar.style.padding = '8px 12px'; // Smaller padding
    multiScreenshotStatusBar.style.borderRadius = '5px';
    multiScreenshotStatusBar.style.fontSize = '13px'; // Smaller font
    multiScreenshotStatusBar.style.zIndex = '2147483647';
    multiScreenshotStatusBar.style.display = 'flex';
    multiScreenshotStatusBar.style.alignItems = 'center';
    multiScreenshotStatusBar.style.gap = '10px';
    multiScreenshotStatusBar.style.opacity = '0.85'; // More transparent overall
    updateMultiScreenshotStatus();

    document.body.appendChild(multiScreenshotStatusBar);

    // Add global keyboard listener for Enter and Escape
    document.addEventListener('keydown', handleMultiScreenshotKeydown);
}

// Update the status bar with current screenshot count
function updateMultiScreenshotStatus() {
    if (multiScreenshotStatusBar) {
        multiScreenshotStatusBar.innerHTML = `
            <div>
                <span style="font-weight:bold">${capturedScreenshots.length}</span> screenshot/s captured
            </div>
            <div style="display:flex;gap:15px;align-items:center">
                <div style="display:flex;align-items:center;gap:5px">
                    <kbd style="background:#f8f9fa;color:#333;border:1px solid #ccc;border-radius:3px;padding:2px 5px;font-size:12px">Escape</kbd>
                    <span>Cancel</span>
                    </div>
                    <div style="display:flex;align-items:center;gap:5px">
                    <kbd style="background:#f8f9fa;color:#333;border:1px solid #ccc;border-radius:3px;padding:2px 5px;font-size:12px">Enter</kbd>
                    <span>Submit ${capturedScreenshots.length > 0 ? "all" : ""}</span>
                    </div>
                    <div style="display:flex;align-items:center;gap:5px">
                    <button id="editPromptBtn" style="background:#f8f9fa;color:#333;border:1px solid #ccc;border-radius:3px;padding:2px 5px;font-size:12px;cursor:pointer;">P</button>
                    <span>Edit Prompt</span>
                </div>
            </div>
        `;

        // Add event listener for the edit prompt button
        const editPromptBtn = multiScreenshotStatusBar.querySelector('#editPromptBtn');
        if (editPromptBtn) {
            editPromptBtn.addEventListener('click', showMultiPromptEditor);
        }
    }
}

// Handle keypresses in multi-screenshot mode
function handleMultiScreenshotKeydown(e) {
    if (!isMultiScreenshotMode) return;

    // Enter key submits all screenshots
    if (e.key === 'Enter') {
        if (capturedScreenshots.length > 0) {
            submitMultipleScreenshots();
        } else {
            showError('Please capture at least one screenshot first');
        }
    }

    // Escape key cancels the whole operation
    if (e.key === 'Escape') {
        cancelMultiScreenshotMode();
    }

    // 'P' key opens the prompt editor (ctrl+p or alt+p might conflict with browser shortcuts)
    if (e.key === 'p' || e.key === 'P') {
        showMultiPromptEditor();
    }
}

// Cancel multi-screenshot mode and clean up
function cancelMultiScreenshotMode() {
    isMultiScreenshotMode = false;
    capturedScreenshots = [];

    // Remove status bar
    if (multiScreenshotStatusBar && multiScreenshotStatusBar.parentNode) {
        multiScreenshotStatusBar.parentNode.removeChild(multiScreenshotStatusBar);
        multiScreenshotStatusBar = null;
    }

    // Remove keyboard listener
    document.removeEventListener('keydown', handleMultiScreenshotKeydown);

    // Clean up any active selection
    cleanupScreenshotMode();
}

// Submit all captured screenshots for analysis
function submitMultipleScreenshots() {
    console.log(`Submitting ${capturedScreenshots.length} screenshots for analysis`);

    // Show loading indicator in the lower right
    const loading = document.createElement('div');
    loading.className = 'gemini-loading';
    loading.style.position = 'fixed';
    loading.style.width = '30px';
    loading.style.height = '30px';
    loading.style.zIndex = '2147483647';
    loading.style.border = '3px solid rgba(243, 243, 243, 0.3)';
    loading.style.borderTop = '3px solid rgba(52, 152, 219, 0.7)';
    loading.style.borderRadius = '50%';
    loading.style.right = '20px';
    loading.style.bottom = '20px';
    loading.style.opacity = '0.7';

    // Add animation
    const style = document.createElement('style');
    style.textContent = '@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }';
    style.textContent += '.gemini-loading { animation: spin 1s linear infinite; }';
    document.head.appendChild(style);
    document.body.appendChild(loading);    // Send all screenshots to the background for analysis
    chrome.runtime.sendMessage({
        action: "analyzeMultipleScreenshots",
        imageDataArray: capturedScreenshots,
        customPrompt: window.customMultiPrompt // Include custom prompt if set
    });

    // Clean up multi-screenshot mode
    cancelMultiScreenshotMode();
}

// Show a prompt editor modal dialog
function showPromptEditor(imageData) {
    console.log("Showing prompt editor");

    // Get the default prompt from storage or use a default one
    chrome.storage.sync.get('defaultPrompt', (data) => {
        // Default prompt if none is stored
        let promptText = data.defaultPrompt || `You're an expert test solver. Look at the question and options in the screenshot and select the best answer based on the given context (if any). If it's a True/False, indicate clearly which one is correct.
Be concise. Just give the answer and a short explanation if needed.`;

        // Create modal container in lower right without background dimming
        const modal = document.createElement('div');
        modal.className = 'gemini-prompt-modal';
        modal.style.position = 'fixed';
        modal.style.bottom = '20px';
        modal.style.right = '20px';
        modal.style.zIndex = '2147483647';        // Create modal content with more subtlety - restyled for lower right position
        const modalContent = document.createElement('div');
        modalContent.style.backgroundColor = 'rgba(255, 255, 255, 0.95)';
        modalContent.style.borderRadius = '8px';
        modalContent.style.width = '350px'; // Adjusted width
        modalContent.style.maxHeight = '400px';
        modalContent.style.padding = '15px';
        modalContent.style.border = '1px solid rgba(0, 0, 0, 0.1)';
        modalContent.style.boxShadow = '0 2px 10px rgba(0, 0, 0, 0.2)';
        modalContent.style.display = 'flex';
        modalContent.style.flexDirection = 'column';
        modalContent.style.gap = '10px';

        // Title - smaller and more subtle
        const title = document.createElement('div'); // Using div instead of h3
        title.textContent = 'Edit Prompt';
        title.style.margin = '0';
        title.style.padding = '0';
        title.style.fontFamily = 'system-ui, -apple-system, sans-serif';
        title.style.fontSize = '14px';
        title.style.color = '#555';
        title.style.fontWeight = '500';

        // Textarea for prompt editing - more subtle
        const textarea = document.createElement('textarea');
        textarea.value = promptText;
        textarea.style.width = '100%';
        textarea.style.height = '150px'; // Smaller height
        textarea.style.padding = '8px';
        textarea.style.fontSize = '13px';
        textarea.style.border = '1px solid rgba(0, 0, 0, 0.1)'; // More subtle border
        textarea.style.borderRadius = '4px';
        textarea.style.resize = 'vertical';
        textarea.style.fontFamily = 'monospace';
        textarea.style.backgroundColor = 'rgba(255, 255, 255, 0.7)'; // Semi-transparent

        // Button container - more minimal
        const buttonContainer = document.createElement('div');
        buttonContainer.style.display = 'flex';
        buttonContainer.style.justifyContent = 'flex-end';
        buttonContainer.style.gap = '8px';

        // Cancel button - more subtle
        const cancelButton = document.createElement('button');
        cancelButton.textContent = 'Cancel';
        cancelButton.style.padding = '6px 12px';
        cancelButton.style.backgroundColor = 'rgba(240, 240, 240, 0.7)';
        cancelButton.style.border = 'none';
        cancelButton.style.borderRadius = '4px';
        cancelButton.style.cursor = 'pointer';
        cancelButton.style.fontSize = '12px';
        cancelButton.style.color = '#555';
        cancelButton.addEventListener('click', () => {
            document.body.removeChild(modal);
        });

        // Save as default button - more subtle
        const saveDefaultButton = document.createElement('button');
        saveDefaultButton.textContent = 'Save Default';
        saveDefaultButton.style.padding = '6px 12px';
        saveDefaultButton.style.backgroundColor = 'rgba(76, 175, 80, 0.6)';
        saveDefaultButton.style.color = 'white';
        saveDefaultButton.style.border = 'none';
        saveDefaultButton.style.borderRadius = '4px';
        saveDefaultButton.style.cursor = 'pointer';
        saveDefaultButton.style.fontSize = '12px';
        saveDefaultButton.addEventListener('click', () => {
            const newPrompt = textarea.value.trim();
            chrome.storage.sync.set({ 'defaultPrompt': newPrompt }, () => {
                sendWithCustomPrompt(imageData, newPrompt);
                document.body.removeChild(modal);
            });
        });

        // Submit button - more subtle
        const submitButton = document.createElement('button');
        submitButton.textContent = 'Submit';
        submitButton.style.padding = '6px 12px';
        submitButton.style.backgroundColor = 'rgba(33, 150, 243, 0.6)';
        submitButton.style.color = 'white';
        submitButton.style.border = 'none';
        submitButton.style.borderRadius = '4px';
        submitButton.style.cursor = 'pointer';
        submitButton.style.fontSize = '12px';
        submitButton.addEventListener('click', () => {
            const newPrompt = textarea.value.trim();
            sendWithCustomPrompt(imageData, newPrompt);
            document.body.removeChild(modal);
        });

        // Add elements to the modal
        buttonContainer.appendChild(cancelButton);
        buttonContainer.appendChild(saveDefaultButton);
        buttonContainer.appendChild(submitButton);

        modalContent.appendChild(title);
        modalContent.appendChild(textarea);
        modalContent.appendChild(buttonContainer);

        modal.appendChild(modalContent);
        document.body.appendChild(modal);

        // Focus the textarea
        textarea.focus();
        textarea.select();

        // Add keyboard listener for Escape key
        const handleKeyDown = (e) => {
            if (e.key === 'Escape') {
                document.removeEventListener('keydown', handleKeyDown);
                document.body.removeChild(modal);
            }
        };
        document.addEventListener('keydown', handleKeyDown);
    });
}

// Send screenshot to background script with custom prompt
function sendWithCustomPrompt(imageData, customPrompt) {
    chrome.runtime.sendMessage({
        action: "analyzeScreenshot",
        imageData: imageData,
        customPrompt: customPrompt
    });
}

// Display the analysis result in a floating box
function displayResult(result) {
    console.log("Displaying result:", result);

    // Create result container
    const resultElement = document.createElement('div');
    resultElement.className = 'gemini-result';
    resultElement.style.position = 'fixed';
    resultElement.style.bottom = '20px';
    resultElement.style.right = '20px';
    resultElement.style.width = '300px';
    resultElement.style.maxWidth = '80vw';
    resultElement.style.backgroundColor = 'rgba(255, 255, 255, 0.95)';
    resultElement.style.borderRadius = '8px';
    resultElement.style.boxShadow = '0 2px 10px rgba(0, 0, 0, 0.2)';
    resultElement.style.zIndex = '2147483647';
    resultElement.style.overflow = 'hidden';
    resultElement.style.transition = 'opacity 0.5s ease-in-out';
    resultElement.style.opacity = '0.15'; // Start with low opacity

    // Create the content container
    const contentElement = document.createElement('div');
    contentElement.className = 'gemini-result-content';
    contentElement.style.padding = '15px';
    contentElement.style.maxHeight = '300px';
    contentElement.style.overflowY = 'auto';
    contentElement.style.fontSize = '14px';
    contentElement.style.lineHeight = '1.5';
    contentElement.style.color = '#333';

    // Add the API result as text
    contentElement.textContent = result;

    // Create button container for both buttons
    const buttonContainer = document.createElement('div');
    buttonContainer.style.position = 'relative';
    buttonContainer.style.display = 'flex';
    buttonContainer.style.justifyContent = 'flex-center';
    buttonContainer.style.gap = '5px';
    buttonContainer.style.padding = '5px';

    // Create copy button
    const copyButton = document.createElement('button');
    copyButton.className = 'gemini-result-copy';
    copyButton.textContent = '📋';
    copyButton.style.background = 'none';
    copyButton.style.border = 'none';
    copyButton.style.color = '#666';
    copyButton.style.fontSize = '16px';
    copyButton.style.cursor = 'pointer';
    copyButton.style.padding = '0';
    copyButton.style.width = '24px';
    copyButton.style.height = '24px';
    copyButton.style.display = 'flex';
    copyButton.style.alignItems = 'center';
    copyButton.style.justifyContent = 'center';
    copyButton.title = 'Copy to clipboard';

    copyButton.addEventListener('click', () => {
        navigator.clipboard.writeText(result).then(() => {
            const originalText = copyButton.textContent;
            copyButton.textContent = '✓';
            setTimeout(() => {
                copyButton.textContent = originalText;
            }, 1000);
        });
    });

    // Create close button
    const closeButton = document.createElement('button');
    closeButton.className = 'gemini-result-close';
    closeButton.textContent = '×';
    closeButton.style.background = 'none';
    closeButton.style.border = 'none';
    closeButton.style.color = '#666';
    closeButton.style.fontSize = '20px';
    closeButton.style.cursor = 'pointer';
    closeButton.style.padding = '0';
    closeButton.style.width = '24px';
    closeButton.style.height = '24px';
    closeButton.style.display = 'flex';
    closeButton.style.alignItems = 'center';
    closeButton.style.justifyContent = 'center';

    closeButton.addEventListener('click', () => {
        document.body.removeChild(resultElement);
    });

    // Assemble the components with the new button container
    buttonContainer.appendChild(copyButton);
    buttonContainer.appendChild(closeButton);
    resultElement.appendChild(buttonContainer);
    resultElement.appendChild(contentElement);

    // Remove any existing result elements
    const existingResult = document.querySelector('.gemini-result');
    if (existingResult) {
        existingResult.parentNode.removeChild(existingResult);
    }

    // Remove any loading indicators
    const loading = document.querySelector('.gemini-loading');
    if (loading) {
        loading.parentNode.removeChild(loading);
    }

    // Add to document
    document.body.appendChild(resultElement);

    // Add hover effect with delay
    let fadeTimeout;

    resultElement.addEventListener('mouseenter', () => {
        clearTimeout(fadeTimeout);
        resultElement.style.opacity = '1';
    });

    resultElement.addEventListener('mouseleave', () => {
        fadeTimeout = setTimeout(() => {
            if (resultElement.parentNode) { // Check if element still exists
                resultElement.style.opacity = '0.15';
            }
        }, 2000); // 2 second delay before fading
    });

    // Add escape key handler
    const handleResultKeyDown = (e) => {
        if (e.key === 'Escape') {
            document.removeEventListener('keydown', handleResultKeyDown);
            if (resultElement.parentNode) {
                resultElement.parentNode.removeChild(resultElement);
            }
        }
    };
    document.addEventListener('keydown', handleResultKeyDown);
}

// Display an error message in a notification
function showError(errorMessage) {
    console.error("Error:", errorMessage);

    // Create error notification
    const errorElement = document.createElement('div');
    errorElement.className = 'gemini-error';
    errorElement.style.position = 'fixed';
    errorElement.style.top = '20px';
    errorElement.style.left = '50%';
    errorElement.style.transform = 'translateX(-50%)';
    errorElement.style.backgroundColor = 'rgba(220, 53, 69, 0.9)';
    errorElement.style.color = '#fff';
    errorElement.style.padding = '10px 20px';
    errorElement.style.borderRadius = '4px';
    errorElement.style.fontSize = '14px';
    errorElement.style.zIndex = '2147483647';
    errorElement.style.boxShadow = '0 2px 10px rgba(0, 0, 0, 0.2)';

    // Add error message
    errorElement.textContent = errorMessage;

    // Remove any existing error notifications
    const existingError = document.querySelector('.gemini-error');
    if (existingError) {
        existingError.parentNode.removeChild(existingError);
    }

    // Add to document
    document.body.appendChild(errorElement);

    // Auto-remove after 5 seconds
    setTimeout(() => {
        if (errorElement.parentNode) {
            errorElement.parentNode.removeChild(errorElement);
        }
    }, 5000);
}

// Show prompt editor for multiple screenshots mode
function showMultiPromptEditor() {
    // Store current state to restore after prompt editing
    const currentScreenshots = [...capturedScreenshots];

    // Get the default multi-prompt from storage or use a default one
    chrome.storage.sync.get('multiPrompt', (data) => {
        // Default original prompt for resetting
        const originalPrompt = data.multiPrompt || `Analyze these screenshots which are related to each other. They may be parts of the same question or test. 
Look at all the images carefully and provide a comprehensive answer that accounts for all provided information.
Be concise but thorough. If there are multiple questions, address each one.`;

        // Use current session prompt if available, otherwise use saved/default
        let promptText = window.customMultiPrompt || originalPrompt;

        // Create modal in lower right without background dimming
        const modal = document.createElement('div');
        modal.className = 'gemini-prompt-modal';
        modal.style.position = 'fixed';
        modal.style.bottom = '20px';
        modal.style.right = '20px';
        modal.style.zIndex = '2147483647';

        // Create modal content styled for lower right position
        const modalContent = document.createElement('div');
        modalContent.style.backgroundColor = 'rgba(255, 255, 255, 0.95)';
        modalContent.style.borderRadius = '8px';
        modalContent.style.width = '350px';
        modalContent.style.maxHeight = '400px';
        modalContent.style.padding = '15px';
        modalContent.style.border = '1px solid rgba(0, 0, 0, 0.1)';
        modalContent.style.boxShadow = '0 2px 10px rgba(0, 0, 0, 0.2)';
        modalContent.style.display = 'flex';
        modalContent.style.flexDirection = 'column';
        modalContent.style.gap = '10px';

        // Title - smaller and subtle
        const title = document.createElement('div');
        title.textContent = 'Edit Multiple Screenshots Prompt';
        title.style.margin = '0';
        title.style.padding = '0';
        title.style.fontFamily = 'system-ui, -apple-system, sans-serif';
        title.style.fontSize = '14px';
        title.style.color = '#555';
        title.style.fontWeight = '500';

        // Textarea for prompt editing
        const textarea = document.createElement('textarea');
        textarea.value = promptText;
        textarea.style.width = '100%';
        textarea.style.height = '150px';
        textarea.style.padding = '8px';
        textarea.style.fontSize = '13px';
        textarea.style.border = '1px solid rgba(0, 0, 0, 0.1)';
        textarea.style.borderRadius = '4px';
        textarea.style.resize = 'vertical';
        textarea.style.fontFamily = 'monospace';        // Button container
        const buttonContainer = document.createElement('div');
        buttonContainer.style.display = 'flex';
        buttonContainer.style.justifyContent = 'flex-end';
        buttonContainer.style.gap = '8px';

        // Reset button - to restore original prompt
        const resetButton = document.createElement('button');
        resetButton.textContent = 'Reset';
        resetButton.style.padding = '6px 12px';
        resetButton.style.backgroundColor = 'rgba(108, 117, 125, 0.8)';
        resetButton.style.color = 'white';
        resetButton.style.border = 'none';
        resetButton.style.borderRadius = '4px';
        resetButton.style.cursor = 'pointer';
        resetButton.style.fontSize = '12px';
        resetButton.addEventListener('click', () => {
            textarea.value = originalPrompt;
            textarea.focus();
        });

        // Cancel button
        const cancelButton = document.createElement('button');
        cancelButton.textContent = 'Cancel';
        cancelButton.style.padding = '6px 12px';
        cancelButton.style.backgroundColor = 'rgba(240, 240, 240, 0.9)';
        cancelButton.style.border = 'none';
        cancelButton.style.borderRadius = '4px';
        cancelButton.style.cursor = 'pointer';
        cancelButton.style.fontSize = '12px';
        cancelButton.style.color = '#555';
        cancelButton.addEventListener('click', () => {
            document.body.removeChild(modal);
        });

        // Save as default button
        const saveDefaultButton = document.createElement('button');
        saveDefaultButton.textContent = 'Save Default';
        saveDefaultButton.style.padding = '6px 12px';
        saveDefaultButton.style.backgroundColor = 'rgba(76, 175, 80, 0.8)';
        saveDefaultButton.style.color = 'white';
        saveDefaultButton.style.border = 'none';
        saveDefaultButton.style.borderRadius = '4px';
        saveDefaultButton.style.cursor = 'pointer';
        saveDefaultButton.style.fontSize = '12px';
        saveDefaultButton.addEventListener('click', () => {
            const newPrompt = textarea.value.trim();
            chrome.storage.sync.set({ 'multiPrompt': newPrompt }, () => {
                window.customMultiPrompt = newPrompt;
                document.body.removeChild(modal);
            });
        });
        // "Use This Time Only" button
        const useOnceButton = document.createElement('button');
        useOnceButton.textContent = 'Use Once';
        useOnceButton.style.padding = '6px 12px';
        useOnceButton.style.backgroundColor = 'rgba(33, 150, 243, 0.8)';
        useOnceButton.style.color = 'white';
        useOnceButton.style.border = 'none';
        useOnceButton.style.borderRadius = '4px';
        useOnceButton.style.cursor = 'pointer';
        useOnceButton.style.fontSize = '12px';
        useOnceButton.addEventListener('click', () => {
            const newPrompt = textarea.value.trim();
            window.customMultiPrompt = newPrompt; // Store for this session only
            document.body.removeChild(modal);
        });        // Add elements to the modal
        buttonContainer.appendChild(resetButton);
        buttonContainer.appendChild(cancelButton);
        buttonContainer.appendChild(useOnceButton);
        buttonContainer.appendChild(saveDefaultButton);

        modalContent.appendChild(title);
        modalContent.appendChild(textarea);
        modalContent.appendChild(buttonContainer);

        modal.appendChild(modalContent);
        document.body.appendChild(modal);

        // Focus the textarea
        textarea.focus();
        textarea.select();

        // Add keyboard listener for Escape key
        const handleKeyDown = (e) => {
            if (e.key === 'Escape') {
                document.removeEventListener('keydown', handleKeyDown);
                document.body.removeChild(modal);
            }
        };
        document.addEventListener('keydown', handleKeyDown);
    });
}

// Send screenshot to background script with custom prompt
function sendWithCustomPrompt(imageData, customPrompt) {
    chrome.runtime.sendMessage({
        action: "analyzeScreenshot",
        imageData: imageData,
        customPrompt: customPrompt
    });
}
