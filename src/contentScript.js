const API_BASE_URL = "http://127.0.0.1:8000";
const API_TIMEOUT_MS = 5000;

async function callTestEndpoint() {
  try {
    console.log("Sending API request to background script...");
    
    return new Promise((resolve) => {
      chrome.runtime.sendMessage(
        { action: "callAPI", endpoint: "test" },
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

function showCommentsOverlay(comments) {
  // Remove previous overlay if exists
  let logDiv = document.getElementById('shopee-comments-overlay');
  if (logDiv) logDiv.remove();

  // Create new overlay
  logDiv = document.createElement('div');
  logDiv.id = 'shopee-comments-overlay';
  logDiv.style.position = 'fixed';
  logDiv.style.bottom = '0';
  logDiv.style.left = '0';
  logDiv.style.width = '100vw';
  logDiv.style.maxHeight = '200px';
  logDiv.style.overflowY = 'auto';
  logDiv.style.background = 'rgba(0,0,0,0.8)';
  logDiv.style.color = '#0f0';
  logDiv.style.fontFamily = 'monospace';
  logDiv.style.zIndex = '999999';
  logDiv.style.fontSize = '12px';
  logDiv.style.padding = '5px';
  logDiv.innerHTML = '<b>Shopee Comments:</b><br>';

  comments.forEach((comment, idx) => {
    const div = document.createElement('div');
    div.textContent = `${idx + 1}. ${comment}`;
    logDiv.appendChild(div);
  });

  document.body.appendChild(logDiv);
  
  // Add a "loading" message for API call
  const apiLoadingDiv = document.createElement('div');
  apiLoadingDiv.id = 'api-loading';
  apiLoadingDiv.style.marginTop = '10px';
  apiLoadingDiv.style.color = '#fff';
  apiLoadingDiv.textContent = 'Connecting to API...';
  logDiv.appendChild(apiLoadingDiv);
  
  // Call the test endpoint when showing comments
  callTestEndpoint().then(result => {
    const loadingDiv = document.getElementById('api-loading');
    if (loadingDiv) loadingDiv.remove();
    
    const apiResultDiv = document.createElement('div');
    apiResultDiv.style.marginTop = '10px';
    apiResultDiv.style.color = result.error ? '#f55' : '#ff0';
    
    if (result.error) {
      apiResultDiv.innerHTML = `<b>API Error:</b> ${result.message}`;
    } else {
      apiResultDiv.textContent = `API Response: ${result.message || 'No message received'}`;
    }
    
    logDiv.appendChild(apiResultDiv);
  });
}

// Watch for changes in the comment list container
function observeShopeeComments() {
  const commentsSection = document.querySelector('.shopee-product-comment-list');
  if (!commentsSection) return;

  const observer = new MutationObserver(() => {
    const comments = extractShopeeCommentTexts();
    showCommentsOverlay(comments);
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