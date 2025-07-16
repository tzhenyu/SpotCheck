# Project Title & Tagline
Awesome Hackathon Project 🚀  
_A short, catchy description goes here._



## Demo Link & Screenshots

- **Live Demo:** [https://demo-link.com](https://demo-link.com)
- **Video/GIFs/Screenshots:**  
  ![Demo Screenshot](./assets/demo-screenshot.png)
``` mermaid
---
config:
  layout: dagre
---
flowchart TD

    P1 -- Responses by LLM for each comment --> EX
    JD1 -- sds --> EX
    KDB[Shopee review & rating training dataset from **Kaggle**] -- Semantic search dataset --> VDB
    EX(Browser Extension
    *Scrape data from Shopee*
    <u>Username, comment, product name, rating, time stamp</u>
    **Javascript**) -- Input Gemini API key/Left it Empty --> LLMCA(LLM context analysis
    **Gemini/Ollama**)

    LLMCA -- Store comment metadata for continuous improvement --> DB("Relational DB
    **PostgreSQL**")
    LLMCA  -- If comment is suspicious --> VDB
    LLMCA -- If genuine/Unrelated --> JD1(Display Genuine/ Unrelated label to the appropriate comment
    **JavaScript**)
  

    DB -- metadata w/o emoji --> VDB("Vector DB
    **Supabase**")
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

## Introduction

Brief overview of the project and its purpose.  
_What problem does it solve? Who is it for?_



## Features

- Feature 1: Describe key feature
- Feature 2: Another important functionality
- Feature 3: Something else cool



## How It Works / Architecture

Short explanation of how the project works.  
_High-level diagram below (if available):_

```
[ User ] --> [ Frontend ] --> [ Backend ] --> [ Database ]
```


## Tech Stack

- Frontend: React
- Backend: Node.js, Express
- Database: MongoDB
- Other: Docker, AWS S3



## Getting Started

### Prerequisites

- Node.js >= 18.x
- Docker (optional)

### Installation

```bash
git clone https://github.com/your-username/hackathon-project.git
cd hackathon-project
npm install
```

### Running the Project

```bash
# Start the development server
npm run dev

# (Optional) Using Docker
docker compose up
```



## Usage

- Access the main dashboard at `http://localhost:3000`
- API endpoint example:  
  `GET /api/items`
- CLI command example:  
  `npm run custom-script`



## Team / Contributors

- **Alice Smith** ([alicegithub](https://github.com/alicegithub)) – Frontend
- **Bob Lee** ([boblee](https://github.com/boblee)) – Backend
- **Charlie Kim** ([charliekim](https://github.com/charliekim)) – DevOps
