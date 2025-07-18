const API_BASE_URL = "http://localhost:8001";
const DEBOUNCE_DELAY = 500;

// Track already analyzed comments to avoid duplicate API calls and store results
let analyzedComments = new Map(); // Changed from Set to Map to store results
let isApiCallInProgress = false;
let apiCallTimer = null;
let lastOverlayRunTimestamp = 0;
const OVERLAY_RUN_THROTTLE_MS = 1000;

// Flag to track if content script is fully initialized
let isContentScriptInitialized = false;
window.extractedCommentsCache = [];

// Initialize content script dependencies and required objects
function initializeContentScript() {
  try {
    console.log("Initializing content script...");
    
    // Check if required helper objects are available
    if (typeof window.ShopeeHelpers === 'undefined') {
      console.error("ShopeeHelpers not defined. contentHelpers.js might not be loaded correctly.");
    } else {
      console.log("ShopeeHelpers loaded successfully");
    }
    
    if (typeof window.CommentExtractor === 'undefined') {
      console.error("CommentExtractor not defined. commentExtractor.js might not be loaded correctly.");
    } else {
      console.log("CommentExtractor loaded successfully");
    }
    
    if (typeof window.LLMProcessing === 'undefined') {
      console.error("LLMProcessing not defined. LLMProcessing.js might not be loaded correctly.");
    } else {
      console.log("LLMProcessing loaded successfully");
    }
    
    isContentScriptInitialized = true;
    console.log("Content script initialization complete");
  } catch (error) {
    console.error("Error initializing content script:", error);
    isContentScriptInitialized = false;
  }
}

// Run initialization when script loads
initializeContentScript();

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

async function analyzeCommentsWithLLM(comments, productName = null) {
  try {
    console.log("Analyzing comments with Ollama API...");
    
    // Check for stored API key
    const apiKey = await window.LLMProcessing.getStoredApiKey();
    
    // If no API key is found, return error
    if (!apiKey) {
      return {
        error: true,
        message: "Ollama not detected! Is backend server on?"
      };
    }
    
    // Call Ollama API to analyze comments
    const result = await window.LLMProcessing.analyzeCommentsDirectly(comments, apiKey, productName);
    return result;
  } catch (error) {
    console.error("Error analyzing with LLM:", error);
    return { message: `LLM Analysis Error: ${error.message}`, error: true };
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
  if (!comments.length) return;
  const now = Date.now();
  if (now - lastOverlayRunTimestamp < OVERLAY_RUN_THROTTLE_MS) return;
  lastOverlayRunTimestamp = now;
  const commentsHash = comments.join('|');
  if (analyzedComments.has(commentsHash)) {
    displayResultsInComments(analyzedComments.get(commentsHash));
    return;
  }
  if (isApiCallInProgress) return;
  isApiCallInProgress = true;
  window.isUpdatingCommentDOM = true;
  let logDiv = document.getElementById('shopee-comments-overlay');
  if (logDiv) logDiv.remove();
  logDiv = ShopeeHelpers.createLoadingOverlay();
  document.body.appendChild(logDiv);
  let productName = null;
  const productNameElement = document.querySelector('h1.vR6K3w');
  if (productNameElement) {
    productName = productNameElement.textContent.trim();
  }
  if (!window.LLMProcessing || typeof window.LLMProcessing.analyzeCommentsWithBackendOnly !== 'function') {
    logDiv.remove();
    isApiCallInProgress = false;
    const errorDiv = ShopeeHelpers.createErrorOverlay('LLMProcessing.analyzeCommentsWithBackendOnly is not available');
    document.body.appendChild(errorDiv);
    setTimeout(() => {
      if (errorDiv.parentNode) errorDiv.remove();
    }, 5000);
    return;
  }
  window.LLMProcessing.analyzeCommentsWithBackendOnly(comments, productName).then(result => {
    logDiv.remove();
    isApiCallInProgress = false;
    if (result.error) {
      const errorDiv = ShopeeHelpers.createErrorOverlay(result.message);
      document.body.appendChild(errorDiv);
      setTimeout(() => {
        if (errorDiv.parentNode) errorDiv.remove();
      }, 5000);
    } else {
      analyzedComments.set(commentsHash, result);
      displayResultsInComments(result);
    }
  });
}

// Debounced function to process comments
function debouncedProcessComments() {
  if (apiCallTimer) clearTimeout(apiCallTimer);
  apiCallTimer = setTimeout(() => {
    const comments = ShopeeHelpers.extractShopeeCommentTexts();
    if (comments && comments.length > 0) {
      console.log(`Processing ${comments.length} comments after pagination or DOM change`);
      window.extractedCommentsCache = window.ShopeeHelpers.extractDetailedCommentData();
      showCommentsOverlay(comments);
    } else {
      console.log('No comments found to process');
    }
  }, 200); // Reduce delay for faster DOM response
}

function showCommentsOverlay(comments) {
  if (!comments.length) return;
  const now = Date.now();
  if (now - lastOverlayRunTimestamp < OVERLAY_RUN_THROTTLE_MS) return;
  lastOverlayRunTimestamp = now;
  
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
  
  // Always use backend for analysis
  console.log("Starting comment analysis with backend");
  
  // Get the API key directly here to ensure it's used
  window.LLMProcessing.getStoredApiKey().then(apiKey => {
    console.log("API key for analysis:", apiKey ? "Available (masked)" : "Not available");
    
    // Use the backend with the API key
    return window.LLMProcessing.analyzeCommentsWithBackendOnly(comments, productName);
  }).then(result => {
    // Remove loading overlay when done
    logDiv.remove();
    isApiCallInProgress = false;
    
    if (result.error) {
      // Show error in small overlay using helper
      const errorDiv = ShopeeHelpers.createErrorOverlay(result.message);
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

  // Only add click event listener if document exists (always true in browser)
  if (document && typeof document.addEventListener === 'function') {
    document.addEventListener('click', (event) => {
      const isPaginationButton = event.target.closest('.shopee-page-controller') || 
                                event.target.matches('.shopee-icon-button--right') || 
                                event.target.matches('.shopee-icon-button--left');
      if (isPaginationButton) {
        console.log('Pagination button clicked');
        setTimeout(() => debouncedProcessComments(), 200);
      }
    }, true);
  }

  const commentObserver = new MutationObserver(() => {
    if (window.isUpdatingCommentDOM || isApiCallInProgress) return;
    debouncedProcessComments();
  });

  commentObserver.observe(commentsSection, { childList: true, subtree: true });

  const comments = ShopeeHelpers.extractShopeeCommentTexts();
  showCommentsOverlay(comments);
}

// Set up URL change detection outside of waitForCommentsSection
let currentUrl = window.location.href;
let currentPaginationPage = '1'; // Track the current pagination page

function checkUrlChange() {
  if (currentUrl !== window.location.href) {
    const oldUrl = currentUrl;
    currentUrl = window.location.href;
    
    // Trigger upload of any existing comments before resetting
    if (window.CommentExtractor) {
      window.CommentExtractor.handleUrlChange({
        action: "urlChanged", 
        oldUrl,
        newUrl: currentUrl,
        uploadComments: true
      });
    }
    
    // Reset tracking when URL changes
    analyzedComments.clear();
    window.extractedCommentsCache = [];
    isApiCallInProgress = false;
    if (apiCallTimer) clearTimeout(apiCallTimer);
    
    // Notify popup about URL change
    chrome.runtime.sendMessage({
      action: "urlChanged",
      oldUrl,
      newUrl: currentUrl
    }).catch(err => console.log("Popup not open"));
    
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
        }, 50);
      }
    }
  } catch (error) {
    console.error('Error checking pagination:', error);
  }
}

// Poll for URL and pagination changes every 500ms (since SPAs can change without triggering events)
setInterval(checkUrlChange, 100);

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
        setTimeout(() => debouncedProcessComments(), 500);
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

// Auto-extract setting
let isAutoExtractEnabled = true;

// Load auto-extract setting from storage
function loadAutoExtractSetting() {
  try {
    const AUTO_EXTRACT_STORAGE_KEY = "auto_extract_enabled";
    chrome.storage.local.get([AUTO_EXTRACT_STORAGE_KEY], (result) => {
      // Default to true if not set
      isAutoExtractEnabled = result[AUTO_EXTRACT_STORAGE_KEY] !== false;
      console.log(`Auto-extract is ${isAutoExtractEnabled ? 'enabled' : 'disabled'}`);
    });
  } catch (error) {
    console.error('Failed to load auto-extract setting:', error);
    // Default to true if there's an error
    isAutoExtractEnabled = true;
  }
}

// Load setting when content script initializes
loadAutoExtractSetting();

// Listen for messages from popup or background script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log("Content script received message:", request);
  
  if (request.action === "extractComments") {
    try {
      console.log("Received extractComments request in content script");
      // Check if extraction tools are available
      if (!window.CommentExtractor && !window.ShopeeHelpers) {
        console.error("Comment extraction tools not available");
        sendResponse({ error: true, message: "Comment extraction tools not available" });
        return true;
      }

      // Use CommentExtractor if available, otherwise fallback to basic extraction
      if (window.CommentExtractor) {
        console.log("Using CommentExtractor for extraction");
        // Handle async extraction
        window.CommentExtractor.extractAllComments(false)
          .then(extractedComments => {
            console.log(`Extracted ${extractedComments.length} comments`);
            // Store in global cache for future use
            window.extractedCommentsCache = extractedComments;
            sendResponse({ comments: extractedComments });
          })
          .catch(error => {
            console.error("Error extracting comments:", error);
            sendResponse({ error: true, message: error.toString() });
          });
      } else if (window.ShopeeHelpers) {
        console.log("Using ShopeeHelpers for extraction");
        try {
          // Fallback to synchronous method
          const extractedComments = window.ShopeeHelpers.extractDetailedCommentData();
          console.log(`Extracted ${extractedComments.length} comments with ShopeeHelpers`);
          // Store in global cache for future use
          window.extractedCommentsCache = extractedComments;
          sendResponse({ comments: extractedComments });
        } catch (innerError) {
          console.error("Error in ShopeeHelpers extraction:", innerError);
          sendResponse({ error: true, message: innerError.toString() });
        }
      }
    } catch (error) {
      console.error("Error in extractComments handler:", error);
      sendResponse({ error: true, message: error.toString() });
    }
    return true; // Keep the message channel open for async response
  } else if (request.action === "autoExtractComments") {
    // Auto extraction triggered by background script
    console.log("Auto extraction triggered by background script");
    
    // Force enable for testing
    console.log("Forcing auto-extract enabled for debugging");
    isAutoExtractEnabled = true;
    
    console.log("Starting immediate comment extraction test...");
    
    // Test direct API call
    setTimeout(async () => {
      try {
        console.log("Testing direct API call...");
        const testComments = ["Test comment 1", "Test comment 2"];
        
        const response = await fetch("http://localhost:8001/analyze", {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            comments: testComments
          })
        });
        
        console.log("Direct API call response status:", response.status);
        
        if (response.ok) {
          const data = await response.json();
          console.log("Direct API call SUCCESS:", data);
          
          // Show success overlay
          const successDiv = document.createElement('div');
          successDiv.style.cssText = 'position: fixed; top: 20px; right: 20px; background: green; color: white; padding: 10px; z-index: 999999; border-radius: 5px;';
          successDiv.textContent = 'API Call SUCCESS!';
          document.body.appendChild(successDiv);
          setTimeout(() => successDiv.remove(), 3000);
        } else {
          console.error("Direct API call FAILED:", response.status);
        }
        
      } catch (error) {
        console.error("Direct API call ERROR:", error);
        
        // Show error overlay
        const errorDiv = document.createElement('div');
        errorDiv.style.cssText = 'position: fixed; top: 20px; right: 20px; background: red; color: white; padding: 10px; z-index: 999999; border-radius: 5px;';
        errorDiv.textContent = 'API Call FAILED: ' + error.message;
        document.body.appendChild(errorDiv);
        setTimeout(() => errorDiv.remove(), 5000);
      }
      
      // Also try the normal flow
      debouncedProcessComments();
    }, 1000);
    
    sendResponse({ success: true, message: "Auto extraction debugging triggered" });
    return true;
  } else if (request.action === "getProcessedComments") {
    try {
      console.log("getProcessedComments request received");
      // Verify ShopeeHelpers is available
      if (!window.ShopeeHelpers) {
        console.warn("ShopeeHelpers not available for getProcessedComments");
        sendResponse({ 
          error: true, 
          message: "Content script helpers not fully loaded"
        });
        return true;
      }
      
      // Check if we have already processed comments on this page or have cached comments
      const currentComments = ShopeeHelpers.extractShopeeCommentTexts();
      console.log(`Found ${currentComments.length} comments on current page`);
      
      const currentCommentsHash = currentComments.join('|');
      const hasProcessedComments = analyzedComments.has(currentCommentsHash) && analyzedComments.size > 0;
      
      // Check if we have cached comments from auto-extraction without API key
      if (window.extractedCommentsCache && window.extractedCommentsCache.length > 0) {
        console.log(`Found ${window.extractedCommentsCache.length} cached comments, returning to popup`);
        sendResponse({ 
          hasProcessedComments: true, 
          cachedComments: window.extractedCommentsCache 
        });
      } else {
        console.log(`No cached comments found. Has processed: ${hasProcessedComments}`);
        sendResponse({ hasProcessedComments: hasProcessedComments });
      }
    } catch (error) {
      console.error("Error in getProcessedComments handler:", error);
      sendResponse({ error: true, message: error.toString() });
    }
    return true;
  } else if (request.action === "updateAutoExtractSetting") {
    // Update auto-extract setting
    isAutoExtractEnabled = request.isEnabled;
    console.log(`Auto-extract setting updated: ${isAutoExtractEnabled ? 'enabled' : 'disabled'}`);
    sendResponse({ success: true });
  } else if (request.action === "extractMultiPageComments") {
    // Start multi-page extraction
    const totalPages = request.pages || 15; // Default to 5 pages
    extractMultiplePages(totalPages);
    sendResponse({ started: true });
    return true;
  } else if (request.action === "urlChanged") {
    console.log("URL changed, handling in content script");
    
    // Clear the comment cache when URL changes
    window.extractedCommentsCache = [];
    analyzedComments.clear();
    
    // Forward the URL change message to the CommentExtractor to handle uploads
    if (window.CommentExtractor) {
      // Make sure we're setting uploadComments to true
      const urlChangeRequest = {...request, uploadComments: true};
      // The CommentExtractor will handle comment uploads if enabled
      window.CommentExtractor.handleUrlChange(urlChangeRequest);
    }
    
    sendResponse({ success: true });
    return true;
  }
});

// Function to navigate through pages and extract comments
async function extractMultiplePages(totalPages) {
  // Track pages and comments
  let currentPage = 1;
  let allExtractedComments = [];
  const MAX_RETRIES = 3;
  
  try {
    while (currentPage <= totalPages) {
      // Send progress update to popup
      chrome.runtime.sendMessage({
        action: "extractionProgress",
        currentPage: currentPage,
        totalPages: totalPages,
        complete: false
      });
      
      // Extract comments from current page
      let extractedComments = [];
      let retries = 0;
      let success = false;
      
      while (!success && retries < MAX_RETRIES) {
        try {
          // Use CommentExtractor if available
          if (window.CommentExtractor) {
            extractedComments = await window.CommentExtractor.extractAllComments(false);
          } else if (window.ShopeeHelpers) {
            extractedComments = window.ShopeeHelpers.extractDetailedCommentData();
          }
          
          success = true;
        } catch (error) {
          console.error(`Error extracting page ${currentPage}, retry ${retries + 1}:`, error);
          retries++;
          // Wait a moment before retrying
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }
      
      // Add comments to collection
      if (extractedComments && extractedComments.length > 0) {
        allExtractedComments = allExtractedComments.concat(extractedComments);
        
        // Send progress with comments
        chrome.runtime.sendMessage({
          action: "extractionProgress",
          currentPage: currentPage,
          totalPages: totalPages,
          comments: extractedComments,
          complete: false
        });
      }
      
      // Go to next page if not the last page
      if (currentPage < totalPages) {
        const nextPageSuccess = await goToNextPage();
        if (!nextPageSuccess) {
          console.log("Could not navigate to next page, stopping extraction");
          break;
        }
        
        // Wait for page to load
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
      
      currentPage++;
    }
    
    // Send final completion message
    chrome.runtime.sendMessage({
      action: "extractionProgress",
      currentPage: currentPage - 1,
      totalPages: totalPages,
      complete: true
    });
    
    return allExtractedComments;
  } catch (error) {
    console.error("Error during multi-page extraction:", error);
    
    // Send error message
    chrome.runtime.sendMessage({
      action: "extractionProgress",
      currentPage: currentPage,
      totalPages: totalPages,
      error: true,
      errorMessage: error.message,
      complete: true
    });
    
    return allExtractedComments;
  }
}

// Function to click the next page button
async function goToNextPage() {
  return new Promise(resolve => {
    try {
      // Find next button - various Shopee site versions might have different selectors
      const nextButton = document.querySelector('.shopee-icon-button--right') || 
                         document.querySelector('.shopee-page-controller .shopee-button-next') ||
                         Array.from(document.querySelectorAll('.shopee-page-controller button')).find(btn => 
                           btn.textContent.includes('>') || btn.innerHTML.includes('next'));
      
      if (!nextButton || nextButton.disabled) {
        console.log("Next page button not found or disabled");
        resolve(false);
        return;
      }
      
      // Click the button
      nextButton.click();
      console.log("Navigated to next page");
      resolve(true);
    } catch (error) {
      console.error("Error navigating to next page:", error);
      resolve(false);
    }
  });
}

// Initialize auto-extraction when page is loaded
// This ensures comments are extracted even if the popup is never opened
function initAutoExtractOnLoad() {
  // Check if we're on a Shopee product page
  if (!window.location.href.match(/shopee\.(sg|com|ph|co\.id|com\.my).*\/product\/\d+\/\d+/i)) {
    console.log("Not on a Shopee product page, skipping auto-extract initialization");
    return;
  }

  console.log("Initializing auto-extract on page load");
  
  // Give the page time to fully load before attempting extraction
  setTimeout(() => {
    // Check if auto-extract is enabled
    loadAutoExtractSetting();
    
    // After a slight delay to ensure setting is loaded
    setTimeout(() => {
      if (isAutoExtractEnabled) {
        console.log("Auto-extracting comments on page load");
        debouncedProcessComments();
      } else {
        console.log("Auto-extract disabled, skipping initialization");
      }
    }, 100);
  }, 3000);
}

// Run auto-extract initialization
initAutoExtractOnLoad();

// Start the watcher
waitForCommentsSection();