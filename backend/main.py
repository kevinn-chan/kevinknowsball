"""
WC 2026 AI Predictor — FastAPI Backend
Endpoints:
  GET  /health
  POST /predict          — single match prediction
  GET  /groups           — all group standings (simulated)
  POST /simulate/match   — scoreline simulation (n samples)
  GET  /monte-carlo      — full tournament win probabilities (cached)
  GET  /teams            — list all 48 WC teams with Elo + squad metrics
"""

import os
import json
import asyncio
from functools import lru_cache
from typing import Optional

import numpy as np
import pandas as pd
from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

# Add project root to path
import sys
BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(BASE, "data", "feature_engineering"))
sys.path.insert(0, os.path.join(BASE, "backend"))

from simulate import (
    predict_match, simulate_scoreline, simulate_group,
    simulate_tournament, monte_carlo, GROUPS_CSV,
    _MODELS, _SQUAD, _ARCH, _build_r32_pairs
)

app = FastAPI(title="WC 2026 AI Predictor", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],   # tighten to frontend domain in production
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Cache ─────────────────────────────────────────────────────────────────────
_mc_cache: Optional[dict] = None
_mc_running = False
_bracket_cache: Optional[dict] = None  # pre-computed on startup


# ── Request/Response models ───────────────────────────────────────────────────

class MatchRequest(BaseModel):
    home: str
    away: str

class ScorelineRequest(BaseModel):
    home: str
    away: str
    n: int = 10000   # number of scoreline samples


# ── Endpoints ─────────────────────────────────────────────────────────────────

@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/ready")
def ready():
    """Always ready — predictions compute lazily on first sim."""
    return {"status": "ok", "bracket_ready": True}


@app.post("/predict")
def predict(req: MatchRequest):
    """
    Returns W/D/L probabilities + λ_home + λ_away for a single matchup.
    """
    try:
        return predict_match(req.home, req.away)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@app.post("/simulate/match")
def simulate_match_endpoint(req: ScorelineRequest):
    """
    Sample n scorelines from the Poisson+DC distribution.
    Returns the full scoreline frequency table + most likely scores + win%.
    """
    try:
        result = predict_match(req.home, req.away)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))

    lam_h = result["lambda_home"]
    lam_a = result["lambda_away"]

    scorelines: dict[tuple, int] = {}
    home_wins = draws = away_wins = 0

    for _ in range(req.n):
        hg, ag = simulate_scoreline(lam_h, lam_a)
        key = (hg, ag)
        scorelines[key] = scorelines.get(key, 0) + 1
        if hg > ag:   home_wins += 1
        elif hg == ag: draws    += 1
        else:          away_wins += 1

    total = req.n
    top_scores = sorted(scorelines.items(), key=lambda x: -x[1])[:10]

    return {
        "home": req.home,
        "away": req.away,
        "lambda_home": lam_h,
        "lambda_away": lam_a,
        "model_probs": {
            "home_win": result["home_win"],
            "draw":     result["draw"],
            "away_win": result["away_win"],
        },
        "simulated_probs": {
            "home_win": round(home_wins / total, 4),
            "draw":     round(draws     / total, 4),
            "away_win": round(away_wins / total, 4),
        },
        "top_scorelines": [
            {"score": f"{hg}-{ag}", "probability": round(cnt / total, 4)}
            for (hg, ag), cnt in top_scores
        ],
    }


@app.get("/groups")
def get_groups():
    """
    Returns one simulated group table for all 12 groups.
    (Single simulation — for display purposes. Use /monte-carlo for probabilities.)
    """
    groups_df = pd.read_csv(GROUPS_CSV)
    output = {}
    for grp, gdf in groups_df.groupby("group"):
        teams    = gdf["country"].tolist()
        standing = simulate_group(teams)
        output[grp] = standing
    return output


_PLAYERS_CSV = os.path.join(BASE, "data", "engineered", "players_with_clusters.csv")
_players_df: Optional[pd.DataFrame] = None

def _load_players() -> pd.DataFrame:
    global _players_df
    if _players_df is None:
        _players_df = pd.read_csv(_PLAYERS_CSV).fillna(0)
    return _players_df

@app.get("/players/quiz")
def player_quiz():
    """Random player + 3 decoy names for Who Am I? game."""
    df = _load_players()
    # Only use players with at least some stats
    valid = df[
        (df["market_value"] > 1_000_000) &
        (df["international_caps"] > 5)
    ]
    if len(valid) < 4:
        valid = df
    row = valid.sample(1).iloc[0]
    decoys = valid[valid["player_name"] != row["player_name"]].sample(3)["player_name"].tolist()
    import random as _r
    options = decoys + [row["player_name"]]
    _r.shuffle(options)
    return {
        "player": row[[
            "player_name","country","wc_group","general_position","specific_position",
            "market_value","international_caps","international_goals",
            "goals_per_90","assists_per_90","interceptions","tackles_won","crosses",
            "role","versatility","club_team","age",
        ]].fillna(0).to_dict(),
        "options": options,
    }


class SquadRequest(BaseModel):
    players: list[dict]  # list of player dicts from /players endpoint

@app.post("/squad/score")
def squad_score(req: SquadRequest):
    """
    Score a 5-player squad out of 100 across 5 football-logic dimensions (20 pts each):
      1. Attacking threat  — goals+assists per 90 for ATT/MID
      2. Defensive solidity — tackles+interceptions per 90 for GK/DEF
      3. Experience        — average international caps (80 caps = full marks)
      4. Star vs balance   — elite star value + penalty for over-reliance (Gini-style)
      5. Budget efficiency — rewrads spending 85-100% of the €300M budget
    """
    BUDGET = 300_000_000

    ps = req.players
    if len(ps) != 5:
        raise HTTPException(status_code=400, detail="Need exactly 5 players")

    total_value = sum(p.get("market_value", 0) for p in ps)
    if total_value > BUDGET:
        raise HTTPException(status_code=400, detail="Budget exceeded")

    # ── 1. Attacking threat (20 pts) ─────────────────────────────────────────
    att_players = [p for p in ps if p.get("general_position") in ("ATT", "MID")]
    if att_players:
        avg_g90  = sum(p.get("goals_per_90",   0) for p in att_players) / len(att_players)
        avg_a90  = sum(p.get("assists_per_90", 0) for p in att_players) / len(att_players)
        att_score = min(avg_g90 / 0.45 * 13 + avg_a90 / 0.35 * 7, 20)
    else:
        att_score = 0.0

    # ── 2. Defensive solidity (20 pts) ───────────────────────────────────────
    def_players = [p for p in ps if p.get("general_position") in ("GK", "DEF")]
    if def_players:
        avg_tkl  = sum(p.get("tackles_won",   0) for p in def_players) / len(def_players)
        avg_int  = sum(p.get("interceptions", 0) for p in def_players) / len(def_players)
        # Reference: a solid WC defender averages ~60 tackles, ~50 interceptions per season
        def_score = min(avg_tkl / 60 * 11 + avg_int / 50 * 9, 20)
    else:
        def_score = 0.0

    # ── 3. Experience (20 pts) ────────────────────────────────────────────────
    avg_caps   = sum(p.get("international_caps", 0) for p in ps) / len(ps)
    exp_score  = min(avg_caps / 80, 1.0) * 20   # 80 caps average = full marks

    # ── 4. Star power vs squad balance (20 pts) ───────────────────────────────
    values     = [max(p.get("market_value", 0), 0) for p in ps]
    total_mv   = sum(values) or 1
    max_mv     = max(values)
    star_share = max_mv / total_mv                          # fraction eaten by top star
    star_pts   = min(max_mv / 150_000_000, 1.0) * 14       # up to 14 for a €150M+ player
    balance_pts = (1 - star_share) * 6                     # up to 6 for balanced squad
    star_score  = star_pts + balance_pts

    # ── 5. Budget efficiency (20 pts) ────────────────────────────────────────
    efficiency = total_value / BUDGET
    if efficiency >= 0.85:
        budget_score = 20.0
    elif efficiency >= 0.60:
        budget_score = 10 + (efficiency - 0.60) / 0.25 * 10
    else:
        budget_score = efficiency / 0.60 * 10

    total = min(100, round(att_score + def_score + exp_score + star_score + budget_score))
    verdict = (
        "World Class ⭐"        if total >= 85 else
        "Strong Squad 💪"       if total >= 70 else
        "Decent Side 👍"        if total >= 55 else
        "Work in Progress 🔧"   if total >= 40 else
        "Back to the Bench 😬"
    )
    return {
        "score":    total,
        "verdict":  verdict,
        "total_value": total_value,
        "dimensions": {
            "attacking":  round(att_score,    1),
            "defending":  round(def_score,    1),
            "experience": round(exp_score,    1),
            "star_power": round(star_score,   1),
            "efficiency": round(budget_score, 1),
        },
        # kept for frontend backwards compat
        "chemistry_bonus": 0,
        "star_bonus":      round(star_pts, 1),
        "breakdown":       {p["player_name"]: round(
            (att_score + def_score) / max(len(att_players) + len(def_players), 1), 1
        ) for p in ps},
    }


@app.get("/players")
def get_players(country: Optional[str] = None, position: Optional[str] = None,
                role: Optional[str] = None, limit: int = 50):
    """Player-level data with FM26-style roles. Filter by country, position, role."""
    df = _load_players()
    if country:
        df = df[df["country"].str.lower() == country.lower()]
    if position:
        df = df[df["general_position"].str.lower() == position.lower()]
    if role:
        df = df[df["role"].str.lower().str.contains(role.lower())]
    cols = ["player_name", "country", "wc_group", "club_team", "age",
            "general_position", "specific_position", "market_value",
            "international_caps", "international_goals",
            "goals_per_90", "assists_per_90", "interceptions",
            "tackles_won", "crosses", "role", "versatility"]
    available = [c for c in cols if c in df.columns]
    return df[available].sort_values("market_value", ascending=False).head(limit).to_dict(orient="records")


@app.get("/teams")
def get_teams():
    """All 48 WC teams with current Elo, squad value, formation, group."""
    squad = pd.read_csv(os.path.join(BASE, "data", "engineered", "team_squad_metrics.csv"))
    arch  = pd.read_csv(os.path.join(BASE, "data", "engineered", "team_archetype_balance.csv"))
    groups = pd.read_csv(GROUPS_CSV)

    merged = squad.merge(groups.rename(columns={"group": "wc_group"}), on="country", how="left") \
                  .merge(arch[["country", "tactical_entropy", "avg_versatility"]], on="country", how="left")

    # squad_metrics already has a 'group' col from the elo join; use wc_group from groups CSV
    merged["group"] = merged["wc_group"].fillna(merged.get("group", ""))

    cols = ["country", "group", "full_elo", "hot_elo", "elo_volatility",
            "total_squad_value", "age_peak_score", "pct_elite_league",
            "avg_caps", "depth_overall", "formation",
            "has_elite_pedigree", "tactical_entropy", "avg_versatility"]

    available = [c for c in cols if c in merged.columns]
    return merged[available].fillna(0).to_dict(orient="records")


def _run_bracket_sim() -> dict:
    """
    Simulate one full bracket for the /simulate/bracket endpoint.
    Uses the same group-stage + fixed R32 bracket logic as simulate_tournament().
    Returns richly-structured data (with scores + probabilities) for the frontend.
    """
    import random as _random

    groups_df = pd.read_csv(GROUPS_CSV)

    # ── Group stage ───────────────────────────────────────────────────────────
    group_results: dict = {}
    all_thirds: list = []
    for grp, gdf in groups_df.groupby("group"):
        standing = simulate_group(gdf["country"].tolist())
        group_results[grp] = standing
        all_thirds.append({**standing[2], "group": grp})

    best_thirds = sorted(
        all_thirds,
        key=lambda x: (x["pts"], x["gd"], x["gf"]),
        reverse=True
    )[:8]

    # ── R32 bracket (fixed seeding — no shuffle) ──────────────────────────────
    r32_pairs = _build_r32_pairs(group_results, best_thirds)

    def play_round(pairs):
        matches, winners = [], []
        for home, away in pairs:
            res = predict_match(home, away)
            hg, ag = simulate_scoreline(res["lambda_home"], res["lambda_away"])
            # Extra time: keep trying until a goal is scored (up to 5 periods)
            attempts = 0
            while hg == ag and attempts < 5:
                hg2, ag2 = simulate_scoreline(res["lambda_home"] * 0.6, res["lambda_away"] * 0.6)
                hg += hg2; ag += ag2
                attempts += 1
            if hg == ag:
                pen_p = res["home_win"] / (res["home_win"] + res["away_win"])
                winner = home if _random.random() < pen_p else away
                score = f"{hg}-{ag} (pens)"
            else:
                winner = home if hg > ag else away
                score = f"{hg}-{ag}"
            matches.append({
                "home": home, "away": away, "score": score, "winner": winner,
                "home_win_prob": res["home_win"], "draw_prob": res["draw"],
                "away_win_prob": res["away_win"],
            })
            winners.append(winner)
        return matches, winners

    r32,  r16t = play_round(r32_pairs)
    r16,  qft  = play_round([(r16t[i], r16t[i+1]) for i in range(0, 16, 2)])
    qf,   sft  = play_round([(qft[i],  qft[i+1])  for i in range(0,  8, 2)])
    sf,   fint = play_round([(sft[i],  sft[i+1])  for i in range(0,  4, 2)])

    sf_losers = [m["home"] if m["winner"] == m["away"] else m["away"] for m in sf]
    tp,  _     = play_round([(sf_losers[0], sf_losers[1])] if len(sf_losers) >= 2 else [])
    fin, _     = play_round([(fint[0], fint[1])])

    return {
        "group_stage": group_results,
        "best_thirds": [t["team"] for t in best_thirds],
        "knockout": {
            "round_of_32": r32, "round_of_16": r16,
            "quarter_finals": qf, "semi_finals": sf,
            "third_place": tp, "final": fin,
        },
        "champion": fin[0]["winner"] if fin else None,
    }


@app.get("/simulate/bracket")
def simulate_bracket():
    """Fresh simulation for every request — each user gets their own universe."""
    return _run_bracket_sim()


@app.get("/monte-carlo")
async def get_monte_carlo(n: int = 10000, background_tasks: BackgroundTasks = None):
    """
    Run (or return cached) Monte Carlo tournament simulation.
    First call triggers n=10000 simulations (~30-60s). Subsequent calls are instant.
    Pass ?n=1000 for a quick test run.
    """
    global _mc_cache, _mc_running

    if _mc_cache is not None:
        return {"cached": True, "results": _mc_cache}

    if _mc_running:
        return {"cached": False, "status": "simulation_in_progress",
                "message": "Monte Carlo is running. Check back in ~60 seconds."}

    # Run synchronously (FastAPI will queue it; for production use a task queue)
    _mc_running = True
    try:
        _mc_cache = monte_carlo(n=n)
    finally:
        _mc_running = False

    ranked = sorted(_mc_cache.items(), key=lambda x: -x[1]["win"])
    return {
        "cached": False,
        "n_simulations": n,
        "results": _mc_cache,
        "leaderboard": [{"rank": i+1, "team": t, **r} for i, (t, r) in enumerate(ranked)],
    }


@app.delete("/monte-carlo/cache")
def clear_cache():
    """Clear the Monte Carlo cache to force a re-run."""
    global _mc_cache
    _mc_cache = None
    return {"status": "cache cleared"}
