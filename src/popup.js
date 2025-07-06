/**
 * Popup script for Shopee Comment Extractor
 * Handles API key management through the popup UI
 */

const API_KEY_STORAGE_KEY = "gemini_api_key";

// DOM Elements
const apiKeyInput = document.getElementById('api-key');
const saveButton = document.getElementById('save-btn');
const clearButton = document.getElementById('clear-btn');
const statusMessage = document.getElementById('status-message');

// Load API key from storage when popup opens
function loadApiKey() {
  try {
    chrome.storage.local.get([API_KEY_STORAGE_KEY], (result) => {
      if (result[API_KEY_STORAGE_KEY]) {
        apiKeyInput.value = result[API_KEY_STORAGE_KEY];
        showStatus('API key loaded from storage', 'success');
      }
    });
  } catch (error) {
    console.error('Failed to load API key:', error);
    showStatus('Failed to load API key', 'error');
  }
}

// Save API key to storage
function saveApiKey() {
  const apiKey = apiKeyInput.value.trim();
  
  if (!apiKey) {
    showStatus('Please enter an API key', 'error');
    return;
  }
  
  try {
    chrome.storage.local.set({ [API_KEY_STORAGE_KEY]: apiKey }, () => {
      showStatus('API key saved successfully!', 'success');
    });
  } catch (error) {
    console.error('Failed to save API key:', error);
    showStatus('Failed to save API key', 'error');
  }
}

// Clear API key
function clearApiKey() {
  apiKeyInput.value = '';
  try {
    chrome.storage.local.remove([API_KEY_STORAGE_KEY], () => {
      showStatus('API key cleared', 'success');
    });
  } catch (error) {
    console.error('Failed to clear API key:', error);
    showStatus('Failed to clear API key', 'error');
  }
}

// Display status message
function showStatus(message, type) {
  statusMessage.textContent = message;
  statusMessage.className = `status ${type}`;
  statusMessage.classList.remove('hidden');
  
  // Auto-hide after 3 seconds
  setTimeout(() => {
    statusMessage.classList.add('hidden');
  }, 3000);
}

// Event listeners
saveButton.addEventListener('click', saveApiKey);
clearButton.addEventListener('click', clearApiKey);

// Initialize popup
document.addEventListener('DOMContentLoaded', loadApiKey);
