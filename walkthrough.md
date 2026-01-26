# YouTube Viral Finder & AI Analyzer - Walkthrough

## 1. Overview
This application helps users find "viral" YouTube videos based on a performance ratio (views vs. subscribers) and analyzes them.
**Update (AI Scripting):** We have reintroduced the backend server (`server.js`) to power the **AI Script Rewrite** feature. It now uses high-performing "Viral Examples" to generate better humorous scripts.

## 2. Setup & Execution
1.  **Start the Server:**
    *   Open a terminal in the project directory.
    *   Run `npm run dev` (or `node server.js`).
    *   The backend runs on `http://localhost:4000` (or similar).

2.  **Open the App:**
    *   Open `index.html` (served via `npm run dev` or locally).

3.  **API Keys:**
    *   **YouTube Data API Key** & **Apify API Token**: For fetching video data (Frontend).
    *   **Gemini API Key**: stored in `.env` for the Backend to generate scripts.

## 3. Features
*   **Search & Filter:** Find high-performing videos easily.
*   **Viral Analysis:** Click **"AI 댓글 + 자막 데이터 가져오기"** to see Comments & Transcripts.
*   **[NEW] Script Rewrite:**
    *   In the analysis modal, select a style (e.g., "Comic", "Parody").
    *   Click **"대본 재작성"**.
    *   The AI will generate a funny Shorts script based on:
        1.  Original Transcript (Structure).
        2.  YouTube Comments (Humor Points).
        3.  **1M+ Viral Examples** (Learned Humor Patterns).
*   **[NEW] Young Forty Webtoon [Nano Banana] Script Generator:**
    *   Located at the bottom of the main page.
    *   Enter a topic/situation (e.g., "영포티가 헬스장에서 MZ에게 훈수 두는 상황").
    *   Click **"나노바나나 대본 생성하기"**.
    *   Generates a structured webtoon script with:
        1.  **AI Image Prompts** (Optimized for Nano Banana style).
        2.  **Scene Descriptions** (Korean).
        3.  **Speech Bubbles** (Character-specific personas and positions).
    *   Use the **"Copy Script"** button to copy the entire script to your clipboard.

## 4. Troubleshooting
*   **Server Error:** If "대본 재작성" or "트렌드 스나이핑" fails, ensure `node server.js` is running and `.env` has the correct `GEMINI_API_KEY` and `PERPLEXITY_API_KEY`.
*   **No Transcript:** The Apify integration is required for transcripts. If it fails, the rewrite won't work.
