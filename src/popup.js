/**
 * Popup script for Shopee Comment Extractor
 * Handles API key management and comment extraction through the popup UI
 */

const API_KEY_STORAGE_KEY = "gemini_api_key";
// Add the backend API URL constant
const BACKEND_API_URL = "http://localhost:8000";
// Auto-extract setting storage key
const AUTO_EXTRACT_STORAGE_KEY = "auto_extract_enabled";
// Auto-upload setting storage key
const AUTO_UPLOAD_STORAGE_KEY = "auto_upload_enabled";

// DOM Elements
const apiKeyInput = document.getElementById('api-key');
const saveButton = document.getElementById('save-btn');
const clearButton = document.getElementById('clear-btn');
const extractAllButton = document.getElementById('extract-all-btn');
const downloadCsvButton = document.getElementById('download-csv-btn');
const statusMessage = document.getElementById('status-message');
const commentsContainer = document.getElementById('comments-container');
const commentsList = document.getElementById('comments-list');
const extractionProgress = document.getElementById('extraction-progress');
const progressBar = document.getElementById('progress-bar');
const progressText = document.getElementById('progress-text');
const commentCount = document.getElementById('comment-count');
const uploadSqlButton = document.getElementById('upload-sql-btn');
const autoExtractToggle = document.getElementById('auto-extract-toggle');
const autoUploadToggle = document.getElementById('auto-upload-toggle');

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
    });
  } catch (error) {
    console.error('Failed to load API key:', error);
    showStatus('Failed to load API key', 'error');
  }
}

// Load auto-extract setting from storage
function loadAutoExtractSetting() {
  try {
    chrome.storage.local.get([AUTO_EXTRACT_STORAGE_KEY], (result) => {
      // Default to true if not set (null check is important)
      const isEnabled = result[AUTO_EXTRACT_STORAGE_KEY] !== false;
      autoExtractToggle.checked = isEnabled;
    });
  } catch (error) {
    console.error('Failed to load auto-extract setting:', error);
    // Default to true if there's an error
    autoExtractToggle.checked = true;
  }
}

// Load auto-upload setting from storage
function loadAutoUploadSetting() {
  try {
    chrome.storage.local.get([AUTO_UPLOAD_STORAGE_KEY], (result) => {
      // Default to true if not set (null check is important)
      const isEnabled = result[AUTO_UPLOAD_STORAGE_KEY] !== false;
      autoUploadToggle.checked = isEnabled;
    });
  } catch (error) {
    console.error('Failed to load auto-upload setting:', error);
    // Default to true if there's an error
    autoUploadToggle.checked = true;
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
    
    // Get the current active tab to get the product URL and name
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const sourceUrl = tab ? tab.url : 'Unknown Source';
    const productName = tab && tab.title ? tab.title.replace(/ - Shopee.*$/, '') : 'Unknown Product';
    
    // Prepare complete data for upload with all fields for all comments
    const commentsForUpload = storedComments.map(comment => {
      // Use same logic as downloadCommentsCSV
      const rating = comment.starRating !== undefined ? comment.starRating : '';
      
      // Use the directly extracted timestamp properties if available
      let timestampForCSV = comment.timestampOnly || '';
      
      // If the new properties aren't available, fall back to the previous extraction method
      if (!timestampForCSV && comment.timestamp && comment.timestamp.includes('|')) {
        const delimiterIndex = comment.timestamp.indexOf('|');
        if (delimiterIndex !== -1) {
          timestampForCSV = comment.timestamp.substring(0, delimiterIndex).trim();
        }
      }
      
      return {
        comment: comment.comment,
        username: comment.username,
        rating: rating,
        source: sourceUrl,
        product: productName,
        timestamp: timestampForCSV
      };
    });
    
    // We'll use a batch size to avoid overloading the server
    const BATCH_SIZE = 100;
    let processedCount = 0;
    
    // Process in batches if we have many comments
    for (let i = 0; i < commentsForUpload.length; i += BATCH_SIZE) {
      const batchComments = commentsForUpload.slice(i, i + BATCH_SIZE);
      
      // Update progress for large uploads
      if (commentsForUpload.length > BATCH_SIZE) {
        showStatus(`Uploading batch ${Math.floor(i/BATCH_SIZE) + 1}/${Math.ceil(commentsForUpload.length/BATCH_SIZE)}...`, 'success');
      }
      
      // Send data to FastAPI backend
      const response = await fetch(`${BACKEND_API_URL}/comments`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          comments: batchComments.map(c => c.comment),
          metadata: batchComments
        })
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! Status: ${response.status}`);
      }
      
      const result = await response.json();
      
      // Check for server-side errors
      if (result.error) {
        throw new Error(result.error);
      }
      
      // Track progress
      processedCount += batchComments.length;
    }
    
    showStatus(`Successfully uploaded ${commentsForUpload.length} comments to database`, 'success');
  } catch (error) {
    console.error('Error uploading comments:', error);
    showStatus(`Upload failed: ${error.message}`, 'error');
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

// Save auto-extract setting to storage and notify content scripts
function saveAutoExtractSetting(isEnabled) {
  try {
    chrome.storage.local.set({ [AUTO_EXTRACT_STORAGE_KEY]: isEnabled }, () => {
      console.log(`Auto-extract ${isEnabled ? 'enabled' : 'disabled'}`);
      
      // Notify any active content scripts about the setting change
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0] && tabs[0].url && tabs[0].url.includes('shopee.')) {
          try {
            chrome.tabs.sendMessage(
              tabs[0].id,
              { action: "updateAutoExtractSetting", isEnabled: isEnabled },
              (response) => {
                if (chrome.runtime.lastError) {
                  console.log("Content script not ready for setting update");
                }
              }
            );
          } catch (error) {
            console.error('Error notifying content script:', error);
          }
        }
      });
    });
  } catch (error) {
    console.error('Failed to save auto-extract setting:', error);
  }
}

// Save auto-upload setting to storage and notify background script
function saveAutoUploadSetting(isEnabled) {
  try {
    chrome.storage.local.set({ [AUTO_UPLOAD_STORAGE_KEY]: isEnabled }, () => {
      console.log(`Auto-upload ${isEnabled ? 'enabled' : 'disabled'}`);
      
      // Notify background script about the setting change
      chrome.runtime.sendMessage(
        { action: "updateAutoUploadSetting", isEnabled: isEnabled },
        (response) => {
          if (chrome.runtime.lastError) {
            console.log("Background script not ready for setting update");
          }
        }
      );
    });
  } catch (error) {
    console.error('Failed to save auto-upload setting:', error);
  }
}

// Event listeners
saveButton.addEventListener('click', saveApiKey);
clearButton.addEventListener('click', clearApiKey);
extractAllButton.addEventListener('click', extractAllPages);
downloadCsvButton.addEventListener('click', () => downloadCommentsCSV());
uploadSqlButton.addEventListener('click', uploadCommentsToSql);
autoExtractToggle.addEventListener('change', (e) => {
  saveAutoExtractSetting(e.target.checked);
});
autoUploadToggle.addEventListener('change', (e) => {
  saveAutoUploadSetting(e.target.checked);
});

// Initialize popup
document.addEventListener('DOMContentLoaded', () => {
  loadApiKey();
  loadAutoExtractSetting();
  
  // Listen for URL change messages from background script
  chrome.runtime.onMessage.addListener((message) => {
    if (message.action === "urlChanged") {
      clearComments();
      showStatus('Page changed, comments cleared', 'success');
    }
  });
});
