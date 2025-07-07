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
const downloadCsvButton = document.getElementById('download-csv-btn');
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
    storedComments = storedComments.concat(comments);
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
    
    // Listen for progress updates
    chrome.runtime.onMessage.addListener(function progressListener(message, sender, sendResponse) {
      if (message.action === "extractionProgress") {
        // Update progress bar
        const percent = (message.currentPage / message.totalPages) * 100;
        progressBar.style.width = `${percent}%`;
        progressText.textContent = `Extracting page ${message.currentPage} of ${message.totalPages}...`;
        
        // Add comments to stored collection
        if (message.comments && message.comments.length > 0) {
          // Display with append=true for page after the first one
          const isFirstPage = message.currentPage === 1;
          displayComments(message.comments, !isFirstPage);
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

// Event listeners
saveButton.addEventListener('click', saveApiKey);
clearButton.addEventListener('click', clearApiKey);
extractAllButton.addEventListener('click', extractAllPages);
downloadCsvButton.addEventListener('click', () => downloadCommentsCSV());

// Initialize popup
document.addEventListener('DOMContentLoaded', () => {
  loadApiKey();
});
