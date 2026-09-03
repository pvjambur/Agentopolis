# Agentopolis

Gamified agentic commerce marketplace. AI agent digital twins negotiate and transact in a live 2D isometric Phaser.js world. Every transaction through Razorpay (test mode). Razorpay Hackathon Track 01.

## Tech Stack
- Frontend: React 18, TanStack Router, TypeScript strict, Tailwind, shadcn/ui, Framer Motion, Phaser.js 3, easystarjs, Zustand, TanStack Query, Recharts, Clerk, Razorpay Checkout.js
- Backend: Python 3.12, FastAPI, Uvicorn, WebSockets, Celery, Alembic, Docker
- Database: Supabase (Postgres 16), Pinecone (vectors), Supabase Storage
- LLM: Anthropic Claude Sonnet (negotiation, tool_use), Groq Llama (parsing)
- Payments: Razorpay Route API (test mode)
- Deploy: Vercel (frontend), GCP Cloud Run (backend)

## ⚠️ THE THREE-LAYER MONEY RULE ⚠️
**Layer 1 — LLM proposes:** Agent outputs structured JSON via tool_use. Never executes anything.
**Layer 2 — Orchestrator validates:** Code-level checks: vendor price >= floor_price, consumer spend <= wallet balance, max rounds not exceeded. These are Python if-statements, NEVER left to LLM judgment.
**Layer 3 — Service executes:** razorpay_service.py fires the actual Razorpay API call, ONLY after Layer 2 passes.
**No LLM output ever touches the Razorpay API directly. Non-negotiable.**

## Explicitly Rejected Tools (NEVER introduce these)
- LangGraph, CrewAI, AutoGen, Hermes — use custom agent classes
- MongoDB — Postgres + JSONB covers everything
- pgvector — Pinecone is the vector store
- Kafka — use Upstash Redis/QStash
- N8n, Make.com — orchestration in Python only
- AWS Bedrock — direct Anthropic API
- Blender, Three.js — 2D isometric via Phaser only
- Any staging environment — production only

## Git Rules
- **NEVER commit or push to git** without explicit user instruction in the current session
- NEVER commit .env or any file containing secrets
- Always update .env.example when a new env var is introduced

## Code Style
- Python: ruff for formatting/linting, pyright for type checking
- TypeScript: strict mode, no any types
- Backend routes: never touch DB directly — go through services/repositories
- Agent structured output: always use Anthropic tool_use, never parse freeform text with regex

## Reporting
After completing any task, report in this format:
- **Done:** what was completed
- **Configured:** what was connected/wired
- **Pending:** what's left from this task
- **Blockers:** anything that needs user action
