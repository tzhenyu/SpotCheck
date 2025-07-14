<p align="center">
<img src="https://i.ibb.co/przbt9cW/57bda6ed-b416-4191-9d6e-815d743b13ab-1.jpg" alt="logo" border="0"width="180" height="200">
</p>
<p align="center">Fake Review Detection System for Shopee.</p>

**Spotcheck** is built to solve the problem of misleading reviews in online shopping. By combining a browser extension, LLM-powered backend, and a hybrid vector-relational database (Supabase), Spotcheck delivers real-time verdicts such as:

- ✅ Genuine  
- ❌ Suspicious  
- ⚠️ Irrelevant  

## 📌 How it works
1. **User visits** a Shopee product page.  
2. **Extension scrapes** all reviews.  
3. **Backend analyzes** each review using LLMs and past data.  
4. **Verdicts and explanations** are shown inline.  
5. **User shops** with more confidence and clarity.

## 🧭 Scope

- 🛒 Shopee as e-commerce platform
- 📌 Focused on one store per in-stance
- 🐧 Linux-based local installation


## 🧱 Solution Architecture

### ⚙️ Tech Stack

| Component         | Description                                      |
|------------------|--------------------------------------------------|
| **Browser Extension** | Scrapes and displays verdicts on Shopee          |
| **FastAPI**          | Backend server managing LLM logic                |
| **MiniLM (Local)**   | Embedding generation and semantic analysis       |
| **Supabase**         | Relational + vector database backend             |
| **pgvector**         | Embedding similarity search                      |
| **Python**           | Data pipeline, inference, and backend logic     |


### 🔍 Browser Extension

- **Scrapes data** from Shopee product pages:
  - Username  
  - Comment content  
  - Timestamp  
  - Star rating  
  - Product name  
  - Product URL  

- **Sends** the data to the backend server.
- **Displays** final verdicts and explanations directly on the page.



### 🧠 Backend – LLM Inference & Decision Engine

Three-stage LLM pipeline:

| LLM | Task |
|-----|------|
| **LLM 1** | Check if the review is genuine, suspicious, or unrelevant |
| **LLM 2** | Analyze suspicious review with behavioral and semantic analysis|
| **LLM 3** | Determine if suspicious review is genuine or fake based on analysis  |

### 🗃️ Supabase (Data Layer)

- **PostgreSQL (Relational DB)**:
  - Stores review metadata (user, time, product info)
  - Hosts external datasets (e.g., Kaggle 100k reviews)
  - Enables behavioral tracking with SQL

- **pgvector (Vector DB)**:
  - Stores comment embeddings
  - Powers semantic similarity (RAG-like behavior)
  - Helps detect duplicate or related fake reviews



### 🔁 Continuous Improvement

- New reviews and feedback are **logged for retraining**
- External datasets are **used to fine-tune accuracy**
- LLMs are **self-hosted locally** for fast and private inference

## 🚀 Installation
### Use Cloud infra
#### Requirements
- Python 3.12.3 - backend server
- Chromium browser - for extension

### Deploy Locally
#### Requirements
- Ollama - to run LLM locally
- GPU with 8GB VRAM (preferably) - run LLM locally
- Supabase - relational DB + vector DB
- Python 3.12.3 - backend server
- Chromium browser - for extension
> Full setup guide (extension, API endpoints, environment setup, model config) will be released in the next development phase.

---
## 🙌 Credits
Brought to you by team **TARUMT NOT TARC**
- TAN ZHEN YU
- JONATHAN HO YOON CHOON
- LYE WEI LUN
- TAN GUO ZHI




