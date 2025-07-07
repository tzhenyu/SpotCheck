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
  STAR_RATING: 'div.rGdC5O'
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
      const timestamp = extractTimestamp(commentContainer);
      const starRating = extractStarRating(commentContainer);
      
      // Create a unique identifier to avoid duplicates when accumulating
      const commentId = `${username}-${timestamp}-${commentText.substring(0, 20)}`;
      
      const commentData = {
        comment: commentText,
        username: username,
        timestamp: timestamp,
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
  
  // Add current page comments to accumulated collection
  accumulateCurrentPageComments();
  
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
 * @returns {string} The timestamp or 'Unknown time' if not found
 */
function extractTimestamp(container) {
  const timestampElement = container.querySelector(COMMENT_SELECTORS.TIMESTAMP);
  return timestampElement ? timestampElement.textContent.trim() : 'Unknown time';
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

// Export functions to global scope for use in other scripts
window.CommentExtractor = {
  extractAllComments,
  waitForComments,
  extractStarRating,
  COMMENT_SELECTORS
};
