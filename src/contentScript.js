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
    // Give the DOM a moment to fully update (especially for pagination)
    setTimeout(() => {
      const comments = ShopeeHelpers.extractShopeeCommentTexts();
      if (comments && comments.length > 0) {
        console.log(`Processing ${comments.length} comments after pagination or DOM change`);
        showCommentsOverlay(comments);
      } else {
        console.log('No comments found to process');
      }
    }, 200); // Small additional delay for pagination rendering
  }, DEBOUNCE_DELAY);
}

// Watch for changes in the comment list container
function observeShopeeComments() {
  const commentsSection = document.querySelector(ShopeeHelpers.SELECTORS.COMMENT_LIST);
  if (!commentsSection) return;

  // Set up pagination observer
  const paginationObserver = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.attributeName === 'class' && 
          (mutation.target.classList.contains('shopee-button-solid--primary') || 
           mutation.target.closest('.shopee-page-controller'))) {
        console.log('Pagination change detected');
        debouncedProcessComments();
        break;
      }
    }
  });
  
  // Find pagination container and observe it if it exists
  const paginationContainer = document.querySelector('.shopee-page-controller');
  if (paginationContainer) {
    paginationObserver.observe(paginationContainer, { 
      childList: true, 
      subtree: true, 
      attributes: true,
      attributeFilter: ['class']
    });
  }

  // Also add click event listeners to pagination buttons
  document.addEventListener('click', (event) => {
    // Check if the clicked element is a pagination button or inside one
    const isPaginationButton = event.target.closest('.shopee-page-controller') || 
                              event.target.matches('.shopee-icon-button--right') || 
                              event.target.matches('.shopee-icon-button--left');
    
    if (isPaginationButton) {
      console.log('Pagination button clicked');
      // Add a slight delay to let the page render new comments
      setTimeout(() => debouncedProcessComments(), 500);
    }
  }, true);

  // Standard DOM mutation observer for the comments section
  const commentObserver = new MutationObserver(() => {
    // Skip if we're the ones updating the DOM
    if (window.isUpdatingCommentDOM) return;
    
    debouncedProcessComments();
  });

  // Observe subtree for any change (new comments, page change, etc)
  commentObserver.observe(commentsSection, { childList: true, subtree: true });

  // Initial run
  const comments = ShopeeHelpers.extractShopeeCommentTexts();
  showCommentsOverlay(comments);
}

// Set up URL change detection outside of waitForCommentsSection
let currentUrl = window.location.href;
let currentPaginationPage = '1'; // Track the current pagination page

function checkUrlChange() {
  if (currentUrl !== window.location.href) {
    currentUrl = window.location.href;
    // Reset tracking when URL changes
    analyzedComments.clear(); // Keep this clear to reset tracking when URL changes
    isApiCallInProgress = false;
    if (apiCallTimer) clearTimeout(apiCallTimer);
    waitForCommentsSection();
  }
  
  // Check for pagination changes
  checkPaginationChange();
}

// Check if pagination has changed
function checkPaginationChange() {
  try {
    // Try to find the active pagination button
    const activePaginationElement = document.querySelector('.shopee-page-controller > .shopee-button-solid--primary');
    if (activePaginationElement) {
      const currentPage = activePaginationElement.textContent.trim();
      
      // If the page number changed, process comments again
      if (currentPage !== currentPaginationPage) {
        console.log(`Pagination changed from ${currentPaginationPage} to ${currentPage}`);
        currentPaginationPage = currentPage;
        
        // Process comments with a delay to allow the page to render
        setTimeout(() => {
          if (isAutoExtractEnabled) {
            debouncedProcessComments();
          }
        }, 500);
      }
    }
  } catch (error) {
    console.error('Error checking pagination:', error);
  }
}

// Poll for URL and pagination changes every 500ms (since SPAs can change without triggering events)
setInterval(checkUrlChange, 500);

function waitForCommentsSection() {
  // Remove any existing overlay when changing products
  const existingOverlay = document.getElementById('shopee-comments-overlay');
  if (existingOverlay) existingOverlay.remove();
  
  // Reset pagination tracking
  currentPaginationPage = '1';
  
  const observer = new MutationObserver(() => {
    const section = document.querySelector(ShopeeHelpers.SELECTORS.COMMENT_LIST);
    if (section) {
      // Make sure any pending API calls are reset
      isApiCallInProgress = false;
      if (apiCallTimer) clearTimeout(apiCallTimer);
      
      // Set up observers for comments and pagination
      observeShopeeComments();
      
      // Auto-extract comments when section is found if setting is enabled
      if (isAutoExtractEnabled) {
        // Give a moment for the page to fully render
        setTimeout(() => debouncedProcessComments(), 300);
      }
      
      observer.disconnect();
    }
  });

  if (document.querySelector(ShopeeHelpers.SELECTORS.COMMENT_LIST)) {
    // Make sure any pending API calls are reset
    isApiCallInProgress = false;
    if (apiCallTimer) clearTimeout(apiCallTimer);
    
    observeShopeeComments();
    
    // Auto-extract comments if section is already on the page and setting is enabled
    if (isAutoExtractEnabled) {
      debouncedProcessComments();
    }
    
    return;
  }

  observer.observe(document.body, { childList: true, subtree: true });
}

// Auto-extract is now always enabled by default
let isAutoExtractEnabled = true;

// Listen for messages from popup or background script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "extractComments") {
    try {
      // Use CommentExtractor if available, otherwise fallback to basic extraction
      if (window.CommentExtractor) {
        // Handle async extraction
        window.CommentExtractor.extractAllComments(false).then(extractedComments => {
          sendResponse({ comments: extractedComments });
        }).catch(error => {
          console.error("Error extracting comments:", error);
          sendResponse({ error: true, message: error.message });
        });
      } else if (window.ShopeeHelpers) {
        // Fallback to synchronous method
        const extractedComments = window.ShopeeHelpers.extractDetailedCommentData();
        sendResponse({ comments: extractedComments });
      } else {
        console.error("Comment extraction tools not available");
        sendResponse({ error: true, message: "Comment extraction tools not available" });
      }
    } catch (error) {
      console.error("Error extracting comments:", error);
      sendResponse({ error: true, message: error.message });
    }
    return true; // Keep the message channel open for async response
  } else if (request.action === "autoExtractComments") {
    // Auto extraction triggered by background script
    console.log("Auto extraction triggered");
    if (isAutoExtractEnabled) {
      // Process comments using existing functionality
      debouncedProcessComments();
    } else {
      console.log("Auto-extraction disabled, skipping");
    }
  } else if (request.action === "getProcessedComments") {
    // Check if we have already processed comments on this page
    const currentComments = ShopeeHelpers.extractShopeeCommentTexts();
    const currentCommentsHash = currentComments.join('|');
    const hasProcessedComments = analyzedComments.has(currentCommentsHash) && analyzedComments.size > 0;
    sendResponse({ hasProcessedComments: hasProcessedComments });
  }
});

// Start the watcher
waitForCommentsSection();