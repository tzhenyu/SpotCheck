/**
 * Background script for Shopee Comment Extractor
 * Handles URL change detection and tab events
 */

const API_BASE_URL = "http://127.0.0.1:8001";
let currentUrl = "";

// Storage keys
const AUTO_UPLOAD_STORAGE_KEY = "auto_upload_enabled";
const AUTO_EXTRACT_STORAGE_KEY = "auto_extract_enabled";

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
    const url = `${API_BASE_URL}/${endpoint}`;
    console.log('Fetch URL:', url, 'Options:', options);
    const response = await fetch(url, options);
    console.log('Fetch response status:', response.status);
    let responseBody;
    try {
      responseBody = await response.text();
      console.log('Fetch response body:', responseBody);
    } catch (parseError) {
      console.error('Error parsing response body:', parseError);
    }
    if (!response.ok) {
      throw new Error(`HTTP error ${response.status}: ${responseBody}`);
    }
    return JSON.parse(responseBody);
  } catch (error) {
    console.error(`Error calling ${endpoint}:`, error);
    throw error;
  }
}


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

// Listen for tab updates
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  // Check if URL has changed and is fully loaded
  if (changeInfo.status === 'complete' && tab.url !== currentUrl) {
    const oldUrl = currentUrl;
    currentUrl = tab.url;
    
    // Only notify about URL changes if old URL was non-empty
    if (oldUrl) {
      // Check if auto-upload is enabled
      chrome.storage.local.get([AUTO_UPLOAD_STORAGE_KEY], (result) => {
        const isAutoUploadEnabled = result[AUTO_UPLOAD_STORAGE_KEY] !== false; // Default to true if not set
        
        // Always notify content script about URL change, with flag for auto-upload
        chrome.tabs.sendMessage(tabId, { 
          action: "urlChanged", 
          oldUrl, 
          newUrl: currentUrl, 
          uploadComments: isAutoUploadEnabled
        }).catch(err => console.log("Content script not ready yet"));
        
        // Notify popup if it's open
        chrome.runtime.sendMessage({ action: "urlChanged", oldUrl, newUrl: currentUrl })
          .catch(err => console.log("Popup not open"));
      });
    }
  }
});

// Listen for tab activation changes
chrome.tabs.onActivated.addListener(async (activeInfo) => {
  try {
    const tab = await chrome.tabs.get(activeInfo.tabId);
    if (tab.url !== currentUrl) {
      const oldUrl = currentUrl;
      currentUrl = tab.url;
      
      // Check if auto-upload is enabled
      const result = await chrome.storage.local.get([AUTO_UPLOAD_STORAGE_KEY]);
      const isAutoUploadEnabled = result[AUTO_UPLOAD_STORAGE_KEY] !== false; // Default to true if not set
      
      // Always notify content script about URL change, with flag for auto-upload
      chrome.tabs.sendMessage(activeInfo.tabId, { 
        action: "urlChanged", 
        oldUrl, 
        newUrl: currentUrl, 
        uploadComments: isAutoUploadEnabled 
      }).catch(err => console.log("Content script not ready yet"));
      
      // Notify popup if it's open
      chrome.runtime.sendMessage({ action: "urlChanged", oldUrl, newUrl: currentUrl })
        .catch(err => console.log("Popup not open"));
    }
  } catch (error) {
    console.error("Error handling tab activation:", error);
  }
});

console.log("Background script loaded");