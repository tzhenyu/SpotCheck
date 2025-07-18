const API_BASE_URL = "http://localhost:8001";
const DEBOUNCE_DELAY = 500;

// Track already analyzed comments to avoid duplicate API calls and store results
let analyzedComments = new Map(); // Changed from Set to Map to store results
let isApiCallInProgress = false;
let apiCallTimer = null;
let lastOverlayRunTimestamp = 0;
const OVERLAY_RUN_THROTTLE_MS = 500;  // Reduced from 1000ms to 500ms
let isPaginationInProgress = false; // Add flag to track pagination state
let isAnalysisInProgress = false; // Add flag to prevent double analysis
let paginationTriggerTimeout = null; // Prevent multiple pagination triggers
let activeAnalysisCallId = null; // Track active analysis to prevent duplicates

// PAGE-LEVEL ANALYSIS CACHE - Persistent across navigation
let pageAnalysisCache = new Map(); // Key: pageIdentifier, Value: { results, timestamp, commentsHash }
const CACHE_EXPIRY_MS = 24 * 60 * 60 * 1000; // 24 hours cache expiry
const MAX_CACHE_SIZE = 100; // Maximum number of cached pages

// Generate unique page identifier for caching
function generatePageIdentifier() {
  const url = window.location.href;
  const pathname = window.location.pathname;
  const search = window.location.search;
  
  // Create identifier from URL without hash (to handle pagination)
  const baseUrl = url.split('#')[0];
  
  // For Shopee product pages, use product ID from URL
  const productIdMatch = pathname.match(/i\.(\d+)\.(\d+)/);
  if (productIdMatch) {
    return `shopee_product_${productIdMatch[1]}_${productIdMatch[2]}`;
  }
  
  // Fallback to base URL hash
  return btoa(baseUrl).replace(/[^a-zA-Z0-9]/g, '').substr(0, 50);
}

// Check if page has cached analysis results
function getCachedAnalysis() {
  const pageId = generatePageIdentifier();
  const cached = pageAnalysisCache.get(pageId);
  
  if (!cached) return null;
  
  // Check if cache is expired
  const now = Date.now();
  if (now - cached.timestamp > CACHE_EXPIRY_MS) {
    pageAnalysisCache.delete(pageId);
    console.log(`getCachedAnalysis: Cache expired for page ${pageId}`);
    return null;
  }
  
  // Verify current comments match cached comments
  const currentComments = ShopeeHelpers ? ShopeeHelpers.extractShopeeCommentTexts() : [];
  const currentCommentsHash = currentComments.join('|');
  
  if (cached.commentsHash === currentCommentsHash) {
    console.log(`getCachedAnalysis: Found valid cache for page ${pageId}`);
    return cached.results;
  } else {
    console.log(`getCachedAnalysis: Comments changed for page ${pageId}, invalidating cache`);
    pageAnalysisCache.delete(pageId);
    return null;
  }
}

// Save analysis results to page cache
function saveAnalysisToCache(results, commentsHash) {
  const pageId = generatePageIdentifier();
  
  // Manage cache size - remove oldest entries if needed
  if (pageAnalysisCache.size >= MAX_CACHE_SIZE) {
    const oldestKey = pageAnalysisCache.keys().next().value;
    pageAnalysisCache.delete(oldestKey);
    console.log(`saveAnalysisToCache: Removed oldest cache entry ${oldestKey}`);
  }
  
  pageAnalysisCache.set(pageId, {
    results: results,
    timestamp: Date.now(),
    commentsHash: commentsHash
  });
  
  console.log(`saveAnalysisToCache: Saved analysis for page ${pageId} (${pageAnalysisCache.size}/${MAX_CACHE_SIZE} cached pages)`);
}

// Clear expired cache entries
function cleanupCache() {
  const now = Date.now();
  const expiredKeys = [];
  
  for (const [key, value] of pageAnalysisCache.entries()) {
    if (now - value.timestamp > CACHE_EXPIRY_MS) {
      expiredKeys.push(key);
    }
  }
  
  expiredKeys.forEach(key => pageAnalysisCache.delete(key));
  
  if (expiredKeys.length > 0) {
    console.log(`cleanupCache: Removed ${expiredKeys.length} expired cache entries`);
  }
}

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
    
    // Clear existing analysis displays first during pagination
    if (isPaginationInProgress) {
      const existingAnalysis = document.querySelectorAll('.comment-analysis');
      existingAnalysis.forEach(div => div.remove());
      console.log('displayResultsInComments: Cleared existing analysis during pagination');
    }
    
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
    // Always reset the flag when done - with a shorter delay
    setTimeout(() => {
      window.isUpdatingCommentDOM = false;
    }, 200); // Reduced from 500ms to 200ms
  }
}

function showCommentsOverlay(comments) {
  if (!comments.length) return;
  
  // GLOBAL LOCK: Prevent ANY concurrent analysis calls
  if (isApiCallInProgress || isAnalysisInProgress || window.isUpdatingCommentDOM) {
    console.log('showCommentsOverlay: GLOBAL LOCK - Analysis already in progress, rejecting call');
    return;
  }
  
  // Check if pagination trigger is active
  if (paginationTriggerTimeout && !isPaginationInProgress) {
    console.log('showCommentsOverlay: Pagination trigger timeout active, rejecting to prevent duplicate');
    return;
  }
  
  // CHECK PAGE-LEVEL CACHE FIRST - Skip during pagination to ensure fresh display
  if (!isPaginationInProgress) {
    const cachedResults = getCachedAnalysis();
    if (cachedResults) {
      console.log('showCommentsOverlay: Using cached analysis results for this page');
      
      // Show cache indicator to user
      const cacheIndicator = document.createElement('div');
      cacheIndicator.style.cssText = 'position: fixed; top: 20px; left: 20px; background: #4CAF50; color: white; padding: 8px 12px; z-index: 999999; border-radius: 5px; font-family: Arial, sans-serif; font-size: 13px; box-shadow: 0 2px 5px rgba(0,0,0,0.2);';
      cacheIndicator.textContent = '💾 Using cached analysis';
      document.body.appendChild(cacheIndicator);
      
      // Remove indicator after 3 seconds
      setTimeout(() => {
        if (cacheIndicator.parentNode) {
          cacheIndicator.remove();
        }
      }, 3000);
      
      displayResultsInComments(cachedResults);
      return;
    } else {
      console.log('showCommentsOverlay: No valid cache found, proceeding with fresh analysis');
    }
  } else {
    console.log('showCommentsOverlay: Pagination in progress, skipping cache check');
  }
  
  // Set the analysis flag immediately to prevent concurrent calls
  isAnalysisInProgress = true;
  
  // Generate unique call ID to track this analysis
  const callId = Date.now() + '-' + Math.random().toString(36).substr(2, 9);
  activeAnalysisCallId = callId;
  console.log(`showCommentsOverlay: Starting analysis with ID: ${callId}`);
  
  // During pagination, we want to force reanalysis, so skip some checks
  const isPaginationScenario = isPaginationInProgress || (window.extractedCommentsCache.length === 0 && !analyzedComments.size);
  
  console.log(`showCommentsOverlay: isPaginationInProgress=${isPaginationInProgress}, isPaginationScenario=${isPaginationScenario}`);
  
  if (!isPaginationScenario) {
    const now = Date.now();
    if (now - lastOverlayRunTimestamp < OVERLAY_RUN_THROTTLE_MS) {
      console.log('showCommentsOverlay: Throttled, skipping...');
      isAnalysisInProgress = false; // Reset flag
      return;
    }
    lastOverlayRunTimestamp = now;
    
    // Additional check to prevent concurrent processing (but allow during pagination)
    if (isApiCallInProgress || isProcessingComments) {
      console.log('showCommentsOverlay: Processing already in progress, skipping...');
      isAnalysisInProgress = false; // Reset flag
      return;
    }
  } else {
    console.log('showCommentsOverlay: Pagination scenario detected, forcing analysis...');
    lastOverlayRunTimestamp = Date.now();
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
  
  // During pagination, force reanalysis even if hash exists
  if (!isPaginationScenario && !isPaginationInProgress && analyzedComments.has(commentsHash)) {
    console.log('showCommentsOverlay: Comments already analyzed, displaying cached results');
    displayResultsInComments(analyzedComments.get(commentsHash));
    isAnalysisInProgress = false; // Reset flag
    return;
  } else if (isPaginationScenario || isPaginationInProgress) {
    console.log('showCommentsOverlay: Pagination scenario - forcing fresh analysis even if comments exist in cache');
    // During pagination, don't return early even if cached results exist
    if (analyzedComments.has(commentsHash)) {
      console.log('showCommentsOverlay: Pagination in progress - ignoring cached results and forcing fresh analysis');
    }
  }
  
  if (isApiCallInProgress) {
    console.log('showCommentsOverlay: API call already in progress, skipping...');
    isAnalysisInProgress = false; // Reset flag
    return;
  }
  
  isApiCallInProgress = true;
  window.isUpdatingCommentDOM = true;
  
  console.log('showCommentsOverlay: Starting API call for comment analysis');
  console.log(`showCommentsOverlay: isPaginationScenario=${isPaginationScenario}, commentsToProcess=${commentsToProcess.length}`);
  
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
    console.error('showCommentsOverlay: LLMProcessing.analyzeCommentsWithBackendOnly is not available');
    logDiv.remove();
    isApiCallInProgress = false;
    isAnalysisInProgress = false; // Reset flag
    window.isUpdatingCommentDOM = false;
    const errorDiv = ShopeeHelpers.createErrorOverlay('LLMProcessing.analyzeCommentsWithBackendOnly is not available');
    document.body.appendChild(errorDiv);
    setTimeout(() => {
      if (errorDiv.parentNode) errorDiv.remove();
    }, 5000);
    return;
  }
  
  console.log('showCommentsOverlay: About to call LLMProcessing.analyzeCommentsWithBackendOnly');
  console.log(`showCommentsOverlay: Product name: ${productName}, Comments count: ${commentsToProcess.length}`);
  
  // FINAL VALIDATION: Check if this is still the active call
  if (activeAnalysisCallId !== callId) {
    console.log(`showCommentsOverlay: ABORT - Call ID mismatch. Expected: ${callId}, Active: ${activeAnalysisCallId}`);
    logDiv.remove();
    isApiCallInProgress = false;
    isAnalysisInProgress = false;
    window.isUpdatingCommentDOM = false;
    return;
  }
  
  window.LLMProcessing.analyzeCommentsWithBackendOnly(commentsToProcess, productName).then(result => {
    console.log(`showCommentsOverlay: LLMProcessing call completed with result for ID: ${callId}`, result);
    
    // Validate this is still the active call
    if (activeAnalysisCallId !== callId) {
      console.log(`showCommentsOverlay: DISCARD RESULT - Call ID mismatch. Expected: ${callId}, Active: ${activeAnalysisCallId}`);
      return;
    }
    
    logDiv.remove();
    isApiCallInProgress = false;
    isAnalysisInProgress = false; // Reset flag
    activeAnalysisCallId = null; // Clear active call
    
    if (result.error) {
      const errorDiv = ShopeeHelpers.createErrorOverlay(result.message);
      document.body.appendChild(errorDiv);
      setTimeout(() => {
        if (errorDiv.parentNode) errorDiv.remove();
      }, 5000);
    } else {
      analyzedComments.set(commentsHash, result);
      displayResultsInComments(result);
      
      // Save to page cache
      saveAnalysisToCache(result, commentsHash);
    }
  }).catch(error => {
    console.error(`showCommentsOverlay: Error in LLMProcessing call for ID: ${callId}`, error);
    console.error('showCommentsOverlay: Error details:', error.stack);
    
    // Validate this is still the active call
    if (activeAnalysisCallId !== callId) {
      console.log(`showCommentsOverlay: DISCARD ERROR - Call ID mismatch. Expected: ${callId}, Active: ${activeAnalysisCallId}`);
      return;
    }
    
    logDiv.remove();
    isApiCallInProgress = false;
    isAnalysisInProgress = false; // Reset flag
    activeAnalysisCallId = null; // Clear active call
    const errorDiv = ShopeeHelpers.createErrorOverlay('API call failed: ' + error.message);
    document.body.appendChild(errorDiv);
    setTimeout(() => {
      if (errorDiv.parentNode) errorDiv.remove();
    }, 5000);
  }).finally(() => {
    // Always reset these flags for this specific call
    if (activeAnalysisCallId === callId) {
      setTimeout(() => {
        window.isUpdatingCommentDOM = false;
        isAnalysisInProgress = false; // Ensure flag is reset
        activeAnalysisCallId = null; // Clear active call
        console.log(`showCommentsOverlay: Finally block completed for ID: ${callId}`);
      }, 100);  // Reduced from 200ms to 100ms
    } else {
      console.log(`showCommentsOverlay: Finally block skipped - call ID mismatch. Expected: ${callId}, Active: ${activeAnalysisCallId}`);
    }
  });
}

// Debounced function to process comments
let isProcessingComments = false;
let lastProcessingTime = 0;
let lastProcessedCommentsHash = ''; // Track last processed comments to prevent duplicates
// Reduce minimum interval for pagination scenarios
const MIN_PROCESSING_INTERVAL = 500; // Reduced from 1000ms to 500ms for faster responsiveness

function debouncedProcessComments() {
  // Prevent duplicate processing
  if (isProcessingComments || isAnalysisInProgress) {
    console.log('debouncedProcessComments: Already processing, skipping...');
    return;
  }
  
  console.log('debouncedProcessComments: Starting processing...');
  
  if (apiCallTimer) clearTimeout(apiCallTimer);
  apiCallTimer = setTimeout(async () => {
    if (isProcessingComments || isApiCallInProgress || isAnalysisInProgress) {
      console.log('debouncedProcessComments: Processing in progress, aborting timeout...');
      return;
    }
    
    // Extra safety during pagination: clear all displays and caches immediately
    if (isPaginationInProgress) {
      console.log('debouncedProcessComments: Pagination in progress - clearing all displays and caches');
      const existingAnalysis = document.querySelectorAll('.comment-analysis');
      existingAnalysis.forEach(div => div.remove());
      analyzedComments.clear();
      window.extractedCommentsCache = [];
      isAnalysisInProgress = false; // Reset analysis flag during pagination
      lastProcessedCommentsHash = ''; // Reset to force fresh analysis
    }
    
    isProcessingComments = true;
    lastProcessingTime = Date.now();
    
    try {
      console.log('debouncedProcessComments: Starting fresh comment extraction');
      
      // Clear any cached data to force fresh extraction
      window.extractedCommentsCache = [];
      
      // Check if comments section exists
      const commentsSection = document.querySelector(ShopeeHelpers.SELECTORS.COMMENT_LIST);
      if (!commentsSection) {
        console.log('debouncedProcessComments: No comments section found');
        return;
      }
      
      // Always use detailed comments with usernames for current page only
      const detailedComments = await window.CommentExtractor.extractAllComments(true); // Reset accumulated
      if (detailedComments && detailedComments.length > 0) {
        console.log(`debouncedProcessComments: Processing ${detailedComments.length} fresh detailed comments`);
        
        // Create hash from comment texts to prevent duplicate analysis
        const commentTexts = detailedComments.map(c => typeof c === 'string' ? c : c.comment);
        const newCommentsHash = commentTexts.join('|');
        
        // Check if these are the same comments we just processed
        if (newCommentsHash === lastProcessedCommentsHash && !isPaginationInProgress) {
          console.log('debouncedProcessComments: Same comments detected, skipping duplicate analysis');
          return;
        }
        
        lastProcessedCommentsHash = newCommentsHash;
        window.extractedCommentsCache = detailedComments;
        
        // FINAL CHECK: Ensure no concurrent analysis before calling overlay
        if (isAnalysisInProgress || isApiCallInProgress) {
          console.log('debouncedProcessComments: ABORT - Analysis started by another trigger, skipping overlay call');
          return;
        }
        
        showCommentsOverlay(detailedComments);
      } else {
        console.log('debouncedProcessComments: No detailed comments found, falling back to simple extraction');
        const simpleComments = ShopeeHelpers.extractShopeeCommentTexts();
        console.log(`debouncedProcessComments: Got ${simpleComments.length} simple comments`);
        
        if (simpleComments.length > 0) {
          // Check for duplicates with simple comments too
          const newCommentsHash = simpleComments.join('|');
          if (newCommentsHash === lastProcessedCommentsHash && !isPaginationInProgress) {
            console.log('debouncedProcessComments: Same simple comments detected, skipping duplicate analysis');
            return;
          }
          
          lastProcessedCommentsHash = newCommentsHash;
          
          // FINAL CHECK: Ensure no concurrent analysis before calling overlay
          if (isAnalysisInProgress || isApiCallInProgress) {
            console.log('debouncedProcessComments: ABORT - Analysis started by another trigger, skipping overlay call');
            return;
          }
          
          showCommentsOverlay(simpleComments);
        } else {
          console.log('debouncedProcessComments: No comments to process');
        }
      }
    } catch (error) {
      console.error('Error extracting detailed comments:', error);
      // Only fallback if no detailed comments were already processed
      if (!window.extractedCommentsCache || window.extractedCommentsCache.length === 0) {
        const simpleComments = ShopeeHelpers.extractShopeeCommentTexts();
        console.log(`debouncedProcessComments: Fallback got ${simpleComments.length} simple comments`);
        
        if (simpleComments.length > 0) {
          // Check for duplicates in fallback too
          const newCommentsHash = simpleComments.join('|');
          if (newCommentsHash === lastProcessedCommentsHash && !isPaginationInProgress) {
            console.log('debouncedProcessComments: Same fallback comments detected, skipping duplicate analysis');
            return;
          }
          
          lastProcessedCommentsHash = newCommentsHash;
          
          // FINAL CHECK: Ensure no concurrent analysis before calling overlay
          if (isAnalysisInProgress || isApiCallInProgress) {
            console.log('debouncedProcessComments: ABORT - Analysis started by another trigger, skipping fallback overlay call');
            return;
          }
          
          showCommentsOverlay(simpleComments);
        }
      } else {
        console.log('debouncedProcessComments: Skipping fallback - detailed comments already cached');
      }
    } finally {
      isProcessingComments = false;
    }
  }, 500); // Reduced debounce delay to 500ms for faster pagination responsiveness
}

// Watch for changes in the comment list container
function observeShopeeComments() {
  const commentsSection = document.querySelector(ShopeeHelpers.SELECTORS.COMMENT_LIST);
  if (!commentsSection) return;

  // Simplified pagination observer with debouncing
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
        console.log('Pagination class change detected on:', mutation.target);
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
              console.log('Pagination DOM addition detected:', node);
              break;
            }
          }
        }
      }
    }
    
    if (paginationChanged) {
      console.log('=== PAGINATION MUTATION DETECTED ===');
      
      // Prevent multiple pagination triggers from firing
      if (paginationTriggerTimeout) {
        clearTimeout(paginationTriggerTimeout);
        console.log('Cleared existing pagination trigger timeout');
      }
      
      // If pagination is already in progress, skip this trigger
      if (isPaginationInProgress) {
        console.log('Pagination already in progress, ignoring mutation trigger');
        return;
      }
      
      paginationTriggerTimeout = setTimeout(() => {
        console.log('Processing pagination mutation change...');
        // Clear cache and existing displays to force reprocessing
        analyzedComments.clear();
        window.extractedCommentsCache = [];
        lastProcessedCommentsHash = ''; // Reset duplicate detection
        
        // Clear any existing analysis displays immediately
        const existingAnalysis = document.querySelectorAll('.comment-analysis');
        existingAnalysis.forEach(div => div.remove());
        
        // Set pagination flag
        isPaginationInProgress = true;
        
        // Reset pagination tracking
        currentPaginationPage = '1';
        
        // Process with delay to allow content to load
        setTimeout(() => {
          if (isAutoExtractEnabled) {
            console.log('Executing debouncedProcessComments after pagination mutation');
            // Reset processing flags to ensure analysis runs
            isProcessingComments = false;
            isApiCallInProgress = false;
            isAnalysisInProgress = false;
            lastProcessingTime = 0; // Reset timing restriction
            debouncedProcessComments();
          }
          
          // Reset pagination flag after processing
          setTimeout(() => {
            isPaginationInProgress = false;
            paginationTriggerTimeout = null;
            console.log('Pagination mutation processing complete');
          }, 1000);  // Reduced from 2000ms to 1000ms
        }, 1000); // Reduced from 2000ms to 1000ms for faster response
      }, 500); // Reduced from 1000ms to 500ms debounce
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

  // Enhanced click event listener for pagination with improved detection
  let paginationClickTimeout = null;
  if (document && typeof document.addEventListener === 'function') {
    document.addEventListener('click', (event) => {
      console.log('Document click detected:', event.target);
      
      // More robust pagination button detection
      const target = event.target;
      const isPaginationButton = target.closest('.shopee-page-controller') || 
                                target.closest('.shopee-pagination') ||
                                target.matches('.shopee-icon-button--right') || 
                                target.matches('.shopee-icon-button--left') ||
                                target.matches('[class*="page"]') ||
                                target.matches('button[class*="shopee-button"]') ||
                                (target.tagName === 'BUTTON' && target.textContent && /^\d+$/.test(target.textContent.trim())) ||
                                (target.closest('button') && target.closest('button').textContent && /^\d+$/.test(target.closest('button').textContent.trim()));
      
      console.log('Is pagination button:', isPaginationButton);
      
      if (isPaginationButton) {
        console.log('=== PAGINATION CLICK DETECTED ===');
        console.log('Click target:', event.target);
        console.log('Click target text content:', event.target.textContent);
        console.log('Click target class:', event.target.className);
        console.log('Auto-extract enabled:', isAutoExtractEnabled);
        console.log('Is processing comments:', isProcessingComments);
        
        // Prevent multiple pagination triggers
        if (paginationTriggerTimeout) {
          clearTimeout(paginationTriggerTimeout);
          console.log('Cleared existing pagination trigger timeout from click');
        }
        
        // If pagination is already in progress, skip this trigger
        if (isPaginationInProgress) {
          console.log('Pagination already in progress, ignoring click trigger');
          return;
        }
        
        paginationTriggerTimeout = setTimeout(() => {
          // Clear cache immediately to force reprocessing
          analyzedComments.clear();
          window.extractedCommentsCache = [];
          lastProcessedCommentsHash = ''; // Reset duplicate detection
          
          // Clear any existing analysis displays immediately
          const existingAnalysis = document.querySelectorAll('.comment-analysis');
          existingAnalysis.forEach(div => div.remove());
          
          // Set pagination flag
          isPaginationInProgress = true;
          
          // Reset pagination tracking to force detection
          currentPaginationPage = '1';
          
          // Show immediate feedback to user
          const feedbackDiv = document.createElement('div');
          feedbackDiv.style.cssText = 'position: fixed; top: 20px; right: 20px; background: #2196F3; color: white; padding: 10px 15px; z-index: 999999; border-radius: 5px; font-family: Arial, sans-serif; font-size: 14px;';
          feedbackDiv.textContent = '🔄 Loading new page...';
          document.body.appendChild(feedbackDiv);
          
          // Use a shorter delay to allow page content to load
          setTimeout(() => {
            feedbackDiv.remove();
            // Force processing regardless of conditions during pagination
            if (isAutoExtractEnabled) {
              console.log('=== EXECUTING PAGINATION PROCESSING AFTER CLICK ===');
              // Reset processing flags to ensure analysis runs
              isProcessingComments = false;
              isApiCallInProgress = false;
              isAnalysisInProgress = false;
              lastProcessingTime = 0; // Reset timing restriction
              debouncedProcessComments();
            } else {
              console.log('Skipping processing - auto-extract disabled');
            }
            
            // Reset pagination flag after processing
            setTimeout(() => {
              isPaginationInProgress = false;
              paginationTriggerTimeout = null;
              console.log('Pagination click processing complete');
            }, 1000);  // Reduced from 2000ms to 1000ms
          }, 1500); // Reduced from 3000ms to 1500ms for faster response
        }, 200); // Short initial delay to prevent immediate duplicate triggers
      }
    }, true);
  }

  const commentObserver = new MutationObserver((mutations) => {
    // Skip if we're updating DOM, API call is in progress, or pagination is happening
    if (window.isUpdatingCommentDOM || isApiCallInProgress || isProcessingComments || isPaginationInProgress || isAnalysisInProgress) return;
    
    // Extra protection: if pagination trigger is active, skip comment observer
    if (paginationTriggerTimeout) {
      console.log('Comment observer: Pagination trigger active, skipping to prevent duplicate analysis');
      return;
    }
    
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
      console.log('Comment observer: New comments detected in DOM');
      debouncedProcessComments();
    }
  });

  commentObserver.observe(commentsSection, { childList: true, subtree: true });

  // Only trigger initial analysis if not during pagination and auto-extract is enabled
  if (!isPaginationInProgress && !paginationTriggerTimeout && !isAnalysisInProgress) {
    const comments = ShopeeHelpers.extractShopeeCommentTexts();
    if (comments && comments.length > 0) {
      console.log('Initial setup: Triggering analysis for existing comments');
      window.CommentExtractor.extractAllComments(false).then(detailedComments => {
        showCommentsOverlay(detailedComments.length > 0 ? detailedComments : comments);
      }).catch(error => {
        console.error('Error extracting detailed comments:', error);
        showCommentsOverlay(comments);
      });
    }
  } else {
    console.log('Initial setup: Skipping analysis - pagination in progress or analysis already active');
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
    
    // Reset session tracking when URL changes (but keep page cache)
    analyzedComments.clear();
    window.extractedCommentsCache = [];
    isApiCallInProgress = false;
    if (apiCallTimer) clearTimeout(apiCallTimer);
    
    // Clean up expired cache entries periodically
    cleanupCache();
    
    // Notify popup about URL change
    chrome.runtime.sendMessage({
      action: "urlChanged",
      oldUrl,
      newUrl: currentUrl
    }).catch(err => console.log("Popup not open"));
    
    waitForCommentsSection();
  }
  
  // Check for hash changes (often used for pagination) - with reduced aggressiveness
  if (currentUrlHash !== newHash) {
    console.log(`URL hash changed from ${currentUrlHash} to ${newHash}`);
    currentUrlHash = newHash;
    
    // Only process if hash looks like pagination AND we haven't processed recently
    const now = Date.now();
    if (newHash.match(/[0-9]/) && isAutoExtractEnabled && !isProcessingComments) {
      console.log('Processing hash change for pagination');
      
      // Prevent multiple pagination triggers
      if (paginationTriggerTimeout) {
        clearTimeout(paginationTriggerTimeout);
        console.log('Cleared existing pagination trigger timeout from hash change');
      }
      
      // If pagination is already in progress, skip this trigger
      if (isPaginationInProgress) {
        console.log('Pagination already in progress, ignoring hash change trigger');
        return;
      }
      
      paginationTriggerTimeout = setTimeout(() => {
        // Clear cache and reprocess comments
        analyzedComments.clear();
        window.extractedCommentsCache = [];
        lastProcessedCommentsHash = ''; // Reset duplicate detection
        
        // Clear any existing analysis displays immediately
        const existingAnalysis = document.querySelectorAll('.comment-analysis');
        existingAnalysis.forEach(div => div.remove());
        console.log('Cleared analysis displays during hash change pagination');
        
        // Set pagination flag
        isPaginationInProgress = true;
        
        setTimeout(() => {
          console.log('Executing debouncedProcessComments after hash change');
          // Reset processing flags to ensure analysis runs
          isProcessingComments = false;
          isApiCallInProgress = false;
          isAnalysisInProgress = false;
          lastProcessingTime = 0; // Reset timing restriction
          debouncedProcessComments();
          
          // Reset pagination flag after processing
          setTimeout(() => {
            isPaginationInProgress = false;
            paginationTriggerTimeout = null;
            console.log('Hash change processing complete');
          }, 1000);
        }, 1000);
      }, 300); // Short delay to prevent immediate duplicate triggers
    }
  }
}

// Check if pagination has changed - improved detection
let lastPaginationCheckTime = 0;
function checkPaginationChange() {
  try {
    // Throttle pagination checks
    const now = Date.now();
    if (now - lastPaginationCheckTime < 2000) return; // Max once per 2 seconds
    
    // Multiple selectors for different Shopee layouts
    const paginationSelectors = [
      '.shopee-page-controller > .shopee-button-solid--primary',
      '.shopee-page-controller .shopee-button-solid--primary',
      '.shopee-pagination .active',
      '.shopee-page-controller [class*="primary"]',
      '.shopee-page-controller button[class*="active"]',
      '.shopee-page-controller button[aria-current="page"]'
    ];
    
    let activePaginationElement = null;
    let foundSelector = '';
    for (const selector of paginationSelectors) {
      activePaginationElement = document.querySelector(selector);
      if (activePaginationElement) {
        foundSelector = selector;
        break;
      }
    }
    
    if (activePaginationElement) {
      const currentPage = activePaginationElement.textContent.trim();
      console.log(`Pagination check: current page "${currentPage}", tracked page "${currentPaginationPage}", selector: ${foundSelector}`);
      
      // If the page number changed, process comments again
      if (currentPage !== currentPaginationPage && currentPage !== '' && /^\d+$/.test(currentPage)) {
        console.log(`=== PAGINATION PAGE NUMBER CHANGED ===`);
        console.log(`Pagination changed from ${currentPaginationPage} to ${currentPage}`);
        currentPaginationPage = currentPage;
        lastPaginationCheckTime = now;
        
        // Clear previous analysis to force reprocessing
        analyzedComments.clear();
        window.extractedCommentsCache = [];
        
        // Clear any existing analysis displays immediately
        const existingAnalysis = document.querySelectorAll('.comment-analysis');
        existingAnalysis.forEach(div => div.remove());
        console.log('Cleared analysis displays during page number change');
        
        // Set pagination flag
        isPaginationInProgress = true;
        
        // Show user feedback
        const feedbackDiv = document.createElement('div');
        feedbackDiv.style.cssText = 'position: fixed; top: 20px; right: 20px; background: #4CAF50; color: white; padding: 10px 15px; z-index: 999999; border-radius: 5px; font-family: Arial, sans-serif; font-size: 14px;';
        feedbackDiv.textContent = `📄 Switched to page ${currentPage}`;
        document.body.appendChild(feedbackDiv);
        
        // Process comments with longer delay for content to load
        setTimeout(() => {
          feedbackDiv.remove();
          // Force processing during pagination change regardless of timing restrictions
          // But only if no other pagination trigger is active
          if (isAutoExtractEnabled && !paginationTriggerTimeout) {
            console.log('checkPaginationChange: Processing comments after pagination page number change');
            
            // Prevent multiple pagination triggers
            if (paginationTriggerTimeout) {
              clearTimeout(paginationTriggerTimeout);
              console.log('checkPaginationChange: Cleared existing pagination trigger timeout');
            }
            
            paginationTriggerTimeout = setTimeout(() => {
              // Reset processing flags to ensure analysis runs
              isProcessingComments = false;
              isApiCallInProgress = false;
              isAnalysisInProgress = false;
              lastProcessingTime = 0; // Reset timing restriction
              debouncedProcessComments();
              
              // Reset coordination after processing
              setTimeout(() => {
                paginationTriggerTimeout = null;
              }, 1000);
            }, 200);
          } else {
            console.log('checkPaginationChange: Skipping processing - auto-extract disabled or pagination trigger active');
          }
          
          // Reset pagination flag after processing
          setTimeout(() => {
            isPaginationInProgress = false;
            console.log('Pagination page number change processing complete');
          }, 2000);
        }, 2500); // Increased delay for more stability
      }
    }
  } catch (error) {
    console.error('Error checking pagination:', error);
  }
}

// Poll for URL and pagination changes with reasonable frequency  
setInterval(checkUrlChange, 1500); // Reduced frequency from 2000ms to 1500ms

// Additional periodic check for unprocessed comments (backup detection) - much less aggressive
let lastPeriodicCheckTime = 0;
setInterval(() => {
  if (!isAutoExtractEnabled || isApiCallInProgress || isProcessingComments) return;
  
  // Throttle periodic checks to prevent excessive processing
  const now = Date.now();
  if (now - lastPeriodicCheckTime < 15000) return; // Increased from 5s to 15s
  
  lastPeriodicCheckTime = now;
  
  // Only check if there might be unprocessed comments
  const comments = ShopeeHelpers ? ShopeeHelpers.extractShopeeCommentTexts() : [];
  if (comments.length > 0) {
    const commentsHash = comments.join('|');
    if (!analyzedComments.has(commentsHash)) {
      console.log('Periodic check: Found unprocessed comments, triggering processing');
      debouncedProcessComments();
    }
  }
}, 15000); // Increased from 10s to 15s

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
      // Only if not already in progress to prevent double analysis
      if (isAutoExtractEnabled && !isAnalysisInProgress && !isPaginationInProgress && !paginationTriggerTimeout) {
        console.log('waitForCommentsSection: Auto-extract enabled, scheduling analysis');
        // Give a moment for the page to fully render
        setTimeout(() => {
          if (!isAnalysisInProgress && !isPaginationInProgress) {
            debouncedProcessComments();
          }
        }, 500);
      } else {
        console.log('waitForCommentsSection: Skipping auto-extract - analysis already in progress or pagination active');
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
    // Only if not already in progress to prevent double analysis  
    if (isAutoExtractEnabled && !isAnalysisInProgress && !isPaginationInProgress && !paginationTriggerTimeout) {
      console.log('waitForCommentsSection: Section exists, auto-extract enabled, triggering analysis');
      debouncedProcessComments();
    } else {
      console.log('waitForCommentsSection: Skipping auto-extract - analysis already in progress or pagination active');
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
      
      // Force enable for debugging
      if (!isAutoExtractEnabled) {
        console.log('Force enabling auto-extract for debugging');
        isAutoExtractEnabled = true;
      }
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

// Periodic cache cleanup every 30 minutes
setInterval(() => {
  cleanupCache();
}, 30 * 60 * 1000);

// Display cache status in console
setInterval(() => {
  if (pageAnalysisCache.size > 0) {
    console.log(`📋 Page Analysis Cache: ${pageAnalysisCache.size}/${MAX_CACHE_SIZE} pages cached`);
    const cacheEntries = Array.from(pageAnalysisCache.entries());
    cacheEntries.forEach(([pageId, data]) => {
      const age = Math.round((Date.now() - data.timestamp) / 1000 / 60); // minutes
      console.log(`  - ${pageId}: ${age}min old, ${data.commentsHash.split('|').length} comments`);
    });
  }
}, 2 * 60 * 1000); // Every 2 minutes