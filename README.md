# Gemini Screenshot Tool

A Chrome extension that allows you to capture screenshots and analyze them using Google's Gemini API. Quickly analyze test questions, images, or any visual content on web pages.

## Features

- **Quick Screenshot Capture**: Use Alt+Shift+S to activate screenshot mode
- **Custom Area Selection**: Click and drag to select specific areas of the page
- **Multiple Screenshot Mode**: Capture multiple related images and analyze them together
- **Custom Prompts**: Edit analysis prompts before submission
- **Instant Results**: View AI analysis results in a convenient floating window
- **Keyboard Shortcuts**:
  - `Alt+Shift+S`: Take single screenshot
  - `Alt+Shift+Q`: Take screenshot with custom prompt
  - `Alt+Shift+M`: Take multiple screenshots

## Installation

1. Clone this repository or download the source code
2. Open Chrome and navigate to `chrome://extensions/`
3. Enable "Developer mode" in the top right
4. Click "Load unpacked" and select the project directory

## Setup

1. Get a Gemini API key
2. Click the extension icon in Chrome
3. Enter your API key in the settings
4. Save the API key

## Usage

1. Navigate to any webpage
2. Press `Alt+Shift+S` (or your configured shortcut)
3. Click and drag to select the area you want to analyze
   - Press `Escape` to cancel the selection
   - Press `Escape` to close the prompt editor dialog
4. Wait for the result
5. View results in the floating window

## Requirements

- Google Chrome browser
- Gemini API key
- Active internet connection

## Files Structure

- `manifest.json`: Extension configuration
- `background.js`: Background service worker
- `content.js`: Content script for screenshot functionality
- `popup.html/js/css`: Extension popup interface
- `options.html/js`: Settings page
- `styles.css`: Stylesheet for content script

## Development

To modify or enhance the extension:

1. Make your changes to the source files
2. Reload the extension in `chrome://extensions/`
3. Test your changes

## Support

For issues or questions, please open an issue in the repository.
