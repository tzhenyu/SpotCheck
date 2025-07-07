/**
 * Content script helpers for Shopee Comment Extractor
 * Contains utility functions that bind to contentScript.js
 */

const SELECTORS = {
  COMMENT_DIV: 'div.YNedDV',
  COMMENT_LIST: '.shopee-product-comment-list',
  CENSORED_USERNAME: 'div.InK5kS',
  UNCENSORED_USERNAME: 'a.InK5kS',
  TIMESTAMP: 'div.XYk98l'
};

const COLORS = {
  FAKE: '#f55',
  REAL: '#5f5',
  FAKE_BG: 'rgba(255,85,85,0.1)',
  REAL_BG: 'rgba(85,255,85,0.1)'
};

const DOM_CLASSES = {
  COMMENT_ANALYSIS: 'comment-analysis'
};

/**
 * Extract comment texts from Shopee product page
 * @returns {string[]} Array of comment texts
 */
function extractShopeeCommentTexts() {
  return Array.from(document.querySelectorAll(SELECTORS.COMMENT_DIV))
    .map(el => el.textContent.trim());
}

/**
 * Create analysis div for a comment
 * @param {object} result - Analysis result with is_fake and explanation
 * @returns {HTMLElement} The created div element
 */
function createAnalysisDiv(result) {
  const analysisDiv = document.createElement('div');
  analysisDiv.className = DOM_CLASSES.COMMENT_ANALYSIS;
  analysisDiv.style.marginTop = '4px';
  analysisDiv.style.padding = '4px';
  analysisDiv.style.borderRadius = '4px';
  analysisDiv.style.backgroundColor = result.is_fake ? COLORS.FAKE_BG : COLORS.REAL_BG;
  analysisDiv.style.border = `1px solid ${result.is_fake ? COLORS.FAKE : COLORS.REAL}`;
  analysisDiv.style.fontSize = '12px';
  
  analysisDiv.innerHTML = `<span style="font-weight:bold;color:${result.is_fake ? COLORS.FAKE : COLORS.REAL}">${result.is_fake ? 'FAKE' : 'REAL'}</span>: ${result.explanation}`;
  
  return analysisDiv;
}

/**
 * Create loading overlay to show during API calls
 * @returns {HTMLElement} The created overlay
 */
function createLoadingOverlay() {
  const logDiv = document.createElement('div');
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
  
  const apiLoadingDiv = document.createElement('div');
  apiLoadingDiv.id = 'api-loading';
  apiLoadingDiv.textContent = 'Analyzing comments...';
  logDiv.appendChild(apiLoadingDiv);
  
  return logDiv;
}

/**
 * Create error message overlay
 * @param {string} errorMessage - Error message to display
 * @returns {HTMLElement} The created error overlay
 */
function createErrorOverlay(errorMessage) {
  const errorDiv = document.createElement('div');
  errorDiv.id = 'shopee-comments-error';
  errorDiv.style.position = 'fixed';
  errorDiv.style.bottom = '0';
  errorDiv.style.left = '0';
  errorDiv.style.padding = '8px';
  errorDiv.style.background = 'rgba(0,0,0,0.8)';
  errorDiv.style.color = COLORS.FAKE;
  errorDiv.style.fontFamily = 'monospace';
  errorDiv.style.zIndex = '999999';
  errorDiv.style.fontSize = '12px';
  errorDiv.innerHTML = `<b>Error:</b> ${errorMessage}`;
  
  return errorDiv;
}

// Export all functions to be used by contentScript.js
window.ShopeeHelpers = {
  extractShopeeCommentTexts,
  createAnalysisDiv,
  createLoadingOverlay,
  createErrorOverlay,
  
  /**
   * Extract detailed comment data including username and timestamp
   * @returns {Array<Object>} Array of comment objects with text, username, and timestamp
   */
  extractDetailedCommentData() {
    // Use CommentExtractor if available, otherwise fallback to basic extraction
    if (window.CommentExtractor) {
      return window.CommentExtractor.extractAllComments();
    } else {
      // Fallback to basic comment extraction
      const comments = this.extractShopeeCommentTexts();
      return comments.map(text => ({
        comment: text,
        username: 'Unknown user',
        timestamp: 'Unknown time',
        isCensored: false
      }));
    }
  },
  
  SELECTORS,
  COLORS,
  DOM_CLASSES
};
