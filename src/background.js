const API_BASE_URL = "http://127.0.0.1:8000";

// Check if the URL is a Shopee product page
function isShopeeProductPage(url) {
  if (!url) return false;
  
  // Match common Shopee product URL patterns across different domains
  return url.match(/shopee\.(sg|com|ph|co\.id|com\.my).*\/product\/\d+\/\d+/i) !== null;
}

async function callAPI(endpoint, data = null) {
  try {
    console.log(`Calling ${endpoint} from background script with data:`, data);
    
    const options = {
      method: data ? 'POST' : 'GET',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      },
      cache: 'no-cache'
    };
    
    if (data) {
      options.body = JSON.stringify(data);
    }
    
    const response = await fetch(`${API_BASE_URL}/${endpoint}`, options);
    
    if (!response.ok) {
      throw new Error(`HTTP error ${response.status}`);
    }
    
    return await response.json();
  } catch (error) {
    console.error(`Error calling ${endpoint}:`, error);
    throw error;
  }
}

const AUTO_EXTRACT_STORAGE_KEY = "auto_extract_enabled";

// Listen for tab updates to detect when a user navigates to a Shopee product page
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  // Only proceed if the tab has completed loading and has a URL
  if (changeInfo.status === 'complete' && tab.url) {
    // Check if this is a Shopee product page
    if (isShopeeProductPage(tab.url)) {
      console.log("Shopee product page detected:", tab.url);
      
      // Check auto-extract setting before proceeding
      chrome.storage.local.get([AUTO_EXTRACT_STORAGE_KEY], (result) => {
        const isAutoExtractEnabled = result[AUTO_EXTRACT_STORAGE_KEY] !== false; // Default to true if not set
        
        if (isAutoExtractEnabled) {
          // Give the page some time to fully render before triggering extraction
          setTimeout(() => {
            chrome.tabs.sendMessage(tabId, { action: "autoExtractComments" });
          }, 2000);
        } else {
          console.log("Auto-extract disabled, skipping automatic comment extraction");
        }
      });
    }
  }
});

// Listen for messages from content script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log("Background script received message:", request);
  
  if (request.action === "callAPI") {
    // Handle API calls
    callAPI(request.endpoint, request.data)
      .then(data => {
        console.log("API call successful:", data);
        sendResponse({ success: true, data });
      })
      .catch(error => {
        console.error("Error in background script:", error);
        sendResponse({ 
          success: false, 
          error: error.message || "Unknown error in background script" 
        });
      });
    
    return true; // Keep the message channel open for async response
  }
});

console.log("Background script loaded");
