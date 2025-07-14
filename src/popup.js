/**
 * Popup script for Shopee Comment Extractor
 * Handles API key management and comment extraction through the popup UI
 */

const API_KEY_STORAGE_KEY = "gemini_api_key";
const BACKEND_API_URL = "http://localhost:8001";
// Auto features are always enabled (no toggles)
const AUTO_EXTRACT_STORAGE_KEY = "auto_extract_enabled";
const AUTO_UPLOAD_STORAGE_KEY = "auto_upload_enabled";

// DOM Elements
const apiKeyInput = document.getElementById('gemini-api-key');
const statusMessage = document.getElementById('status-message');
const commentsContainer = document.getElementById('comments-container');
const commentsList = document.getElementById('comments-list');
const extractionProgress = document.getElementById('extraction-progress');
const progressBar = document.getElementById('progress-bar');
const progressText = document.getElementById('progress-text');
const commentCount = document.getElementById('comment-count');

// Stored comments
let storedComments = [];

// Global error handler for logging
window.onerror = function(message, source, lineno, colno, error) {
  alert('JS Error: ' + message + ' at ' + source + ':' + lineno);
  return false;
};
console.log('popup.js loaded at', new Date().toISOString());

// Load API key from storage when popup opens
async function loadApiKey() {
  try {
    const result = await new Promise(resolve => {
      chrome.storage.local.get([API_KEY_STORAGE_KEY], resolve);
    });
    alert('Loaded API key from storage: ' + result[API_KEY_STORAGE_KEY]);
    console.log('Loaded API key from storage:', result[API_KEY_STORAGE_KEY]);
    if (result[API_KEY_STORAGE_KEY]) {
      apiKeyInput.value = result[API_KEY_STORAGE_KEY];
      showStatus('Gemini API key loaded', 'success');
      apiKeyInput.classList.add('stored');
      apiKeyInput.setAttribute('title', result[API_KEY_STORAGE_KEY]);
    } else {
      // Do not clear the input if user has typed something
      if (!apiKeyInput.value) {
        apiKeyInput.value = '';
        apiKeyInput.classList.remove('stored');
        apiKeyInput.removeAttribute('title');
      }
    }
    
    // Get the current active tab to check if we're on Shopee
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0] && tabs[0].url && tabs[0].url.includes('shopee.')) {
        // Check if we need to manually trigger extraction or just display already processed comments
        chrome.tabs.sendMessage(tabs[0].id, { action: "getProcessedComments" }, (response) => {
          if (chrome.runtime.lastError) {
            console.error("Error communicating with content script:", chrome.runtime.lastError);
            extractComments();
            return;
          }
          
          // If we have cached comments from auto-extraction, display them
          if (response && response.cachedComments && response.cachedComments.length > 0) {
            console.log("Using cached comments from auto-extraction");
            displayComments(response.cachedComments, false);
          } 
          // If there are processed comments on the page already, don't extract again
          else if (response && response.hasProcessedComments) {
            console.log("Comments already processed on this page");
          } 
          // Otherwise extract comments now
          else {
            extractComments();
          }
        });
      } else {
        // Clear comments when not on a Shopee page
        clearComments();
        showStatus('Not on a Shopee page', 'error');
      }
    });
  } catch (error) {
    alert('Failed to load API key: ' + error);
    console.error('Failed to load API key:', error);
    showStatus('Failed to load API key', 'error');
    apiKeyInput.classList.remove('stored');
    apiKeyInput.removeAttribute('title');
  }
}

// Set auto-extract to always be enabled
function ensureAutoFeaturesEnabled() {
  try {
    // Always set both auto features to true
    chrome.storage.local.set({ 
      [AUTO_EXTRACT_STORAGE_KEY]: true,
      [AUTO_UPLOAD_STORAGE_KEY]: true 
    }, () => {
      console.log('Auto-extract and auto-upload features are enabled');
    });
  } catch (error) {
    console.error('Error ensuring auto features are enabled:', error);
  }
}

// Clear stored comments and reset UI
function clearComments() {
  storedComments = [];
  commentsList.innerHTML = '';
  if (commentCount) {
    commentCount.textContent = '0';
  }
  
  // Add instruction message when no comments
  const commentContainer = document.createElement('div');
  commentContainer.className = 'comment-item';
  commentContainer.innerHTML = '<div class="comment-text">Please navigate to a Shopee product page to extract comments.</div>';
  commentsList.appendChild(commentContainer);
  commentsContainer.classList.remove('hidden');
}

// Save API key to storage
function saveApiKey() {
  const apiKey = apiKeyInput.value.trim();
  try {
    alert('Saving API key: ' + apiKey);
    console.log('Saving API key:', apiKey);
    if (!apiKey) {
      showStatus('Please enter an API key', 'error');
      apiKeyInput.classList.remove('stored');
      apiKeyInput.removeAttribute('title');
      return;
    }
    chrome.storage.local.set({ [API_KEY_STORAGE_KEY]: apiKey }, () => {
      console.log('API key saved to storage:', apiKey);
      apiKeyInput.value = apiKey;
      showStatus('Gemini API key saved!', 'success');
      apiKeyInput.classList.add('stored');
      apiKeyInput.setAttribute('title', apiKey);
    });
  } catch (error) {
    alert('Failed to save API key: ' + error);
    console.error('Failed to save API key:', error);
    showStatus('Failed to save API key', 'error');
    apiKeyInput.classList.remove('stored');
    apiKeyInput.removeAttribute('title');
  }
}

// Clear API key
function clearApiKey() {
  apiKeyInput.value = '';
  try {
    chrome.storage.local.remove([API_KEY_STORAGE_KEY], () => {
      showStatus('Gemini API key cleared', 'success');
      apiKeyInput.classList.remove('stored');
      apiKeyInput.removeAttribute('title');
    });
  } catch (error) {
    console.error('Failed to clear API key:', error);
    showStatus('Failed to clear API key', 'error');
    apiKeyInput.classList.remove('stored');
    apiKeyInput.removeAttribute('title');
  }
}

// Display status message
function showStatus(message, type) {
  if (!statusMessage) return;
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
          // Always reset stored comments when doing a single page extraction
          storedComments = [];
          displayComments(response.comments, false);
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
    
    // Clear previous comments and DOM
    commentsList.innerHTML = '';
    storedComments = [];
    commentCount.textContent = '0';
    
    // Send message to content script to extract from multiple pages (30 pages)
    chrome.tabs.sendMessage(
      tab.id,
      { action: "extractMultiPageComments", pages: 30 },
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
    
    // Track total unique comments across all pages
    let totalUniqueComments = new Set();
    
    // Listen for progress updates
    chrome.runtime.onMessage.addListener(function progressListener(message, sender, sendResponse) {
      if (message.action === "extractionProgress") {
        // Update progress bar
        const percent = (message.currentPage / message.totalPages) * 100;
        progressBar.style.width = `${percent}%`;
        progressText.textContent = `Extracting page ${message.currentPage} of ${message.totalPages}...`;
        
        // Add comments to stored collection
        if (message.comments && message.comments.length > 0) {
          // Keep track of unique comments by ID
          if (message.currentPage === 1) {
            // For first page, reset everything
            storedComments = [];
            commentsList.innerHTML = '';
            totalUniqueComments = new Set();
          }
          
          // Filter out any duplicate comments that might be returned
          const uniqueNewComments = message.comments.filter(comment => {
            if (totalUniqueComments.has(comment.id)) {
              return false; // Skip if we've already seen this comment
            }
            totalUniqueComments.add(comment.id);
            return true;
          });
          
          // Only display actually new comments
          if (uniqueNewComments.length > 0) {
            storedComments = storedComments.concat(uniqueNewComments);
            displayComments(uniqueNewComments, true);
          }
        }
        
        // If complete, finalize
        if (message.complete) {
          chrome.runtime.onMessage.removeListener(progressListener);
          showStatus(`Extracted ${storedComments.length} comments from ${message.totalPages} pages`, 'success');
          extractionProgress.classList.add('hidden');
          
          // Ensure counter is accurate
          if (commentCount) {
            commentCount.textContent = storedComments.length;
          }
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

// Display comments in the popup
function displayComments(comments, append = false) {
  if (!comments || comments.length === 0) {
    showStatus('No comments found', 'error');
    return;
  }
  
  // Clear previous comments if not appending
  if (!append) {
    commentsList.innerHTML = '';
    storedComments = comments.slice(); // Make a copy of the comments
  } else {
    // When appending, don't modify storedComments array here
    // It's now handled in the extractAllPages function
  }
  
  // Update comment count
  if (commentCount) {
    commentCount.textContent = storedComments.length;
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
    
    // Create star rating element if available
    if (comment.starRating !== undefined) {
      const ratingSpan = document.createElement('span');
      ratingSpan.className = 'star-rating';
      const starIcon = document.createElement('span');
      starIcon.className = 'star-icon';
      starIcon.textContent = '★';
      ratingSpan.appendChild(starIcon);
      ratingSpan.appendChild(document.createTextNode(comment.starRating));
      usernameSpan.appendChild(document.createTextNode(' '));
      usernameSpan.appendChild(ratingSpan);
    }
    
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
  
  // Only show status for non-append operations (initial loads)
  if (!append) {
    showStatus(`${comments.length} comments extracted`, 'success');
  }
}

// Function to download comments as CSV file
async function downloadCommentsCSV() {
  if (!storedComments || storedComments.length === 0) {
    showStatus('No comments to download', 'error');
    return;
  }
  
  try {
    // Get the current active tab to get the product URL
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const sourceUrl = tab ? tab.url : 'Unknown Source';
    
    // Get product name from title if possible
    const productName = tab && tab.title ? tab.title.replace(/ - Shopee.*$/, '') : 'Unknown Product';
    
    // Create CSV header
    let csvContent = "Comment,Username,Rating,Source,Product,Page Timestamp\n";
    
    // Add comment data
    storedComments.forEach(comment => {
      // Escape quotes in the comment text and product name
      const escapedComment = comment.comment.replace(/"/g, '""');
      const escapedProductName = productName.replace(/"/g, '""');
      const rating = comment.starRating !== undefined ? comment.starRating : '';
      
      // Use the directly extracted timestamp and variation properties if available
      let timestampForCSV = comment.timestampOnly || '';
      
      // If the new properties aren't available, fall back to the previous extraction method
      if (!timestampForCSV && comment.timestamp && comment.timestamp.includes('|')) {
        const delimiterIndex = comment.timestamp.indexOf('|');
        if (delimiterIndex !== -1) {
          timestampForCSV = comment.timestamp.substring(0, delimiterIndex).trim();
        }
      }
      
      // Format CSV row and escape values with quotes to handle commas within fields
      csvContent += `"${escapedComment}","${comment.username}","${rating}","${sourceUrl}","${escapedProductName}","${timestampForCSV}"\n`;
    });
    
    // Create blob and download link
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const downloadLink = document.createElement('a');
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    
    // Set download attributes
    downloadLink.href = url;
    downloadLink.setAttribute('download', `shopee-comments-${timestamp}.csv`);
    
    // Append link, trigger download, then clean up
    document.body.appendChild(downloadLink);
    downloadLink.click();
    document.body.removeChild(downloadLink);
    
    showStatus(`${storedComments.length} comments downloaded as CSV`, 'success');
  } catch (error) {
    console.error('Error downloading CSV:', error);
    showStatus('Failed to download comments', 'error');
  }
}

// Function to upload comments to SQL server via FastAPI
async function uploadCommentsToSql() {
  if (!storedComments || storedComments.length === 0) {
    showStatus('No comments to download', 'error');
    return;
  }
  try {
    showStatus('Uploading comments to server...', 'success');
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const sourceUrl = tab ? tab.url : 'Unknown Source';
    const productName = tab && tab.title ? tab.title.replace(/ - Shopee.*$/, '') : 'Unknown Product';
    const geminiApiKey = await new Promise(resolve => {
      chrome.storage.local.get([API_KEY_STORAGE_KEY], (result) => {
        const key = result[API_KEY_STORAGE_KEY] || apiKeyInput.value.trim();
        alert('API key used for upload: ' + key);
        console.log('API key used for upload:', key);
        resolve(key);
      });
    });
    if (!geminiApiKey) {
      showStatus('Please enter your Gemini API key', 'error');
      return;
    }

    const commentsForUpload = storedComments.map(comment => {
      return {
        comment: comment.comment,
        username: comment.username,
        rating: comment.starRating !== undefined ? comment.starRating : '',
        source: sourceUrl,
        product: productName,
        timestamp: comment.timestampOnly || comment.timestamp || ''
      };
    });
    const payload = {
      comments: commentsForUpload.map(c => c.comment),
      metadata: commentsForUpload,
      product: productName,
      gemini_api_key: geminiApiKey
    };
    console.log('Payload to backend:', {
      ...payload,
      gemini_api_key: geminiApiKey ? '***API_KEY_HIDDEN***' : null // Hide API key in logs for security
    });
    try {
      const response = await fetch(`${BACKEND_API_URL}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      
      if (response.ok) {
        const responseData = await response.json();
        console.log('Backend response:', responseData);
        
        // Check if analysis was scheduled
        if (responseData.analysis_scheduled) {
          showStatus('Comments uploaded and analysis scheduled!', 'success');
        } else {
          showStatus('Comments uploaded successfully!', 'success');
        }
      } else {
        const errorText = await response.text();
        console.error('Backend error:', errorText);
        showStatus(`Upload failed: ${response.status} ${response.statusText}`, 'error');
      }
    } catch (error) {
      console.error('Network error during upload:', error);
      showStatus(`Upload failed: ${error.message}`, 'error');
    }
  } catch (error) {
    showStatus('Failed to upload comments', 'error');
  }
}

// Function to update displayed comments with analysis results
// Modified to handle batch processing with offset
function updateCommentsWithAnalysis(results, offset = 0) {
  if (!results || results.length === 0) return;
  
  // Find all comment items in the DOM
  const commentItems = document.querySelectorAll('.comment-item');
  
  // Match results with displayed comments
  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    // Get the correct comment based on offset
    const commentIndex = offset + i;
    if (commentIndex >= commentItems.length) continue;
    
    const commentItem = commentItems[commentIndex];
    
    // Create or update analysis info
    let analysisDiv = commentItem.querySelector('.analysis-info');
    if (!analysisDiv) {
      analysisDiv = document.createElement('div');
      analysisDiv.className = 'analysis-info';
      commentItem.appendChild(analysisDiv);
    }
    
    // Set analysis content
    const isFakeClass = result.is_fake ? 'fake-comment' : 'real-comment';
    analysisDiv.innerHTML = `
      <div class="analysis-result ${isFakeClass}">
        <strong>${result.is_fake ? '⚠️ FAKE' : '✓ REAL'}</strong>: 
        ${result.explanation}
      </div>
    `;
    
    // Add corresponding styling
    if (result.is_fake) {
      commentItem.classList.add('fake-comment-item');
    } else {
      commentItem.classList.add('real-comment-item');
    }
  }
  
  // Add CSS for these new elements if not already added
  if (!document.getElementById('analysis-styles')) {
    const style = document.createElement('style');
    style.id = 'analysis-styles';
    style.textContent = `
      .analysis-info {
        margin-top: 8px;
        padding-top: 8px;
        border-top: 1px dashed #ddd;
        font-size: 13px;
      }
      .fake-comment {
        color: #d32f2f;
      }
      .real-comment {
        color: #388e3c;
      }
      .fake-comment-item {
        border-left: 3px solid #d32f2f;
      }
      .real-comment-item {
        border-left: 3px solid #388e3c;
      }
    `;
    document.head.appendChild(style);
  }
}

// Nothing needed to replace the removed toggle functions

// Event listeners
document.addEventListener('DOMContentLoaded', () => {
  const saveButton = document.getElementById('save-btn');
  const clearButton = document.getElementById('clear-btn');
  const extractAllButton = document.getElementById('extract-all-btn');
  const downloadCsvButton = document.getElementById('download-csv-btn');
  const uploadSqlButton = document.getElementById('upload-sql-btn');

  if (saveButton) saveButton.addEventListener('click', saveApiKey);
  if (clearButton) clearButton.addEventListener('click', clearApiKey);
  if (extractAllButton) extractAllButton.addEventListener('click', extractAllPages);
  if (downloadCsvButton) downloadCsvButton.addEventListener('click', () => downloadCommentsCSV());
  if (uploadSqlButton) uploadSqlButton.addEventListener('click', uploadCommentsToSql);

  loadApiKey();
  ensureAutoFeaturesEnabled();
  chrome.runtime.onMessage.addEventListener && chrome.runtime.onMessage.addEventListener((message) => {
    if (message.action === "urlChanged") {
      clearComments();
      showStatus('Page changed, comments cleared', 'success');
    }
  });
});