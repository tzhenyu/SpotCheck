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
      // Skip comments with less than 3 words
      if (commentText.split(/\s+/).length < 3) return;
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
  let match = rawText.match(timestampRegex);
  let timestamp = '';
  
  // First try to extract timestamp from the whole string
  if (match && match[1]) {
    timestamp = match[1];
  } 
  // If no timestamp found in the whole string but it contains a separator
  else if (rawText.includes('|')) {
    // Split by pipe and check each part for a timestamp
    const parts = rawText.split('|');
    for (const part of parts) {
      match = part.trim().match(timestampRegex);
      if (match && match[1]) {
        timestamp = match[1];
        break;
      }
    }
  }
  
  // If we found a timestamp anywhere in the string
  if (timestamp) {
    // Check if this is the "timestamp | Variation" format
    if (rawText.includes('Variation:')) {
      const parts = rawText.split('|');
      return {
        timestamp: timestamp,
        timestampOnly: timestamp,
        variation: parts.length > 1 ? parts[1].replace('Variation:', '').trim() : '',
        raw: rawText
      };
    } 
    // Check if this is the "Location | timestamp" or "timestamp | Location" format
    else if (rawText.includes('|')) {
      const parts = rawText.split('|');
      return {
        timestamp: `${parts[0].trim()} | ${parts[1].trim()}`,
        timestampOnly: timestamp,
        variation: '',
        location: timestamp === parts[0].trim() ? parts[1].trim() : parts[0].trim(),
        raw: rawText
      };
    }
    // Just the timestamp with no other information
    else {
      return {
        timestamp: timestamp,
        timestampOnly: timestamp,
        variation: '',
        raw: rawText
      };
    }
  }
  
  // If no timestamp match found, return the original text
  return {
    timestamp: rawText,
    timestampOnly: '',
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
 * Formats accumulated comments for API upload
 * @returns {Object} Object with comments array and metadata array
 */
function formatCommentsForUpload() {
  if (!accumulatedComments.length) return { comments: [], metadata: [] };
  
  // Get product information
  const productTitle = document.title || 'Unknown Product';
  const productURL = window.location.href;
  const source = window.location.hostname;
  
  // Extract only comment texts for the comments array
  const commentTexts = accumulatedComments.map(c => c.comment);
  
  // Format metadata for each comment
  const metadata = accumulatedComments.map(c => ({
    comment: c.comment,
    username: c.username,
    rating: c.starRating || 0,
    source: source,
    product: productTitle,
    timestamp: c.timestampOnly || new Date().toISOString()
  }));
  
  return {
    comments: commentTexts,
    metadata: metadata
  };
}

/**
 * Resets accumulated comments
 */
function resetAccumulatedComments() {
  accumulatedComments = [];
  return [];
}

/**
 * Handles URL change messages from contentScript.js or background.js
 * @param {Object} message - The message containing URL change information
 */
function handleUrlChange(message) {
  console.log("CommentExtractor handling URL change:", message);
  
  // Also check for extracted comments in the window cache (set by Gemini analysis flow)
  const commentsToUpload = accumulatedComments.length > 0 ? 
    accumulatedComments : 
    (window.extractedCommentsCache && window.extractedCommentsCache.length > 0 ? 
      window.extractedCommentsCache : []);
  
  // Don't upload if no comments have been accumulated
  if (message.uploadComments && commentsToUpload.length > 0) {
    console.log("Uploading comments on URL change:", commentsToUpload.length);
    
    // Format comments for the backend API
    let formattedData;
    
    // Use different formatting based on which source we're using
    if (accumulatedComments.length > 0) {
      formattedData = formatCommentsForUpload();
    } else {
      // Format the extractedCommentsCache for upload
      const commentTexts = commentsToUpload.map(c => c.comment);
      const metadata = commentsToUpload.map(c => ({
        comment: c.comment,
        username: c.username,
        rating: c.starRating || 0,
        source: window.location.hostname,
        product: document.title || 'Unknown Product',
        timestamp: c.timestampOnly || new Date().toISOString()
      }));
      
      formattedData = {
        comments: commentTexts,
        metadata: metadata
      };
    }
    
    // Show notification in the page
    // const notificationDiv = document.createElement('div');
    // notificationDiv.style.position = 'fixed';
    // notificationDiv.style.bottom = '20px';
    // notificationDiv.style.right = '20px';
    // notificationDiv.style.padding = '10px 15px';
    // notificationDiv.style.backgroundColor = '#4CAF50';
    // notificationDiv.style.color = 'white';
    // notificationDiv.style.borderRadius = '5px';
    // notificationDiv.style.zIndex = '10000';
    // notificationDiv.style.boxShadow = '0 2px 5px rgba(0,0,0,0.2)';
    // notificationDiv.textContent = `Uploading ${commentsToUpload.length} comments...`;
    // document.body.appendChild(notificationDiv);
    
    // Send to background script to make API call
    chrome.runtime.sendMessage({
      action: "callAPI",
      endpoint: "comments",
      data: formattedData
    }, response => {
      console.log("Comment upload response:", response);
      
      // Update notification
      // if (response && response.success) {
      //   notificationDiv.textContent = `Successfully uploaded ${commentsToUpload.length} comments`;
      //   notificationDiv.style.backgroundColor = '#4CAF50'; // Green
      // } else {
      //   notificationDiv.textContent = 'Failed to upload comments';
      //   notificationDiv.style.backgroundColor = '#F44336'; // Red
      // }
      
      // Remove notification after a delay
      setTimeout(() => {
        if (notificationDiv.parentNode) {
          notificationDiv.parentNode.removeChild(notificationDiv);
        }
      }, 3000);
    });
  }
  
  // Reset accumulated comments after processing
  resetAccumulatedComments();
  // Also clear the window cache
  window.extractedCommentsCache = [];
  console.log("URL changed, comments cleared");
}

// Listen for messages from background script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "urlChanged") {
    // Handle URL change via the common handler
    handleUrlChange(message);
    
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
  formatCommentsForUpload,
  handleUrlChange,
  COMMENT_SELECTORS
};
