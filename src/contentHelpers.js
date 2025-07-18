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
  // Always get fresh elements from current DOM
  const commentElements = document.querySelectorAll(SELECTORS.COMMENT_DIV);
  console.log(`extractShopeeCommentTexts: Found ${commentElements.length} comment elements`);
  
  return Array.from(commentElements)
    .map(el => el.textContent.trim())
    .filter(text => text.length > 0);
}

/**
 * Create analysis div for a comment
 * @param {object} result - Analysis result with is_fake and explanation
 * @returns {HTMLElement} The created div element
 */
function createAnalysisDiv(result) {
  if (!result) {
    console.error('createAnalysisDiv: result is null or undefined');
    return null;
  }
  
  const analysisDiv = document.createElement('div');
  analysisDiv.className = DOM_CLASSES.COMMENT_ANALYSIS;
  analysisDiv.style.marginTop = '4px';
  analysisDiv.style.padding = '4px';
  analysisDiv.style.borderRadius = '4px';
  let verdict = 'REAL';
  let color = COLORS.REAL;
  let bgColor = COLORS.REAL_BG;
  let explanation = result.explanation || result.reason || '';

  try {
    if (typeof result.verdict === 'string') {
      const backendVerdict = result.verdict.trim();
      if (/^fake$/i.test(backendVerdict) || (backendVerdict.length > 0 && backendVerdict.toLowerCase().includes('fake'))) {
        verdict = 'FAKE';
        color = COLORS.FAKE;
        bgColor = COLORS.FAKE_BG;
        if (!explanation || explanation === 'No explanation provided') {
          explanation = 'This review appears suspicious based on analysis.';
        }
      } else if (/^suspicious$/i.test(backendVerdict)) {
        verdict = 'SUSPICIOUS';
        color = '#ffa500';
        bgColor = 'rgba(255,165,0,0.1)';
        if (!explanation || explanation === 'No explanation provided') {
          explanation = 'This review requires further investigation.';
        }
      } else if (/^not relevant$/i.test(backendVerdict)) {
        verdict = 'NOT RELEVANT';
        color = '#888';
        bgColor = 'rgba(128,128,128,0.1)';
        if (!explanation || explanation === 'No explanation provided') {
          explanation = 'This review is not related to the product.';
        }
      } else if (/^genuine$/i.test(backendVerdict)) {
        verdict = 'GENUINE';
        color = COLORS.REAL;
        bgColor = COLORS.REAL_BG;
        if (!explanation || explanation === 'No explanation provided' || explanation.trim().endsWith('because')) {
          explanation = 'This review appears authentic and helpful.';
        }
      } else if (/^real$/i.test(backendVerdict)) {
        verdict = 'REAL';
        color = COLORS.REAL;
        bgColor = COLORS.REAL_BG;
      } else {
        verdict = backendVerdict.toUpperCase();
        color = '#666';
        bgColor = 'rgba(128,128,128,0.1)';
      }
    } else if (typeof explanation === 'string') {
      const match = explanation.match(/^(Genuine|Suspicious|Not Relevant|Fake|REAL|FAKE)\b\s*[:-]?\s*/i);
      if (match) {
        verdict = match[1].toUpperCase();
        explanation = explanation.slice(match[0].length).trim();
        if (verdict === 'FAKE') {
          color = COLORS.FAKE;
          bgColor = COLORS.FAKE_BG;
        } else if (verdict === 'SUSPICIOUS') {
          color = '#ffa500';
          bgColor = 'rgba(255,165,0,0.1)';
        } else if (verdict === 'NOT RELEVANT') {
          color = '#888';
          bgColor = 'rgba(128,128,128,0.1)';
        } else if (verdict === 'GENUINE' || verdict === 'REAL') {
          verdict = 'REAL';
          color = COLORS.REAL;
          bgColor = COLORS.REAL_BG;
          if (!explanation || explanation.trim() === '') {
            explanation = 'This review appears authentic and helpful.';
          }
        } else {
          color = COLORS.REAL;
          bgColor = COLORS.REAL_BG;
          if (!explanation || explanation.trim() === '') {
            explanation = 'This review appears authentic.';
          }
        }
      } else if (explanation.toLowerCase().includes('fake') || explanation.toLowerCase().includes('suspicious')) {
        verdict = 'FAKE';
        color = COLORS.FAKE;
        bgColor = COLORS.FAKE_BG;
      } else {
        verdict = 'REAL';
        color = COLORS.REAL;
        bgColor = COLORS.REAL_BG;
        if (!explanation || explanation.trim() === '' || explanation === 'No explanation provided' || explanation.trim().endsWith('because')) {
          explanation = 'This review appears authentic.';
        }
      }
    }
  } catch (error) {
    console.error('createAnalysisDiv: Error processing verdict/explanation:', error);
    verdict = 'ERROR';
    explanation = 'Error processing result';
    color = '#f00';
    bgColor = 'rgba(255,0,0,0.1)';
  }
  
  analysisDiv.style.backgroundColor = bgColor;
  analysisDiv.style.border = `1px solid ${color}`;
  analysisDiv.style.fontSize = '12px';
  analysisDiv.innerHTML = `<span style="font-weight:bold;color:${color}">${verdict}</span>: ${explanation}`;
  
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
    // Always get fresh data from current page, don't use cached data
    if (window.CommentExtractor) {
      console.log('extractDetailedCommentData: Using CommentExtractor for fresh extraction');
      // Call the synchronous current page extraction to get fresh data
      const currentPageComments = window.CommentExtractor.extractCurrentPageComments();
      return currentPageComments;
    } else {
      console.log('extractDetailedCommentData: Using fallback extraction');
      // Fallback to basic comment extraction with fresh data
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