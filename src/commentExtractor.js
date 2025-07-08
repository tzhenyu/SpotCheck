/**
 * Comment Extractor for Shopee product reviews
 * Extracts comments, usernames, and timestamps from Shopee product pages
 * Handles pagination by accumulating comments across page navigation
 */

const COMMENT_SELECTORS = {
  CENSORED_USERNAME: 'div.InK5kS',
  UNCENSORED_USERNAME: 'a.InK5kS',
  TIMESTAMP: 'div.XYk98l',
  COMMENT: 'div.YNedDV',
  COMMENT_CONTAINER: '.shopee-product-comment-list',
  PAGINATION_BUTTON: '.shopee-icon-button--right',
  PAGINATION_ACTIVE: '.shopee-page-controller > .shopee-button-solid--primary',
  STAR_RATING: 'div.rGdC5O',
};

// Store accumulated comments across pagination
let accumulatedComments = [];

/**
 * Extracts comments from the current page and adds them to the accumulated collection
 * @returns {Array<Object>} Array of comment objects with text, username, and timestamp
 */
function extractCurrentPageComments() {
  const commentElements = document.querySelectorAll(COMMENT_SELECTORS.COMMENT);
  const currentPageComments = [];

  commentElements.forEach((commentElement) => {
    // Find the parent container that contains both comment and metadata
    const commentContainer = findCommentContainer(commentElement);
    
    if (commentContainer) {
      const commentText = commentElement.textContent.trim();
      const username = extractUsername(commentContainer);
      const timestampData = extractTimestamp(commentContainer);
      const starRating = extractStarRating(commentContainer);
      
      // Create a unique identifier to avoid duplicates when accumulating
      const commentId = `${username}-${timestampData.raw}-${commentText.substring(0, 20)}`;
      
      const commentData = {
        comment: commentText,
        username: username,
        timestamp: timestampData.raw,
        timestampOnly: timestampData.timestamp,
        variation: timestampData.variation,
        isCensored: isCensoredUsername(commentContainer),
        starRating: starRating,
        id: commentId
      };
      
      currentPageComments.push(commentData);
    }
  });

  return currentPageComments;
}

/**
 * Adds current page comments to accumulated comments, avoiding duplicates
 */
function accumulateCurrentPageComments() {
  const currentComments = extractCurrentPageComments();
  const pageMetadata = extractPageMetadata();
  
  // Add page metadata to each comment
  currentComments.forEach(comment => {
    comment.pageTimestamp = pageMetadata.pageTimestamp;
    comment.variation = pageMetadata.variation;
  });
  
  // Add comments to accumulated collection, avoiding duplicates
  currentComments.forEach(comment => {
    const isDuplicate = accumulatedComments.some(existingComment => 
      existingComment.id === comment.id
    );
    
    if (!isDuplicate) {
      accumulatedComments.push(comment);
    }
  });
  
  return currentComments;
}

/**
 * Extracts all comments with pagination handling
 * @param {boolean} resetAccumulated - Whether to reset accumulated comments
 * @returns {Promise<Array<Object>>} Promise resolving to array of all comments
 */
async function extractAllComments(resetAccumulated = false) {
  if (resetAccumulated) {
    accumulatedComments = [];
  }
  
  // Extract page metadata
  const pageMetadata = extractPageMetadata();
  
  // Add current page comments to accumulated collection
  const currentPageComments = accumulateCurrentPageComments();
  
  // Add page metadata to each comment
  currentPageComments.forEach(comment => {
    comment.pageTimestamp = pageMetadata.pageTimestamp;
    comment.variation = pageMetadata.variation;
  });
  
  return accumulatedComments;
}

/**
 * Finds the parent container element that contains both comment and metadata
 * @param {HTMLElement} element - The comment element
 * @returns {HTMLElement|null} The parent container or null if not found
 */
function findCommentContainer(element) {
  // Traverse up to find a common parent for comment and metadata
  let container = element.parentElement;
  // Go up max 5 levels to find container with username and timestamp
  for (let i = 0; i < 5; i++) {
    if (!container) return null;
    
    // Check if this container has username and timestamp elements
    const hasUsername = container.querySelector(COMMENT_SELECTORS.CENSORED_USERNAME) || 
                       container.querySelector(COMMENT_SELECTORS.UNCENSORED_USERNAME);
    const hasTimestamp = container.querySelector(COMMENT_SELECTORS.TIMESTAMP);
    
    if (hasUsername && hasTimestamp) return container;
    
    container = container.parentElement;
  }
  
  return null;
}

/**
 * Extracts username from a comment container
 * @param {HTMLElement} container - The comment container element
 * @returns {string} The username or 'Unknown user' if not found
 */
function extractUsername(container) {
  const censoredUser = container.querySelector(COMMENT_SELECTORS.CENSORED_USERNAME);
  const uncensoredUser = container.querySelector(COMMENT_SELECTORS.UNCENSORED_USERNAME);
  
  if (uncensoredUser) return uncensoredUser.textContent.trim();
  if (censoredUser) return censoredUser.textContent.trim();
  
  return 'Unknown user';
}

/**
 * Extracts star rating from a comment container
 * @param {HTMLElement} container - The comment container element
 * @returns {number} The star rating (1-5) or 0 if not found
 */
function extractStarRating(container) {
  const ratingElement = container.querySelector(COMMENT_SELECTORS.STAR_RATING);
  if (!ratingElement) return 0;
  
  const solidStars = ratingElement.querySelectorAll('.icon-rating-solid');
  return solidStars.length;
}

/**
 * Checks if the username is censored
 * @param {HTMLElement} container - The comment container element
 * @returns {boolean} True if username is censored
 */
function isCensoredUsername(container) {
  return Boolean(container.querySelector(COMMENT_SELECTORS.CENSORED_USERNAME));
}

/**
 * Extracts timestamp from a comment container
 * @param {HTMLElement} container - The comment container element
 * @returns {object} Object with timestamp and variation properties
 */
function extractTimestamp(container) {
  const timestampElement = container.querySelector(COMMENT_SELECTORS.TIMESTAMP);
  if (!timestampElement) return { timestamp: 'Unknown time', variation: '', raw: 'Unknown time' };
  
  const rawText = timestampElement.textContent.trim();
  
  // Regular expression to find timestamp in format "YYYY-MM-DD HH:MM"
  const timestampRegex = /(\d{4}-\d{2}-\d{2}\s\d{2}:\d{2})/;
  const match = rawText.match(timestampRegex);
  
  if (match && match[1]) {
    // We found a timestamp in the required format
    const timestamp = match[1];
    
    // Check if this is the "timestamp | Variation" format
    if (rawText.includes('Variation:')) {
      const parts = rawText.split('|');
      return {
        timestamp: timestamp,
        variation: parts.length > 1 ? parts[1].replace('Variation:', '').trim() : '',
        raw: rawText
      };
    } 
    // Check if this is the "Location | timestamp" format
    else if (rawText.includes('|')) {
      const parts = rawText.split('|');
      return {
        timestamp: timestamp,
        variation: '',  // No variation in this format
        location: parts[0].trim(),
        raw: rawText
      };
    }
    // Just the timestamp with no other information
    else {
      return {
        timestamp: timestamp,
        variation: '',
        raw: rawText
      };
    }
  }
  
  // If no match found, return the original text
  return {
    timestamp: '',
    variation: '',
    raw: rawText
  };
}

/**
 * Waits for comments to load on the page
 * @param {Function} callback - Function to call when comments are loaded
 */
function waitForComments(callback) {
  const observer = new MutationObserver((mutations) => {
    const commentContainer = document.querySelector(COMMENT_SELECTORS.COMMENT_CONTAINER);
    const comments = document.querySelectorAll(COMMENT_SELECTORS.COMMENT);
    
    if (commentContainer && comments.length > 0) {
      observer.disconnect();
      callback();
    }
  });
  
  observer.observe(document.body, { childList: true, subtree: true });
  
  // Also check if comments are already loaded
  if (document.querySelectorAll(COMMENT_SELECTORS.COMMENT).length > 0) {
    observer.disconnect();
    callback();
  }
}

/**
 * Extracts page timestamp and variation information
 * @returns {Object} Object with pageTimestamp and variation
 */
function extractPageMetadata() {
  let pageTimestampStr = "";
  let variationStr = "";
  
  // Look for text content that matches the timestamp format
  const bodyText = document.body.innerText;
  const timestampMatch = bodyText.match(/(\d{4}-\d{2}-\d{2}\s\d{2}:\d{2})\s*\|\s*Variation:\s*([^,\n]+)/);
  
  if (timestampMatch && timestampMatch.length >= 3) {
    pageTimestampStr = timestampMatch[1].trim();
    variationStr = timestampMatch[2].trim();
  }
  
  return {
    pageTimestamp: pageTimestampStr,
    variation: variationStr
  };
}

/**
 * Resets accumulated comments
 */
function resetAccumulatedComments() {
  accumulatedComments = [];
  return [];
}

// Listen for messages from background script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "urlChanged") {
    resetAccumulatedComments();
    console.log("URL changed, comments cleared");
    // Send response to confirm receipt
    if (sendResponse) sendResponse({ status: "Comments cleared" });
  }
  return true;
});

// Export functions to global scope for use in other scripts
window.CommentExtractor = {
  extractAllComments,
  waitForComments,
  extractStarRating,
  extractPageMetadata,
  resetAccumulatedComments,
  COMMENT_SELECTORS
};
