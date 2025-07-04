function extractShopeeCommentTexts() {
  return Array.from(document.querySelectorAll('div.YNedDV'))
    .map(el => el.textContent.trim());
}

function showCommentsOverlay(comments) {
  // Remove previous overlay if exists
  let logDiv = document.getElementById('shopee-comments-overlay');
  if (logDiv) logDiv.remove();

  // Create new overlay
  logDiv = document.createElement('div');
  logDiv.id = 'shopee-comments-overlay';
  logDiv.style.position = 'fixed';
  logDiv.style.bottom = '0';
  logDiv.style.left = '0';
  logDiv.style.width = '100vw';
  logDiv.style.maxHeight = '200px';
  logDiv.style.overflowY = 'auto';
  logDiv.style.background = 'rgba(0,0,0,0.8)';
  logDiv.style.color = '#0f0';
  logDiv.style.fontFamily = 'monospace';
  logDiv.style.zIndex = '999999';
  logDiv.style.fontSize = '12px';
  logDiv.style.padding = '5px';
  logDiv.innerHTML = '<b>Shopee Comments:</b><br>';

  comments.forEach((comment, idx) => {
    const div = document.createElement('div');
    div.textContent = `${idx + 1}. ${comment}`;
    logDiv.appendChild(div);
  });

  document.body.appendChild(logDiv);
}

// Watch for changes in the comment list container
function observeShopeeComments() {
  const commentsSection = document.querySelector('.shopee-product-comment-list');
  if (!commentsSection) return;

  const observer = new MutationObserver(() => {
    const comments = extractShopeeCommentTexts();
    showCommentsOverlay(comments);
  });

  // Observe subtree for any change (new comments, page change, etc)
  observer.observe(commentsSection, { childList: true, subtree: true });

  // Initial run
  const comments = extractShopeeCommentTexts();
  showCommentsOverlay(comments);
}

// Set up URL change detection outside of waitForCommentsSection
let currentUrl = window.location.href;

function checkUrlChange() {
  if (currentUrl !== window.location.href) {
    currentUrl = window.location.href;
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
    const section = document.querySelector('.shopee-product-comment-list');
    if (section) {
      observeShopeeComments();
      observer.disconnect();
    }
  });

  if (document.querySelector('.shopee-product-comment-list')) {
    observeShopeeComments();
    return;
  }

  observer.observe(document.body, { childList: true, subtree: true });
}

// Start the watcher
waitForCommentsSection();
