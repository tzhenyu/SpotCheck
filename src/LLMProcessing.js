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
    const response = await fetch("http://127.0.0.1:8001/analyze", {
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
      prompt = `Product name: ${productName}`;
    }
    return await window.LLMProcessing.analyzeCommentsWithPythonBackend(comments, prompt, productName);
  } catch (error) {
    console.error("Error analyzing with backend only:", error);
    return { message: `Backend Analysis Error: ${error.message}`, error: true };
  }
}

// Dummy implementation to prevent ReferenceError
async function analyzeCommentsDirectly(comments, apiKey, productName = null) {
  return await analyzeCommentsWithPythonBackend(comments, null, productName);
}

// Ensure window.LLMProcessing is always defined
if (typeof window.LLMProcessing === 'undefined') {
  window.LLMProcessing = {};
}
window.LLMProcessing.analyzeCommentsDirectly = analyzeCommentsDirectly;
window.LLMProcessing.analyzeCommentsWithPythonBackend = analyzeCommentsWithPythonBackend;
window.LLMProcessing.getStoredApiKey = typeof getStoredApiKey !== 'undefined' ? getStoredApiKey : async () => null;
window.LLMProcessing.storeApiKey = typeof storeApiKey !== 'undefined' ? storeApiKey : async () => {};
window.LLMProcessing.analyzeCommentsWithBackendOnly = analyzeCommentsWithBackendOnly;