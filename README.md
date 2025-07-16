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
```mermaid
---
config:
  layout: dagre
---
flowchart TD

    P1 -- Responses by LLM for each comment --> EX
    JD1 -- Request send back to Shopee store page --> EX
    KDB[Shopee review & rating training dataset from **Kaggle**] -- Semantic search dataset --> VDB
    EX{Browser Extension
    *Scrape data from Shopee*
    <u>Username, comment, product name, rating, time stamp</u>
    **Javascript**} -- Input Gemini API key/Left it Empty --> LLMCA{LLM context analysis
    **Gemini/Ollama**}

    LLMCA -- Store comment metadata for continuous improvement --> DB{"Relational DB
    **PostgreSQL**"}
    LLMCA  -- If comment is suspicious --> VDB
    LLMCA -- If genuine/Unrelated --> JD1(Display Genuine/ Unrelated label to the appropriate comment
    **JavaScript**)
  

    DB -- metadata w/o emoji --> VDB{"Vector DB
    **Supabase**"}
     n1[**langchain agent to perform these 2 analysis**]
    n1@{ shape: text}
    
    subgraph Supabase_sub-process
        SA
        n1
        BA
    end
   
    VDB e1@--> SA(Sematic analaysis
    *Does the comment looked similar to a paid review format*)
    e1@{ animate: true }

    DB e2@--> BA(Behaviral analaysis
    *Identifiy whether the reviewer is spamming/botting the comment*)
    e2@{ animate: true }
    
    
    Supabase_sub-process -- SQL queries/Similar score --> P1[Pass to JavaScript and use Gemini's LLM to explain]
```



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
- Chromium-based browser - for extension

#### Deployment
1. Install python library
```bash
pip install -r requirements.txt
```
2. Run backend server
```bash
python ./backend/backend.py
```
3. Install browser extension
- Open chromium-based browser
- Go to extension settings
- Enable developer mode
- Click "load unpacked"
- Select ```src``` folder from this repo
4. Access Shopee product page to try!

### Deploy Locally
#### Requirements
- Ollama - to run LLM locally
- GPU with 8GB VRAM (preferably) - run LLM locally
- Supabase - relational DB + vector DB
- Python 3.12.3 - backend server
- Chromium browser - for extension
> Full setup guide (extension, API endpoints, environment setup, model config) will be released in the next development phase.

## Performance
| Run        | `analyze_comments` (Local LLM) | `analyze_comments` (Gemini LLM) |
| ---------- | ------------------------------ | ------------------------------- |
| 1          | 4.08                           | 14.57                           |
| 2          | 4.84                           | 24.44                           |
| 3          | 4.55                           | 25.17                           |
| 4          | 11.09                          | 16.54                           |
| 5          | 11.15                          | 11.18                           |
| **Avg** | **7.14s**                      | **18.38s**                      |

Local LLM is **~61.14%** faster than Gemini LLM on average.

## 🙌 Credits
Brought to you by team **TARUMT NOT TARC**
- TAN ZHEN YU
- JONATHAN HO YOON CHOON
- LYE WEI LUN
- TAN GUO ZHI




