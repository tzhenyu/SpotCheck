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

// Function to analyze comments using DirectGeminiAPI
async function analyzeCommentsWithGemini(comments, productName = null) {
  try {
    console.log("Analyzing comments with Gemini API...");
    
    // Check for stored API key
    let apiKey = await window.DirectGeminiAPI.getStoredApiKey();
    
    // If no API key is found, prompt the user
    if (!apiKey) {
      apiKey = await window.DirectGeminiAPI.promptForApiKey();
      if (!apiKey) {
        return {
          error: true,
          message: "API key is required for Gemini analysis."
        };
      }
    }
    
    // Call Gemini API to analyze comments
    const result = await window.DirectGeminiAPI.analyzeCommentsDirectly(comments, apiKey, productName);
    return result;
  } catch (error) {
    console.error("Error analyzing with Gemini:", error);
    return { message: `Gemini Analysis Error: ${error.message}`, error: true };
  }
}

function displayResultsInComments(results) {
  if (!results || !results.results || results.results.length === 0) return;
  
  try {
    // Set flag to prevent observer from responding to our DOM changes
    window.isUpdatingCommentDOM = true;
    
    const commentDivs = document.querySelectorAll(ShopeeHelpers.SELECTORS.COMMENT_DIV);
    if (commentDivs.length !== results.results.length) {
      console.error("Comment count mismatch:", commentDivs.length, results.results.length);
      return;
    }
    
    results.results.forEach((result, idx) => {
      if (idx >= commentDivs.length) return;
      
      const commentDiv = commentDivs[idx];
      const analysisDiv = ShopeeHelpers.createAnalysisDiv(result);
      
      // Remove any previously added analysis
      const existingAnalysis = commentDiv.querySelector(`.${ShopeeHelpers.DOM_CLASSES.COMMENT_ANALYSIS}`);
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

  // Create new overlay for loading indication using helper
  logDiv = ShopeeHelpers.createLoadingOverlay();
  document.body.appendChild(logDiv);
  
  // Get product name
  let productName = null;
  const productNameElement = document.querySelector('h1.vR6K3w');
  if (productNameElement) {
    productName = productNameElement.textContent.trim();
  }
  
  // Call Gemini API instead of server API
  analyzeCommentsWithGemini(comments, productName).then(result => {
    // Remove loading overlay when done
    logDiv.remove();
    isApiCallInProgress = false;
    
    if (result.error) {
      // Check if it's an API key issue
      if (result.message.includes("API key")) {
        // Ask user if they want to set API key
        if (confirm("Gemini API key is missing or invalid. Would you like to set your API key now?")) {
          window.DirectGeminiAPI.promptForApiKey().then(newKey => {
            if (newKey) {
              // Try again with the new key
              isApiCallInProgress = false;
              showCommentsOverlay(comments);
            }
          });
        }
      } else {
        // Show error in small overlay using helper
        const errorDiv = ShopeeHelpers.createErrorOverlay(result.message);
        document.body.appendChild(errorDiv);
        
        // Remove error after 5 seconds
        setTimeout(() => {
          if (errorDiv.parentNode) errorDiv.remove();
        }, 5000);
      }
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
    const comments = ShopeeHelpers.extractShopeeCommentTexts();
    showCommentsOverlay(comments);
  }, DEBOUNCE_DELAY);
}

// Watch for changes in the comment list container
function observeShopeeComments() {
  const commentsSection = document.querySelector(ShopeeHelpers.SELECTORS.COMMENT_LIST);
  if (!commentsSection) return;

  const observer = new MutationObserver(() => {
    // Skip if we're the ones updating the DOM
    if (window.isUpdatingCommentDOM) return;
    
    debouncedProcessComments();
  });

  // Observe subtree for any change (new comments, page change, etc)
  observer.observe(commentsSection, { childList: true, subtree: true });

  // Initial run
  const comments = ShopeeHelpers.extractShopeeCommentTexts();
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
    const section = document.querySelector(ShopeeHelpers.SELECTORS.COMMENT_LIST);
    if (section) {
      observeShopeeComments();
      observer.disconnect();
    }
  });

  if (document.querySelector(ShopeeHelpers.SELECTORS.COMMENT_LIST)) {
    observeShopeeComments();
    return;
  }

  observer.observe(document.body, { childList: true, subtree: true });
}

// Start the watcher
waitForCommentsSection();