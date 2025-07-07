/**
 * Popup script for Shopee Comment Extractor
 * Handles API key management and comment extraction through the popup UI
 */

const API_KEY_STORAGE_KEY = "gemini_api_key";

// DOM Elements
const apiKeyInput = document.getElementById('api-key');
const saveButton = document.getElementById('save-btn');
const clearButton = document.getElementById('clear-btn');
const extractAllButton = document.getElementById('extract-all-btn');
const statusMessage = document.getElementById('status-message');
const commentsContainer = document.getElementById('comments-container');
const commentsList = document.getElementById('comments-list');
const extractionProgress = document.getElementById('extraction-progress');
const progressBar = document.getElementById('progress-bar');
const progressText = document.getElementById('progress-text');
const commentCount = document.getElementById('comment-count');

// Stored comments
let storedComments = [];

// Load API key from storage when popup opens
function loadApiKey() {
  try {
    chrome.storage.local.get([API_KEY_STORAGE_KEY], (result) => {
      if (result[API_KEY_STORAGE_KEY]) {
        apiKeyInput.value = result[API_KEY_STORAGE_KEY];
        showStatus('API key loaded from storage', 'success');
      }
      
      // Get the current active tab to check if we're on Shopee
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0] && tabs[0].url && tabs[0].url.includes('shopee.')) {
          // Check if we need to manually trigger extraction or just display already processed comments
          chrome.tabs.sendMessage(tabs[0].id, { action: "getProcessedComments" }, (response) => {
            if (chrome.runtime.lastError || !response || !response.hasProcessedComments) {
              // If comments haven't been processed yet, extract them now
              extractComments();
            }
          });
        }
      });
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

// Extract comments from current active tab
async function extractComments() {
  try {
    // Get the current active tab
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    if (!tab) {
      showStatus('No active tab found', 'error');
      return;
    }
    
    // Check if we're on a Shopee site
    const isShopee = tab.url.includes('shopee.');
    if (!isShopee) {
      showStatus('Not on a Shopee page', 'error');
      
      // If auto-extracting when opening popup, display helpful message
      const commentContainer = document.createElement('div');
      commentContainer.className = 'comment-item';
      commentContainer.innerHTML = '<div class="comment-text">Please navigate to a Shopee product page to extract comments.</div>';
      commentsList.innerHTML = '';
      commentsList.appendChild(commentContainer);
      commentsContainer.classList.remove('hidden');
      return;
    }
    
    showStatus('Extracting comments...', 'success');
    
    // Execute script to get comments from the content script
    chrome.tabs.sendMessage(
      tab.id, 
      { action: "extractComments" }, 
      (response) => {
        if (chrome.runtime.lastError) {
          showStatus('Error communicating with page', 'error');
          console.error(chrome.runtime.lastError);
          return;
        }
        
        if (response && response.comments) {
          displayComments(response.comments);
        } else {
          showStatus('No comments found or extraction failed', 'error');
        }
      }
    );
  } catch (error) {
    console.error('Failed to extract comments:', error);
    showStatus('Failed to extract comments', 'error');
  }
}

// Display comments in the popup
function displayComments(comments) {
  if (!comments || comments.length === 0) {
    showStatus('No comments found', 'error');
    return;
  }
  
  // Clear previous comments
  commentsList.innerHTML = '';
  
  // Update comment count
  if (commentCount) {
    commentCount.textContent = comments.length;
  }
  
  // Add each comment to the list
  comments.forEach(comment => {
    const commentItem = document.createElement('div');
    commentItem.className = 'comment-item';
    
    const commentMeta = document.createElement('div');
    commentMeta.className = 'comment-meta';
    
    const usernameSpan = document.createElement('span');
    usernameSpan.className = comment.isCensored ? 'username censored' : 'username';
    usernameSpan.textContent = comment.username;
    
    const timeSpan = document.createElement('span');
    timeSpan.className = 'timestamp';
    timeSpan.textContent = comment.timestamp;
    
    commentMeta.appendChild(usernameSpan);
    commentMeta.appendChild(timeSpan);
    
    const commentText = document.createElement('div');
    commentText.className = 'comment-text';
    commentText.textContent = comment.comment;
    
    commentItem.appendChild(commentMeta);
    commentItem.appendChild(commentText);
    
    commentsList.appendChild(commentItem);
  });
  
  // Show the comments container
  commentsContainer.classList.remove('hidden');
  showStatus(`${comments.length} comments extracted`, 'success');
}

// Extract comments from multiple pages (navigate through pagination)
async function extractAllPages() {
  try {
    // Get the current active tab
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    if (!tab) {
      showStatus('No active tab found', 'error');
      return;
    }
    
    // Check if we're on a Shopee site
    const isShopee = tab.url.includes('shopee.');
    if (!isShopee) {
      showStatus('Not on a Shopee page', 'error');
      return;
    }
    
    // Show extraction is starting
    extractionProgress.classList.remove('hidden');
    progressBar.style.width = '0%';
    progressText.textContent = 'Preparing to extract comments...';
    showStatus('Starting multi-page extraction...', 'success');
    
    // Clear previous comments
    commentsList.innerHTML = '';
    storedComments = [];
    
    // Send message to content script to extract from multiple pages (5 pages)
    chrome.tabs.sendMessage(
      tab.id,
      { action: "extractMultiPageComments", pages: 5 },
      (response) => {
        if (chrome.runtime.lastError) {
          showStatus('Error communicating with page', 'error');
          extractionProgress.classList.add('hidden');
          console.error(chrome.runtime.lastError);
          return;
        }
        
        // Nothing to do here, updates will come through progress updates
      }
    );
    
    // Listen for progress updates
    chrome.runtime.onMessage.addListener(function progressListener(message, sender, sendResponse) {
      if (message.action === "extractionProgress") {
        // Update progress bar
        const percent = (message.currentPage / message.totalPages) * 100;
        progressBar.style.width = `${percent}%`;
        progressText.textContent = `Extracting page ${message.currentPage} of ${message.totalPages}...`;
        
        // Add comments to stored collection
        if (message.comments && message.comments.length > 0) {
          storedComments = storedComments.concat(message.comments);
          displayComments(storedComments);
        }
        
        // If complete, finalize
        if (message.complete) {
          chrome.runtime.onMessage.removeListener(progressListener);
          showStatus(`Extracted ${storedComments.length} comments from ${message.totalPages} pages`, 'success');
          extractionProgress.classList.add('hidden');
        }
      }
      return true;
    });
  } catch (error) {
    console.error('Failed to extract comments from multiple pages:', error);
    showStatus('Failed to extract comments', 'error');
    extractionProgress.classList.add('hidden');
  }
}

// Event listeners
saveButton.addEventListener('click', saveApiKey);
clearButton.addEventListener('click', clearApiKey);
extractAllButton.addEventListener('click', extractAllPages);

// Initialize popup
document.addEventListener('DOMContentLoaded', () => {
  loadApiKey();
});
