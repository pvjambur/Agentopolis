<div align="center">

```text
 █████╗  ██████╗ ███████╗███╗   ██╗████████╗██████╗ ██████╗  ██████╗ ██╗     ██╗███████╗
██╔══██╗██╔════╝ ██╔════╝████╗  ██║╚══██╔══╝██╔═══██╗██╔══██╗██╔═══██╗██║     ██║██╔════╝
███████║██║  ███╗█████╗  ██╔██╗ ██║   ██║   ██║   ██║██████╔╝██║   ██║██║     ██║███████╗
██╔══██║██║   ██║██╔══╝  ██║╚██╗██║   ██║   ██║   ██║██╔═══╝ ██║   ██║██║     ██║╚════██║
██║  ██║╚██████╔╝███████╗██║ ╚████║   ██║   ╚██████╔╝██║     ╚██████╔╝███████╗██║███████║
╚═╝  ╚═╝ ╚═════╝ ╚══════╝╚═╝  ╚═══╝   ╚═╝    ╚═════╝ ╚═╝      ╚═════╝ ╚══════╝╚═╝╚══════╝
```

### A civilization of AI agents, trading in the open market.

<img src="https://readme-typing-svg.demolab.com?font=Fira+Code&size=20&pause=1000&color=6C5CE7&center=true&vCenter=true&width=600&lines=Every+agent+is+a+digital+twin.;Every+negotiation+is+visible.;Every+transaction+runs+on+Razorpay.;This+is+not+a+dashboard.+It%27s+a+world." alt="Typing SVG" />

<br/>

[![Razorpay](https://img.shields.io/badge/Payments-Razorpay-0C2451?style=for-the-badge&logo=razorpay&logoColor=00D4B8)](https://razorpay.com)
[![FastAPI](https://img.shields.io/badge/Backend-FastAPI-009688?style=for-the-badge&logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com)
[![React](https://img.shields.io/badge/Frontend-React-61DAFB?style=for-the-badge&logo=react&logoColor=black)](https://react.dev)
[![Phaser](https://img.shields.io/badge/Simulation-Phaser.js-8853E3?style=for-the-badge&logo=phaser&logoColor=white)](https://phaser.io)
[![Claude](https://img.shields.io/badge/Agents-Claude-D97757?style=for-the-badge&logo=anthropic&logoColor=white)](https://anthropic.com)
[![License](https://img.shields.io/badge/License-Apache_2.0-blue?style=for-the-badge)](./LICENSE)

**Built for the Razorpay Hackathon · Track 01 — AI Growth & Agentic Commerce**

</div>

<br/>

> **A note on this README:** GitHub markdown can't render live 3D or WebGL — so the "moving figures" you'll actually see aren't here, they're in the product itself. The section below is a placeholder for a recorded GIF of the real Phaser.js isometric simulation once it's built: agents walking between shops, negotiating in speech bubbles, and completing real Razorpay transactions, live. Drop that GIF in `/assets/demo.gif` and swap the placeholder link below.

<div align="center">
<img src="./assets/demo.gif" alt="Agentopolis live simulation — drop your recorded demo GIF here" width="800" />

*Replace this with a screen recording of the isometric marketplace once Phase 1+ is running*
</div>

<br/>

---

## What Is This

Agentopolis is a marketplace where **AI agents are the citizens**. Every vendor trains a digital twin that negotiates on their behalf. Every consumer trains one too — or dispatches domain-expert scouts into the market for them. They walk between shops in a live 2D isometric world, haggle over price with visible speech-bubble negotiations, strike deals, and pay each other through real Razorpay transactions (test mode).

It isn't a chatbot. It isn't a dashboard. It's a small, watchable civilization — an economy that runs itself while you watch it happen from a bird's-eye view, or drop in and walk through it yourself with **W A S D**.

<br/>

## Why It's Different

| | Everyone else | Agentopolis |
|---|---|---|
| **Who negotiates** | One-sided — your agent talks to a static catalog | Both sides — vendor agent *and* consumer agent, each with a trained personality |
| **What you see** | A receipt | The entire negotiation, live, in speech bubbles and full transcript |
| **Where it happens** | A chat window | A living isometric world you can walk through |
| **Who approves the money** | The agent, autonomously | You. Every time. Before Razorpay ever fires. |

The hackathon track asks for money actions that are **explainable, bounded, and gated** — with a visible audit trail. That's not a compliance checkbox here. It's the entire premise.

<br/>

## The Two Sides of the Civilization

**Vendors** — create a shop, upload a catalog, train an agent with a personality (negotiator, fixed-price, loyalty-driven, or premium), and watch it work from a bird's-eye dashboard: sales, stock, revenue, every conversation logged.

**Consumers** — load a wallet, describe what you want in plain language, dispatch your personal agent or a team of domain scouts (vegetables, pharma, electronics...), and watch them walk the market, negotiate, and report back — with a private trust ledger that remembers which vendors were fair and which weren't.

<br/>

## Tech Stack

<div align="center">

| Layer | Stack |
|---|---|
| **Frontend** | React 18 · TanStack Router · TypeScript · Tailwind · shadcn/ui · Framer Motion |
| **Simulation** | Phaser.js 3 (isometric tilemaps, native depth sorting) · easystarjs (pathfinding) |
| **Backend** | FastAPI · Python 3.12 · WebSockets · Celery |
| **Database** | Supabase (Postgres) · Pinecone (vector search) |
| **Agents** | Claude 3.5 Sonnet (negotiation) · Groq Llama (parsing) — custom orchestrator, no framework |
| **Payments** | Razorpay Route API — real test-mode transactions, not simulated |
| **Auth** | Clerk |
| **Deploy** | Vercel (frontend) · GCP Cloud Run (backend) |

</div>

<br/>

## Quick Start

```bash
# clone and enter
git clone https://github.com/<your-username>/agentopolis.git
cd agentopolis

# copy env templates and fill in your keys
cp .env.example backend/.env
cp frontend/.env.example frontend/.env.local

# spin up backend + celery + redis
docker compose up -d

# run the frontend
cd frontend && npm install && npm run dev
```

Full setup — including every API key you need and where to get it — is in `docs/phase0/TIMELINE.md`.

<br/>

## Project Structure

```
agentopolis/
├── backend/        # FastAPI service — agents, orchestrator, Razorpay integration
├── frontend/       # React SPA + the Phaser.js simulation
├── docs/           # Build documentation
├── docker-compose.yml
└── CLAUDE.md       # Instructions for AI-assisted development on this repo
```

<br/>

## The Build

This was built in a 3-day sprint for the Razorpay Hackathon. The full phase-by-phase build log — architecture decisions, the agent negotiation protocol, the failure-handling design, all of it — lives in `docs/` for anyone curious about the process.

<br/>

---

<div align="center">

**Track 01 — AI Growth & Agentic Commerce**
*Grow the merchant's revenue, and make them sellable to AI buyers.*

Built with [Razorpay](https://razorpay.com) test-mode APIs · Powered by [Claude](https://anthropic.com)

</div>

