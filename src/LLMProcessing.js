/**
 * Analyze comments using Python backend
 * @param {string[]|object[]} comments - Array of comments to analyze (strings or objects with metadata)
 * @param {string} prompt - Optional prompt to send to backend
 * @param {string} product - Optional product name
 * @param {string} apiKey - Optional Gemini API key
 * @returns {Promise<object>} Analysis results
 */
async function analyzeCommentsWithPythonBackend(comments, prompt = null, product = null, apiKey = null) {
  try {
    // Handle both string arrays and object arrays with metadata
    let commentTexts;
    let metadata = null;
    
    if (comments.length > 0 && typeof comments[0] === 'object' && comments[0].comment) {
      // Comments are objects with metadata (from detailed extraction)
      commentTexts = comments.map(c => c.comment);
      metadata = comments.map(c => ({
        comment: c.comment,
        username: c.username || 'Unknown user',
        rating: c.starRating || 0,
        source: window.location?.hostname || 'unknown',
        product: product || document.title || 'Unknown Product',
        timestamp: c.timestampOnly || c.timestamp || new Date().toISOString()
      }));
    } else {
      // Comments are simple strings
      commentTexts = Array.isArray(comments) ? comments : [comments];
    }
    
    const body = { comments: commentTexts };
    if (prompt) body.prompt = prompt;
    if (product) body.product = product;
    if (apiKey) body.gemini_api_key = apiKey;
    if (metadata) body.metadata = metadata;
    
    console.log("Sending analyze request to backend with API key:", apiKey ? "Yes (masked for security)" : "No");
    console.log("Comments input type:", typeof comments[0], "length:", comments.length);
    console.log("Metadata being sent:", metadata);
    console.log("Request body:", JSON.stringify({...body, gemini_api_key: apiKey ? "***HIDDEN***" : null}));
    
    const response = await fetch("http://localhost:8001/analyze", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body)
    });
    
    console.log("Response status:", response.status);
    console.log("Response headers:", response.headers);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error("Backend error response:", errorText);
      throw new Error(`Python backend error (${response.status}): ${errorText}`);
    }
    const data = await response.json();
    if (!data || !data.results) {
      return {
        error: true,
        message: "No results returned from backend"
      };
    }
    // Parse results to match analyzeCommentsDirectly output
    const results = [];
    for (let i = 0; i < commentTexts.length; i++) {
      const backendResult = data.results[i] || {};
      const originalComment = comments[i];
      
      results.push({
        comment: backendResult.comment || (commentTexts[i].length > 50 ? commentTexts[i].substring(0, 50) + "..." : commentTexts[i]),
        is_fake: backendResult.is_fake,
        explanation: backendResult.explanation || "",
        // Include username if available from original metadata
        username: (typeof originalComment === 'object' && originalComment.username) ? originalComment.username : undefined
      });
    }
    return {
      message: data.message || `Processed ${results.length} comments`,
      results: results
    };
  } catch (error) {
    console.error("Error analyzing comments with Python backend:", error);
    return {
      error: true,
      message: `Python backend error: ${error.message || "Unknown error"}`
    };
  }
}

// Function to analyze comments using Python backend only
async function analyzeCommentsWithBackendOnly(comments, productName = null) {
  try {
    // Optionally include productName in prompt for backend context
    let prompt = null;
    if (productName) {
      prompt = `Product name: ${productName}`;
    }
    
    // Get the stored API key
    let apiKey = null;
    try {
      apiKey = await new Promise(resolve => {
        chrome.storage.local.get(["gemini_api_key"], (result) => {
          resolve(result["gemini_api_key"] || null);
        });
      });
      console.log("Using stored API key:", apiKey ? "Yes (masked for security)" : "No");
    } catch (keyError) {
      console.warn("Could not retrieve API key:", keyError);
    }
    
    // Pass comments as-is (could be strings or objects with metadata)
    return await window.LLMProcessing.analyzeCommentsWithPythonBackend(comments, prompt, productName, apiKey);
  } catch (error) {
    console.error("Error analyzing with backend only:", error);
    return { message: `Backend Analysis Error: ${error.message}`, error: true };
  }
}

// Implementation to analyze comments with the API key
async function analyzeCommentsDirectly(comments, apiKey, productName = null) {
  console.log("Analyzing comments with API key:", apiKey ? "Yes (masked for security)" : "No");
  return await analyzeCommentsWithPythonBackend(comments, null, productName, apiKey);
}

// Ensure window.LLMProcessing is always defined
if (typeof window.LLMProcessing === 'undefined') {
  window.LLMProcessing = {};
}
// Helper function to get the stored Gemini API key
async function getStoredApiKey() {
  try {
    return new Promise((resolve) => {
      chrome.storage.local.get(["gemini_api_key"], (result) => {
        const apiKey = result["gemini_api_key"];
        console.log("Retrieved API key from storage:", apiKey ? "Yes (masked)" : "No");
        resolve(apiKey || null);
      });
    });
  } catch (error) {
    console.error("Error retrieving API key:", error);
    return null;
  }
}

// Helper function to store the Gemini API key
async function storeApiKey(apiKey) {
  return new Promise((resolve) => {
    chrome.storage.local.set({ "gemini_api_key": apiKey }, () => {
      console.log("API key stored successfully");
      resolve();
    });
  });
}

window.LLMProcessing.analyzeCommentsDirectly = analyzeCommentsDirectly;
window.LLMProcessing.analyzeCommentsWithPythonBackend = analyzeCommentsWithPythonBackend;
window.LLMProcessing.getStoredApiKey = getStoredApiKey;
window.LLMProcessing.storeApiKey = storeApiKey;
window.LLMProcessing.analyzeCommentsWithBackendOnly = analyzeCommentsWithBackendOnly;