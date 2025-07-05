const API_BASE_URL = "http://127.0.0.1:8000";

async function callAPI(endpoint) {
  try {
    console.log(`Calling ${endpoint} from background script`);
    const response = await fetch(`${API_BASE_URL}/${endpoint}`, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      },
      cache: 'no-cache'
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error ${response.status}`);
    }
    
    return await response.json();
  } catch (error) {
    console.error(`Error calling ${endpoint}:`, error);
    throw error; // Re-throw to be caught by the message handler
  }
}

// Listen for messages from content script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log("Background script received message:", request);
  
  if (request.action === "callAPI") {
    // Handle API calls
    callAPI(request.endpoint)
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
