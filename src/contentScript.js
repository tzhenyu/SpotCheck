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
  if (!results || !results.results || results.results.length === 0) {
    console.log('displayResultsInComments: No results to display');
    return;
  }
  
  try {
    // Set flag to prevent observer from responding to our DOM changes
    window.isUpdatingCommentDOM = true;
    
    // Always get fresh comment divs from current DOM
    const commentDivs = document.querySelectorAll(ShopeeHelpers.SELECTORS.COMMENT_DIV);
    console.log(`displayResultsInComments: Found ${commentDivs.length} comment divs, ${results.results.length} results`);
    
    if (commentDivs.length === 0) {
      console.warn('displayResultsInComments: No comment divs found in DOM');
      return;
    }
    
    // Handle mismatch by only processing results that match visible comments
    const maxResults = Math.min(commentDivs.length, results.results.length);
    if (commentDivs.length !== results.results.length) {
      console.warn(`Comment count mismatch: ${commentDivs.length} DOM elements vs ${results.results.length} results. Processing first ${maxResults} items.`);
    }
    
    for (let idx = 0; idx < maxResults; idx++) {
      try {
        const commentDiv = commentDivs[idx];
        const result = results.results[idx];
        
        if (!commentDiv) {
          console.error(`displayResultsInComments: Comment div at index ${idx} is null`);
          continue;
        }
        
        if (!result) {
          console.error(`displayResultsInComments: Result at index ${idx} is null`);
          continue;
        }
        
        const analysisDiv = ShopeeHelpers.createAnalysisDiv(result);
        if (!analysisDiv) {
          console.error(`displayResultsInComments: Failed to create analysis div for index ${idx}`);
          continue;
        }
        
        // Remove any previously added analysis
        const existingAnalysis = commentDiv.querySelector(`.${ShopeeHelpers.DOM_CLASSES.COMMENT_ANALYSIS}`);
        if (existingAnalysis) existingAnalysis.remove();
        
        commentDiv.appendChild(analysisDiv);
      } catch (error) {
        console.error(`displayResultsInComments: Error processing result at index ${idx}:`, error);
      }
    }
  } catch (error) {
    console.error('displayResultsInComments: General error:', error);
  } finally {
    // Always reset the flag when done - with a longer delay to ensure DOM updates complete
    setTimeout(() => {
      window.isUpdatingCommentDOM = false;
    }, 500); // Increased from 100ms to 500ms
  }
}

function showCommentsOverlay(comments) {
  if (!comments.length) return;
  const now = Date.now();
  if (now - lastOverlayRunTimestamp < OVERLAY_RUN_THROTTLE_MS) {
    console.log('showCommentsOverlay: Throttled, skipping...');
    return;
  }
  lastOverlayRunTimestamp = now;
  
  // Additional check to prevent concurrent processing
  if (isApiCallInProgress || isProcessingComments) {
    console.log('showCommentsOverlay: Processing already in progress, skipping...');
    return;
  }
  
  // Get fresh count of visible comment divs
  const visibleCommentDivs = document.querySelectorAll(ShopeeHelpers.SELECTORS.COMMENT_DIV);
  console.log(`showCommentsOverlay: Found ${visibleCommentDivs.length} visible comment divs, ${comments.length} extracted comments`);
  
  // Only process comments that match visible elements
  const commentsToProcess = comments.slice(0, visibleCommentDivs.length);
  if (commentsToProcess.length !== comments.length) {
    console.warn(`showCommentsOverlay: Trimming comments from ${comments.length} to ${commentsToProcess.length} to match visible elements`);
  }
  
  // Create hash from comment text (whether comments are strings or objects)
  const commentTexts = commentsToProcess.map(c => typeof c === 'string' ? c : c.comment);
  const commentsHash = commentTexts.join('|');
  
  if (analyzedComments.has(commentsHash)) {
    console.log('showCommentsOverlay: Comments already analyzed, displaying cached results');
    displayResultsInComments(analyzedComments.get(commentsHash));
    return;
  }
  
  if (isApiCallInProgress) {
    console.log('showCommentsOverlay: API call already in progress, skipping...');
    return;
  }
  
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
    window.isUpdatingCommentDOM = false;
    const errorDiv = ShopeeHelpers.createErrorOverlay('LLMProcessing.analyzeCommentsWithBackendOnly is not available');
    document.body.appendChild(errorDiv);
    setTimeout(() => {
      if (errorDiv.parentNode) errorDiv.remove();
    }, 5000);
    return;
  }
  
  window.LLMProcessing.analyzeCommentsWithBackendOnly(commentsToProcess, productName).then(result => {
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
  }).catch(error => {
    console.error('Error in showCommentsOverlay:', error);
    logDiv.remove();
    isApiCallInProgress = false;
    const errorDiv = ShopeeHelpers.createErrorOverlay('API call failed: ' + error.message);
    document.body.appendChild(errorDiv);
    setTimeout(() => {
      if (errorDiv.parentNode) errorDiv.remove();
    }, 5000);
  }).finally(() => {
    // Always reset these flags
    setTimeout(() => {
      window.isUpdatingCommentDOM = false;
    }, 200);
  });
}

// Debounced function to process comments
let isProcessingComments = false;
let lastProcessingTime = 0;
const MIN_PROCESSING_INTERVAL = 3000; // Minimum 3 seconds between processing

function debouncedProcessComments() {
  // Prevent duplicate processing
  if (isProcessingComments) {
    console.log('debouncedProcessComments: Already processing, skipping...');
    return;
  }
  
  // Throttle processing to prevent excessive calls
  const now = Date.now();
  if (now - lastProcessingTime < MIN_PROCESSING_INTERVAL) {
    console.log('debouncedProcessComments: Too soon since last processing, skipping...');
    return;
  }
  
  if (apiCallTimer) clearTimeout(apiCallTimer);
  apiCallTimer = setTimeout(async () => {
    if (isProcessingComments || isApiCallInProgress) {
      console.log('debouncedProcessComments: Processing in progress, aborting timeout...');
      return;
    }
    
    isProcessingComments = true;
    lastProcessingTime = Date.now();
    
    try {
      console.log('debouncedProcessComments: Starting fresh comment extraction');
      
      // Clear any cached data to force fresh extraction
      window.extractedCommentsCache = [];
      
      // Always use detailed comments with usernames for current page only
      const detailedComments = await window.CommentExtractor.extractAllComments(true); // Reset accumulated
      if (detailedComments && detailedComments.length > 0) {
        console.log(`debouncedProcessComments: Processing ${detailedComments.length} fresh detailed comments`);
        window.extractedCommentsCache = detailedComments;
        showCommentsOverlay(detailedComments);
      } else {
        console.log('debouncedProcessComments: No detailed comments found, falling back to simple extraction');
        const simpleComments = ShopeeHelpers.extractShopeeCommentTexts();
        console.log(`debouncedProcessComments: Got ${simpleComments.length} simple comments`);
        showCommentsOverlay(simpleComments);
      }
    } catch (error) {
      console.error('Error extracting detailed comments:', error);
      const simpleComments = ShopeeHelpers.extractShopeeCommentTexts();
      console.log(`debouncedProcessComments: Fallback got ${simpleComments.length} simple comments`);
      showCommentsOverlay(simpleComments);
    } finally {
      isProcessingComments = false;
    }
  }, 500); // Increased debounce delay from 200ms to 500ms
}

// Watch for changes in the comment list container
function observeShopeeComments() {
  const commentsSection = document.querySelector(ShopeeHelpers.SELECTORS.COMMENT_LIST);
  if (!commentsSection) return;

  // Enhanced pagination observer with multiple selectors
  let paginationChangeTimeout = null;
  const paginationObserver = new MutationObserver((mutations) => {
    if (isProcessingComments || isApiCallInProgress) return;
    
    let paginationChanged = false;
    
    for (const mutation of mutations) {
      // Check for class changes on pagination elements
      if (mutation.attributeName === 'class' && 
          (mutation.target.classList.contains('shopee-button-solid--primary') || 
           mutation.target.closest('.shopee-page-controller') ||
           mutation.target.classList.contains('active') ||
           mutation.target.closest('.shopee-pagination'))) {
        paginationChanged = true;
        break;
      }
      
      // Check for new pagination elements being added
      if (mutation.type === 'childList') {
        for (const node of mutation.addedNodes) {
          if (node.nodeType === Node.ELEMENT_NODE) {
            if (node.matches && (
                node.matches('[class*="shopee-page"]') ||
                node.matches('[class*="pagination"]') ||
                node.querySelector('[class*="shopee-page"]') ||
                node.querySelector('[class*="pagination"]')
              )) {
              paginationChanged = true;
              break;
            }
          }
        }
      }
    }
    
    if (paginationChanged) {
      console.log('Pagination DOM change detected');
      // Debounce pagination changes
      if (paginationChangeTimeout) clearTimeout(paginationChangeTimeout);
      paginationChangeTimeout = setTimeout(() => {
        // Clear cache to force reprocessing
        analyzedComments.clear();
        window.extractedCommentsCache = [];
        setTimeout(() => debouncedProcessComments(), 500);
      }, 300);
    }
  });
  
  // Find pagination container and observe it with broader scope
  const paginationSelectors = [
    '.shopee-page-controller',
    '.shopee-pagination',
    '[class*="pagination"]',
    '[class*="page-controller"]'
  ];
  
  for (const selector of paginationSelectors) {
    const paginationContainer = document.querySelector(selector);
    if (paginationContainer) {
      paginationObserver.observe(paginationContainer, { 
        childList: true, 
        subtree: true, 
        attributes: true,
        attributeFilter: ['class', 'aria-current', 'data-testid']
      });
      console.log(`Observing pagination with selector: ${selector}`);
      break;
    }
  }

  // Enhanced click event listener for pagination
  if (document && typeof document.addEventListener === 'function') {
    document.addEventListener('click', (event) => {
      const isPaginationButton = event.target.closest('.shopee-page-controller') || 
                                event.target.closest('.shopee-pagination') ||
                                event.target.matches('.shopee-icon-button--right') || 
                                event.target.matches('.shopee-icon-button--left') ||
                                event.target.matches('[class*="page"]') ||
                                (event.target.textContent && /^\d+$/.test(event.target.textContent.trim()));
      
      if (isPaginationButton) {
        console.log('Pagination click detected:', event.target);
        // Clear cache to force reprocessing
        analyzedComments.clear();
        window.extractedCommentsCache = [];
        setTimeout(() => debouncedProcessComments(), 500);
      }
    }, true);
  }

  const commentObserver = new MutationObserver((mutations) => {
    // Skip if we're updating DOM or API call is in progress
    if (window.isUpdatingCommentDOM || isApiCallInProgress || isProcessingComments) return;
    
    // Check if comments were actually added or changed (not our analysis divs)
    let commentsChanged = false;
    for (const mutation of mutations) {
      if (mutation.type === 'childList') {
        for (const node of mutation.addedNodes) {
          if (node.nodeType === Node.ELEMENT_NODE) {
            // Skip our own analysis divs
            if (node.classList && node.classList.contains('comment-analysis')) continue;
            
            // Only trigger for actual comment nodes
            if (node.matches && (
                node.matches(ShopeeHelpers.SELECTORS.COMMENT_DIV) ||
                node.querySelector(ShopeeHelpers.SELECTORS.COMMENT_DIV)
              )) {
              commentsChanged = true;
              break;
            }
          }
        }
      }
    }
    
    if (commentsChanged) {
      console.log('New comments detected in DOM');
      debouncedProcessComments();
    }
  });

  commentObserver.observe(commentsSection, { childList: true, subtree: true });

  const comments = ShopeeHelpers.extractShopeeCommentTexts();
  if (comments && comments.length > 0) {
    window.CommentExtractor.extractAllComments(false).then(detailedComments => {
      showCommentsOverlay(detailedComments.length > 0 ? detailedComments : comments);
    }).catch(error => {
      console.error('Error extracting detailed comments:', error);
      showCommentsOverlay(comments);
    });
  }
}

// Set up URL change detection outside of waitForCommentsSection
let currentUrl = window.location.href;
let currentPaginationPage = '1'; // Track the current pagination page
let currentUrlHash = window.location.hash; // Track URL hash changes for pagination

function checkUrlChange() {
  const newUrl = window.location.href;
  const newHash = window.location.hash;
  
  // Check for full URL changes
  if (currentUrl !== newUrl) {
    const oldUrl = currentUrl;
    currentUrl = newUrl;
    
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
  
  // Check for hash changes (often used for pagination)
  if (currentUrlHash !== newHash) {
    console.log(`URL hash changed from ${currentUrlHash} to ${newHash}`);
    currentUrlHash = newHash;
    
    // Only process if hash looks like pagination (contains numbers)
    if (newHash.match(/[0-9]/) && isAutoExtractEnabled && !isProcessingComments) {
      // Clear cache and reprocess comments
      analyzedComments.clear();
      window.extractedCommentsCache = [];
      
      setTimeout(() => debouncedProcessComments(), 500);
    }
  }
  
  // Check for pagination changes - but only if we're not already processing
  if (!isProcessingComments) {
    checkPaginationChange();
  }
}

// Check if pagination has changed
let lastPaginationCheckTime = 0;
function checkPaginationChange() {
  try {
    // Throttle pagination checks
    const now = Date.now();
    if (now - lastPaginationCheckTime < 1000) return; // Max once per second
    
    // Multiple selectors for different Shopee layouts
    const paginationSelectors = [
      '.shopee-page-controller > .shopee-button-solid--primary',
      '.shopee-page-controller .shopee-button-solid--primary',
      '.shopee-pagination .active',
      '.shopee-page-controller [class*="primary"]',
      '.shopee-page-controller button[class*="active"]'
    ];
    
    let activePaginationElement = null;
    for (const selector of paginationSelectors) {
      activePaginationElement = document.querySelector(selector);
      if (activePaginationElement) break;
    }
    
    if (activePaginationElement) {
      const currentPage = activePaginationElement.textContent.trim();
      
      // If the page number changed, process comments again
      if (currentPage !== currentPaginationPage && currentPage !== '') {
        console.log(`Pagination changed from ${currentPaginationPage} to ${currentPage}`);
        currentPaginationPage = currentPage;
        lastPaginationCheckTime = now;
        
        // Clear previous analysis to force reprocessing
        analyzedComments.clear();
        window.extractedCommentsCache = [];
        
        // Process comments with longer delay for content to load
        setTimeout(() => {
          if (isAutoExtractEnabled && !isProcessingComments) {
            console.log('Processing comments after pagination change');
            debouncedProcessComments();
          }
        }, 1000); // Increased delay for more stability
      }
    }
  } catch (error) {
    console.error('Error checking pagination:', error);
  }
}

// Poll for URL and pagination changes with reasonable frequency
setInterval(checkUrlChange, 1000); // Reduced from 50ms to 1000ms

// Additional periodic check for unprocessed comments (backup detection) - less aggressive
let lastPeriodicCheckTime = 0;
setInterval(() => {
  if (!isAutoExtractEnabled || isApiCallInProgress) return;
  
  // Throttle periodic checks to prevent excessive processing
  const now = Date.now();
  if (now - lastPeriodicCheckTime < 5000) return; // Minimum 5 seconds between checks
  
  const currentComments = ShopeeHelpers.extractShopeeCommentTexts();
  if (currentComments.length > 0) {
    const commentsHash = currentComments.join('|');
    
    // If we have comments but no analysis results, process them
    if (!analyzedComments.has(commentsHash)) {
      console.log('Periodic check: Found unprocessed comments, processing...');
      lastPeriodicCheckTime = now;
      debouncedProcessComments();
    }
  }
}, 10000); // Increased from 2000ms to 10000ms

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