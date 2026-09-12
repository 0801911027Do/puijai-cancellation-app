# Project Guidelines: Puijai Cancellation App

## 1. Project Overview & Architecture
This repository contains the **Puijai Cancellation App (ระบบศูนย์ขอยกเลิกการใช้งานปุยใจ)**:
- **Frontend**: Vite + React + TypeScript + TailwindCSS (`src/`, `index.html`).
- **Local Dev Server**: Express backend with Vite middleware (`server.ts`).
- **Serverless Production Backend**: Vercel Serverless Function (`api/index.ts`).
- **Google Sheets Integration**: Google Apps Script (`Code.js`) acting as a live database webhook.
- **LINE Integration**: LINE LIFF Form, LINE Messaging API Webhooks, and Flex Messages (`line-richmenu-flex.json`).

## 2. Autonomous Agent Rules (เทพโกง & Auto-Execution)
When working in this repository, the agent MUST strictly adhere to the following:

### A. Production-Ready & Resilient Code
1. **Zero Placeholders**: Never write placeholders, mock stubs, or `// TODO` comments unless explicitly requested. Always provide complete, working implementations.
2. **Comprehensive Error Handling**: Wrap all async I/O operations (network fetches, database sync, LINE Messaging API, Google Sheets Webhook calls) in `try-catch` blocks with descriptive error logs and graceful fallbacks.
3. **Resilient Retry Logic**: Implement exponential backoff or retries for transient failures when interacting with external webhooks (e.g., LINE Webhook, Google Apps Script endpoint).
4. **Environment Variables**: Always load and validate required environment variables (`GEMINI_API_KEY`, `GOOGLE_SHEETS_WEBHOOK_URL`, `LINE_CHANNEL_SECRET`, `LINE_CHANNEL_ACCESS_TOKEN`, `VITE_LIFF_ID`) before proceeding with API operations.

### B. Multi-Layer Synchronization
- Any changes made to the backend logic in `server.ts` MUST be mirrored in `api/index.ts` to ensure consistent behavior between local development and Vercel serverless deployment.
- Ensure all Google Apps Script payload formats in `Code.js` align with the frontend requests (`CancelForm.tsx`) and backend proxy routes.

### C. Self-Testing & Diagnostic Auto-Fix
- Proactively verify TypeScript builds (`npm run build` or `tsc --noEmit`) after significant modifications to prevent syntax or typing regressions.
- When any command or API yields an error, automatically inspect the log, locate the failure point, and apply the required fix autonomously without requiring manual step-by-step guidance.
