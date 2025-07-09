/**
 * Direct Gemini API integration for Chrome extension
 * Uses fetch directly to call the Gemini API
 */

const GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent";
const API_KEY_STORAGE_KEY = "gemini_api_key";

/**
 * Store API key in local storage
 * @param {string} apiKey - Gemini API key
 */
function storeApiKey(apiKey) {
  try {
    chrome.storage.local.set({ [API_KEY_STORAGE_KEY]: apiKey });
  } catch (error) {
    console.error("Failed to store API key:", error);
  }
}

/**
 * Get stored API key from local storage
 * @returns {Promise<string>} Stored API key or null
 */
async function getStoredApiKey() {
  return new Promise((resolve) => {
    try {
      chrome.storage.local.get([API_KEY_STORAGE_KEY], (result) => {
        resolve(result[API_KEY_STORAGE_KEY] || null);
      });
    } catch (error) {
      console.error("Failed to get API key from storage:", error);
      resolve(null);
    }
  });
}

/**
 * Call Gemini API directly using fetch
 * @param {string} prompt - The prompt to send to Gemini
 * @param {string} apiKey - The API key to use
 * @returns {Promise<Object>} The API response
 */
async function callGeminiAPI(prompt, apiKey) {
  const requestBody = {
    contents: [{
      parts: [{
        text: prompt
      }]
    }]
  };
  
  const response = await fetch(`${GEMINI_API_URL}?key=${apiKey}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(requestBody)
  });
  
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gemini API error (${response.status}): ${errorText}`);
  }
  
  return response.json();
}

/**
 * Analyze comments directly using Gemini API
 * @param {string[]} comments - Array of comments to analyze
 * @param {string} apiKey - Optional Gemini API key (will use stored key if not provided)
 * @param {string} productName - Optional product name for context
 * @returns {Promise<object>} Analysis results
 */
async function analyzeCommentsDirectly(comments, apiKey = null, productName = null) {
  try {
    // Use provided API key or try to get from storage
    const key = apiKey || await getStoredApiKey();
    if (!key) {
      return { 
        error: true, 
        message: "Gemini API key not found. Please set your API key." 
      };
    }
    
    // Format the prompt for batch analysis with product name if available
    const productContext = productName ? `Product name: ${productName}\n` : '';
    const prompt = `${productContext}Analyze each product review below and determine if it's real or fake.\n` +
      "For each review, respond with REAL or FAKE followed by a brief explanation (15 words max).\n" +
      "Format your response as numbered list matching the order of reviews:\n\n" +
      comments.map((comment, i) => `${i+1}. Review: '${comment}'`).join('\n');
    
    // Log the prompt being sent to the API
    console.log("Sending prompt to Gemini API:", prompt);
    
    // Call Gemini API directly using fetch
    const response = await callGeminiAPI(prompt, key);

    
    // Extract text from response
    const resultText = response.candidates[0].content.parts[0].text;
    
    // Parse results
    const lines = resultText.split('\n');
    const results = [];
    
    let currentIndex = 0;
    for (let i = 0; i < comments.length; i++) {
      const comment = comments[i];
      let resultLine = "";
      
      // Find the line with this comment's result
      for (let j = currentIndex; j < lines.length; j++) {
        if (lines[j].trim().startsWith(`${i+1}.`)) {
          resultLine = lines[j].trim();
          currentIndex = j + 1;
          break;
        }
      }
      
      // Parse the result
      const isFake = resultLine.toLowerCase().includes('fake');
      let explanation = resultLine.replace(`${i+1}.`, "").trim();
      
      // Clean up the explanation
      if (isFake && explanation.toLowerCase().startsWith("fake:")) {
        explanation = explanation.replace(/fake:/i, "").trim();
      } else if (!isFake && explanation.toLowerCase().startsWith("real:")) {
        explanation = explanation.replace(/real:/i, "").trim();
      }
      
      results.push({
        comment: comment.length > 50 ? comment.substring(0, 50) + "..." : comment,
        is_fake: isFake,
        explanation: explanation
      });
    }
    
    return {
      message: `Processed ${results.length} comments`,
      results: results
    };
    
  } catch (error) {
    console.error("Error analyzing comments with Gemini directly:", error);
    return { 
      error: true, 
      message: `Gemini API error: ${error.message || "Unknown error"}` 
    };
  }
}

/**
 * Analyze comments using Python backend
 * @param {string[]} comments - Array of comments to analyze
 * @param {string} prompt - Optional prompt to send to backend
 * @param {string} product - Optional product name
 * @returns {Promise<object>} Analysis results
 */
async function analyzeCommentsWithPythonBackend(comments, prompt = null, product = null) {
  try {
    const body = { comments };
    if (prompt) body.prompt = prompt;
    if (product) body.product = product;
    const response = await fetch("http://127.0.0.1:8000/analyze", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body)
    });
    if (!response.ok) {
      const errorText = await response.text();
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
    for (let i = 0; i < comments.length; i++) {
      const backendResult = data.results[i] || {};
      results.push({
        comment: backendResult.comment || (comments[i].length > 50 ? comments[i].substring(0, 50) + "..." : comments[i]),
        is_fake: backendResult.is_fake,
        explanation: backendResult.explanation || ""
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
      prompt = `Product name: ${productName}\nAnalyze each product review below and determine if it's real or fake. For each review, respond with REAL or FAKE followed by a brief explanation (15 words max). Format your response as numbered list matching the order of reviews.`;
    }
    return await window.DirectGeminiAPI.analyzeCommentsWithPythonBackend(comments, prompt, productName);
  } catch (error) {
    console.error("Error analyzing with backend only:", error);
    return { message: `Backend Analysis Error: ${error.message}`, error: true };
  }
}

/**
 * Prompt user for API key
 * @returns {Promise<string|null>} API key or null if cancelled
 */
async function promptForApiKey() {
  return new Promise((resolve) => {
    const apiKey = prompt("Please enter your Gemini API key:");
    if (apiKey && apiKey.trim()) {
      storeApiKey(apiKey.trim());
      resolve(apiKey.trim());
    } else {
      resolve(null);
    }
  });
}

// Export functions
window.DirectGeminiAPI = {
  analyzeCommentsDirectly,
  analyzeCommentsWithPythonBackend,
  getStoredApiKey,
  storeApiKey,
  analyzeCommentsWithBackendOnly
};
