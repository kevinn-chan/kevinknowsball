# kevinknowsball

A FIFA World Cup 2026 AI Predictor — simulate the full 48-team bracket, explore squads, and let a machine-learning model settle the arguments.

**Live:** [kevinknowsball.vercel.app](https://kevinknowsball.vercel.app) · API: [kevinknowsball.onrender.com](https://kevinknowsball.onrender.com)

---

## Overview

kevinknowsball trains a gradient-boosting model on 49,214 international matches and uses Poisson simulation with Dixon-Coles correction to predict scorelines and tournament outcomes. Squad quality, tactical clusters, and manager data are layered on top of the ELO base via a real-time nudge at inference — not baked into training, because historical squad data doesn't exist for past matches.

The frontend lets you run a full bracket simulation, inspect group tables, predict individual matches, and deep-dive into player archetypes for all 48 WC 2026 squads.

---

## Model

| Detail | Value |
|---|---|
| Algorithm | XGBoost (HistGradientBoosting, scikit-learn) |
| Training data | 49,214 international matches, time-decay weighted (4yr half-life) |
| Training features | ELO difference, hot-form ELO difference, tournament weight |
| Squad nudge | 18-feature weighted formula applied at inference (weights sum = 1.0) |
| Output | λ_home, λ_away (Poisson rates) + W/D/L probabilities |
| Correction | Dixon-Coles ρ calibrated on WC data |
| Simulation | Poisson + Dixon-Coles rejection sampling |
| Monte Carlo | 10,000 bracket simulations |
| Neutral ground | Forward + reverse prediction averaged to cancel home-team classifier bias |
| Host boost | USA / Canada / Mexico get ±0.025 crowd advantage |

### ELO Engine

538-style ELO with Margin of Victory multiplier, confederation-anchored mean reversion (UEFA 1680 · CONMEBOL 1700 · CAF 1620 · AFC 1600 · CONCACAF 1560), exponential hot-form decay (365-day half-life), and predecessor inheritance (USSR→Russia, Yugoslavia→Serbia/Croatia etc.).

Manual calibration overrides correct for weak-pool inflation (Mexico −40, Australia −30, Iran −30) and strong-performance suppression (Morocco +40 post WC2022 SF, Senegal +30).

### Squad Quality Features (18 metrics)

`first_xi_value` · `pct_elite_league` · `avg_caps` · `total_squad_value` · `has_elite_pedigree` · `age_peak_score` · `star_player_value` · `club_linkage_score` · `star_reliance_gini` · `total_club_minutes` · `tenure_days` · `depth_def/mid/att/gk` · `goals_per_player` · `tactical_entropy` · `avg_versatility`

### Player Clustering (20 roles)

FM26-inspired two-step K-Means: split by specific position, cluster within each group on role-relevant stats. Roles include Stopper CB · Ball-Playing CB · Deep-Lying Playmaker · Box-to-Box · Inside Forward · Poacher · False Nine and 13 others.

---

## Architecture

```
frontend/          Next.js 14 (Vercel)
backend/           FastAPI (Render)
  ├── main.py      All API endpoints
  └── simulate.py  Prediction engine, neutral symmetrization, Poisson simulation
data/
  ├── raw_kaggle/          Transfermarkt match history + player data (to May 2026)
  ├── raw_scraped/         FBref stats, official WC squads, manager data, injuries
  ├── cleaned/             Processed inputs (masterlist, results, managers)
  └── engineered/          Model outputs (ELO, squad metrics, clusters, pkl, cache)
data/feature_engineering/
  ├── build_elo.py         ELO engine → team_elo_current.csv
  ├── squad_metrics.py     Player matching + squad features → team_squad_metrics.csv
  ├── tactical_clusters.py K-Means role clustering → team_archetype_balance.csv
  └── train_model.py       XGBoost training + inference → xgb_model.pkl
```

---

## API Endpoints

| Endpoint | Description |
|---|---|
| `GET /health` | Health check |
| `GET /teams` | All 48 WC 2026 teams with squad metadata |
| `POST /predict` | Head-to-head win/draw/loss probabilities |
| `POST /simulate/match` | Simulate a single match scoreline (Poisson) |
| `GET /simulate/bracket` | Full tournament bracket simulation |
| `GET /monte-carlo` | Monte Carlo championship / SF / QF odds |

All predictions pre-computed at startup (2,256 matchups cached).

---

## Local Development

**Backend**

```bash
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

Set `NEXT_PUBLIC_API_URL=http://localhost:8000` in `frontend/.env.local`.

**Rebuild pipeline** (after data changes):

```bash
python data/cleaning_process/players_database.py
python data/cleaning_process/clean_manager.py
python data/feature_engineering/build_elo.py
python data/feature_engineering/squad_metrics.py
python data/feature_engineering/tactical_clusters.py
# then regenerate predictions_cache.json
```

---

## Project Structure

```
WC2026/
├── backend/
│   ├── main.py
│   ├── simulate.py
│   ├── requirements.txt
│   └── start.sh
├── frontend/
│   ├── app/
│   ├── components/
│   └── public/
├── data/
│   ├── raw_kaggle/
│   ├── raw_scraped/
│   ├── cleaned/
│   ├── engineered/
│   ├── cleaning_process/
│   ├── scraping_process/
│   └── feature_engineering/
├── README.md
├── handoff.md
└── render.yaml
```

---

## Deployment

| Layer | Platform |
|---|---|
| Source | [GitHub — kevinn-chan/kevinknowsball](https://github.com/kevinn-chan/kevinknowsball) |
| Backend | Render free tier — cold start ~30s after 15 min inactivity |
| Frontend | Vercel |
