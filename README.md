# kevinknowsball

A FIFA World Cup 2026 AI Predictor — simulate the full 48-team bracket, explore squads, and let a machine-learning model settle the arguments.

**Live:** [kevinknowsball.vercel.app](https://kevinknowsball.vercel.app) · API: [kevinknowsball.onrender.com](https://kevinknowsball.onrender.com)

---

## Overview

kevinknowsball trains a gradient-boosting model on 49,214 international matches and uses Poisson simulation with Dixon-Coles correction to predict scorelines and tournament outcomes. The frontend lets you run a full bracket simulation, inspect group tables, predict individual matches, and deep-dive into player clusters for all 48 WC 2026 squads.

---

## Architecture

```
frontend/          Next.js 14 app (Vercel)
backend/           FastAPI service (Render)
data/              Raw CSVs: Kaggle match history, FBref player stats, WC 2026 squads/groups
```

The backend pre-computes a bracket cache at startup and serves Monte Carlo results (10,000 simulations) on demand.

---

## Model

| Detail | Value |
|---|---|
| Algorithm | HistGradientBoosting (scikit-learn) |
| Training data | 49,214 international matches (time-decay weighted) |
| Output | λ_home, λ_away (Poisson rates) + W/D/L probabilities |
| Correction | Dixon-Coles (ρ ≈ 0.0, calibrated on WC data) |
| Simulation | Poisson + Dixon-Coles rejection sampling |
| Monte Carlo | 10,000 bracket simulations |

Player clustering uses a two-step K-Means approach (position-first → role within position) with an FM26-inspired taxonomy of 20 roles.

---

## Stack

**Frontend**
- Next.js 14, Tailwind CSS, Framer Motion

**Backend**
- FastAPI, scikit-learn, pandas, scipy, NumPy

**Data**
- Kaggle international football results
- FBref player statistics
- Scraped WC 2026 squads and group assignments (48 teams, Groups A–L)

**Deploy**
- Vercel (frontend)
- Render free tier (backend)

---

## API Endpoints

| Endpoint | Description |
|---|---|
| `GET /health` | Health check |
| `GET /teams` | All 48 WC 2026 teams |
| `POST /predict` | Predict a single match |
| `POST /simulate/match` | Simulate a single match (Poisson) |
| `GET /simulate/bracket` | Full bracket simulation (cached) |
| `GET /monte-carlo` | Monte Carlo win probabilities |

---

## Local Development

**Backend**

```bash
# From the repo root
python -m venv .venv
source .venv/bin/activate
pip install -r backend/requirements.txt

./backend/start.sh
# Runs at http://localhost:8000
```

**Frontend**

```bash
cd frontend
npm install
npm run dev
# Runs at http://localhost:3000
```

Set `NEXT_PUBLIC_API_URL=http://localhost:8000` in `frontend/.env.local` to point the UI at your local API.

---

## Project Structure

```
WC2026/
├── backend/
│   ├── main.py          # FastAPI app, all endpoints
│   ├── simulate.py      # Poisson + Dixon-Coles simulation logic
│   ├── requirements.txt
│   └── start.sh         # Dev server launcher
├── frontend/
│   ├── app/             # Next.js App Router pages
│   ├── components/      # UI components (bracket, tables, predictor)
│   └── public/
├── data/                # Raw and processed datasets
├── docs/
└── render.yaml          # Render deployment config
```
