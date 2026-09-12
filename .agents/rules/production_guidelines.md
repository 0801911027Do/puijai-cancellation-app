---
trigger: always_on
description: Production-grade coding standards and autonomous agent behavior for Puijai Cancellation App
---

# Production Guidelines for Puijai Cancellation App

- **Autonomous Resolution**: Resolve tasks end-to-end. Read relevant source files, analyze dependencies, make targeted edits across all necessary files, and verify syntax.
- **Robust Error Handling**: Handle edge cases, network timeouts, and malformed inputs gracefully.
- **Dual-Backend Sync**: Keep `server.ts` (Express dev server) and `api/index.ts` (Vercel serverless function) in 100% parity.
- **Zero Hallucination of Secrets**: Use existing keys from `.env` (`LINE_CHANNEL_ACCESS_TOKEN`, `LINE_CHANNEL_SECRET`, `GOOGLE_SHEETS_WEBHOOK_URL`, `ADMIN_PASSWORD`).
