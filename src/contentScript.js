const API_BASE_URL = "http://127.0.0.1:8000";
const DEBOUNCE_DELAY = 500;

// Track already analyzed comments to avoid duplicate API calls and store results
let analyzedComments = new Map(); // Changed from Set to Map to store results
let isApiCallInProgress = false;
let apiCallTimer = null;

async function callTestEndpoint(comments) {
  try {
    console.log("Sending comments to background script...");
    
    return new Promise((resolve) => {
      chrome.runtime.sendMessage(
        { 
          action: "callAPI", 
          endpoint: "comments",
          data: { comments }
        },
        (response) => {
          console.log("Received response from background script:", response);
          if (response && response.success) {
            resolve(response.data);
          } else {
            resolve({ 
              message: response?.error || "Error communicating with background script", 
              error: true 
            });
          }
        }
      );
    });
  } catch (error) {
    console.error("Error in content script:", error);
    return { message: `Error: ${error.message}`, error: true };
  }
}

function extractShopeeCommentTexts() {
  return Array.from(document.querySelectorAll('div.YNedDV'))
    .map(el => el.textContent.trim());
}

function displayResultsInComments(results) {
  if (!results || !results.results || results.results.length === 0) return;
  
  try {
    // Set flag to prevent observer from responding to our DOM changes
    window.isUpdatingCommentDOM = true;
    
    const commentDivs = document.querySelectorAll('div.YNedDV');
    if (commentDivs.length !== results.results.length) {
      console.error("Comment count mismatch:", commentDivs.length, results.results.length);
      return;
    }
    
    results.results.forEach((result, idx) => {
      if (idx >= commentDivs.length) return;
      
      const commentDiv = commentDivs[idx];
      const analysisDiv = document.createElement('div');
      analysisDiv.className = 'comment-analysis';
      analysisDiv.style.marginTop = '4px';
      analysisDiv.style.padding = '4px';
      analysisDiv.style.borderRadius = '4px';
      analysisDiv.style.backgroundColor = result.is_fake ? 'rgba(255,85,85,0.1)' : 'rgba(85,255,85,0.1)';
      analysisDiv.style.border = `1px solid ${result.is_fake ? '#f55' : '#5f5'}`;
      analysisDiv.style.fontSize = '12px';
      
      analysisDiv.innerHTML = `<span style="font-weight:bold;color:${result.is_fake ? '#f55' : '#5f5'}">${result.is_fake ? 'FAKE' : 'REAL'}</span>: ${result.explanation}`;
      
      // Remove any previously added analysis
      const existingAnalysis = commentDiv.querySelector('.comment-analysis');
      if (existingAnalysis) existingAnalysis.remove();
      
      commentDiv.appendChild(analysisDiv);
    });
  } finally {
    // Always reset the flag when done
    setTimeout(() => {
      window.isUpdatingCommentDOM = false;
    }, 100);
  }
}

function showCommentsOverlay(comments) {
  // Don't process if no comments
  if (!comments.length) return;
  
  // Check if these comments have already been processed
  const commentsHash = comments.join('|');
  
  // If already analyzed, display the cached results and return
  if (analyzedComments.has(commentsHash)) {
    displayResultsInComments(analyzedComments.get(commentsHash));
    return;
  }
  
  // Don't proceed if an API call is already in progress
  if (isApiCallInProgress) return;
  
  // Mark as in progress
  isApiCallInProgress = true;
  
  // Flag to track if we're making DOM changes to prevent observer loop
  window.isUpdatingCommentDOM = true;

  // Remove previous overlay if exists
  let logDiv = document.getElementById('shopee-comments-overlay');
  if (logDiv) logDiv.remove();

  // Create new overlay for loading indication only
  logDiv = document.createElement('div');
  logDiv.id = 'shopee-comments-overlay';
  logDiv.style.position = 'fixed';
  logDiv.style.bottom = '0';
  logDiv.style.left = '0';
  logDiv.style.width = '100vw';
  logDiv.style.padding = '8px';
  logDiv.style.background = 'rgba(0,0,0,0.8)';
  logDiv.style.color = '#fff';
  logDiv.style.fontFamily = 'monospace';
  logDiv.style.zIndex = '999999';
  logDiv.style.fontSize = '12px';
  
  // Add a "loading" message for API call
  const apiLoadingDiv = document.createElement('div');
  apiLoadingDiv.id = 'api-loading';
  apiLoadingDiv.textContent = 'Analyzing comments...';
  logDiv.appendChild(apiLoadingDiv);
  
  document.body.appendChild(logDiv);
  
  // Call the API with comments
  callTestEndpoint(comments).then(result => {
    // Remove loading overlay when done
    logDiv.remove();
    isApiCallInProgress = false;
    
    if (result.error) {
      // Show error in small overlay
      const errorDiv = document.createElement('div');
      errorDiv.id = 'shopee-comments-error';
      errorDiv.style.position = 'fixed';
      errorDiv.style.bottom = '0';
      errorDiv.style.left = '0';
      errorDiv.style.padding = '8px';
      errorDiv.style.background = 'rgba(0,0,0,0.8)';
      errorDiv.style.color = '#f55';
      errorDiv.style.fontFamily = 'monospace';
      errorDiv.style.zIndex = '999999';
      errorDiv.style.fontSize = '12px';
      errorDiv.innerHTML = `<b>Error:</b> ${result.message}`;
      document.body.appendChild(errorDiv);
      
      // Remove error after 5 seconds
      setTimeout(() => {
        if (errorDiv.parentNode) errorDiv.remove();
      }, 5000);
    } else {
      // Store results for reuse
      analyzedComments.set(commentsHash, result);
      // Display results in the comment divs
      displayResultsInComments(result);
    }
  });
}

// Debounced function to process comments
function debouncedProcessComments() {
  if (apiCallTimer) clearTimeout(apiCallTimer);
  
  apiCallTimer = setTimeout(() => {
    const comments = extractShopeeCommentTexts();
    showCommentsOverlay(comments);
  }, DEBOUNCE_DELAY);
}

// Watch for changes in the comment list container
function observeShopeeComments() {
  const commentsSection = document.querySelector('.shopee-product-comment-list');
  if (!commentsSection) return;

  const observer = new MutationObserver(() => {
    // Skip if we're the ones updating the DOM
    if (window.isUpdatingCommentDOM) return;
    
    debouncedProcessComments();
  });

  // Observe subtree for any change (new comments, page change, etc)
  observer.observe(commentsSection, { childList: true, subtree: true });

  // Initial run
  const comments = extractShopeeCommentTexts();
  showCommentsOverlay(comments);
}

// Set up URL change detection outside of waitForCommentsSection
let currentUrl = window.location.href;

function checkUrlChange() {
  if (currentUrl !== window.location.href) {
    currentUrl = window.location.href;
    // Reset tracking when URL changes
    analyzedComments.clear(); // Keep this clear to reset tracking when URL changes
    isApiCallInProgress = false;
    if (apiCallTimer) clearTimeout(apiCallTimer);
    waitForCommentsSection();
  }
}

// Poll for URL changes every 500ms (since SPAs can change URL without triggering events)
setInterval(checkUrlChange, 500);

function waitForCommentsSection() {
  // Remove any existing overlay when changing products
  const existingOverlay = document.getElementById('shopee-comments-overlay');
  if (existingOverlay) existingOverlay.remove();
  
  const observer = new MutationObserver(() => {
    const section = document.querySelector('.shopee-product-comment-list');
    if (section) {
      observeShopeeComments();
      observer.disconnect();
    }
  });

  if (document.querySelector('.shopee-product-comment-list')) {
    observeShopeeComments();
    return;
  }

  observer.observe(document.body, { childList: true, subtree: true });
}

// Start the watcher
waitForCommentsSection();