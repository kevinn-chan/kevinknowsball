"""
Poisson + Monte Carlo simulation engine.
All models and data are loaded once at module level for Monte Carlo speed.

simulate_scoreline(lam_h, lam_a) → (home_goals, away_goals)
simulate_group(teams)            → sorted group standings
simulate_tournament(groups_df)   → {team: finishing_position}
monte_carlo(n)                   → {team: {win, final, semi, quarter, r16}}
"""

import os
import sys
import pickle
import random
from collections import defaultdict
from itertools import combinations

import numpy as np
import pandas as pd

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(BASE, "data", "feature_engineering"))

from train_model import predict_match as _predict_match

MODEL_PKL  = os.path.join(BASE, "data", "engineered", "xgb_model.pkl")
SQUAD_MET  = os.path.join(BASE, "data", "engineered", "team_squad_metrics.csv")
ARCHETYPE  = os.path.join(BASE, "data", "engineered", "team_archetype_balance.csv")
GROUPS_CSV = os.path.join(BASE, "data", "cleaned",    "wc_2026_groups.csv")

# ── Load once ─────────────────────────────────────────────────────────────────
with open(MODEL_PKL, "rb") as f:
    _MODELS = pickle.load(f)
_SQUAD  = pd.read_csv(SQUAD_MET)
_ARCH   = pd.read_csv(ARCHETYPE)

# Dixon-Coles ρ
DC_RHO = _MODELS.get("dc_rho", -0.10)

# Load pre-computed predictions (generated locally, committed to repo)
_CACHE_FILE = os.path.join(BASE, "data", "engineered", "predictions_cache.json")
_PRED_CACHE: dict[str, dict] = {}
if os.path.exists(_CACHE_FILE):
    import json as _json
    with open(_CACHE_FILE) as _f:
        _PRED_CACHE = _json.load(_f)
    print(f"  Loaded {len(_PRED_CACHE)} pre-computed predictions")


_HOST_NATIONS = {"United States", "Mexico", "Canada"}
_HOST_BOOST   = 0.025  # ~20 ELO points of home-crowd advantage

def predict_match(home: str, away: str) -> dict:
    key = f"{home}|{away}"
    result = _PRED_CACHE.get(key) or _predict_match(home, away, _MODELS, _SQUAD, _ARCH)

    boost = _HOST_BOOST if home in _HOST_NATIONS else (-_HOST_BOOST if away in _HOST_NATIONS else 0)
    if boost == 0:
        return result

    r = dict(result)
    r["home_win"] = round(max(0.02, min(0.97, r["home_win"] + boost)), 4)
    r["away_win"] = round(max(0.02, min(0.97, r["away_win"] - boost)), 4)
    total = r["home_win"] + r["draw"] + r["away_win"]
    r["home_win"] = round(r["home_win"] / total, 4)
    r["draw"]     = round(r["draw"]     / total, 4)
    r["away_win"] = round(r["away_win"] / total, 4)
    return r


def warm_cache(groups_df: pd.DataFrame):
    """No-op — cache is pre-loaded from JSON at startup."""
    print(f"  Cache already loaded: {len(_PRED_CACHE)} matchups")


# ── Dixon-Coles correction ────────────────────────────────────────────────────

def _dc_tau(hg: int, ag: int, lh: float, la: float) -> float:
    # Dixon-Coles (1997) correction — DC1997 Eq. 4:
    #   τ(0,0) = 1 − λ_h · λ_a · ρ
    #   τ(1,0) = 1 + λ_h · ρ    (home scored, uses λ_home)
    #   τ(0,1) = 1 + λ_a · ρ    (away scored, uses λ_away)
    #   τ(1,1) = 1 − ρ
    if hg == 0 and ag == 0: return 1 - lh * la * DC_RHO
    if hg == 0 and ag == 1: return 1 + la * DC_RHO   # fixed: was lh (wrong)
    if hg == 1 and ag == 0: return 1 + lh * DC_RHO   # fixed: was la (wrong)
    if hg == 1 and ag == 1: return 1 - DC_RHO
    return 1.0


def simulate_scoreline(lam_h: float, lam_a: float) -> tuple[int, int]:
    """Rejection-sample a scoreline from the DC-corrected Poisson distribution."""
    lam_h = max(lam_h, 0.10)
    lam_a = max(lam_a, 0.10)
    while True:
        hg = int(np.random.poisson(lam_h))
        ag = int(np.random.poisson(lam_a))
        tau = _dc_tau(min(hg, 1), min(ag, 1), lam_h, lam_a)
        if random.random() < abs(tau):
            return hg, ag


# ── Group stage ───────────────────────────────────────────────────────────────

def simulate_group(teams: list[str]) -> list[dict]:
    """Round-robin 6 matches, return standings sorted pts → GD → GF → H2H."""
    stats = {t: {"pts": 0, "gf": 0, "ga": 0} for t in teams}
    h2h   = defaultdict(int)   # h2h[(t1,t2)] = pts earned by t1 vs t2

    for home, away in combinations(teams, 2):
        res = predict_match(home, away)
        hg, ag = simulate_scoreline(res["lambda_home"], res["lambda_away"])

        stats[home]["gf"] += hg;  stats[home]["ga"] += ag
        stats[away]["gf"] += ag;  stats[away]["ga"] += hg

        if hg > ag:
            stats[home]["pts"] += 3
            h2h[(home, away)] += 3
        elif hg < ag:
            stats[away]["pts"] += 3
            h2h[(away, home)] += 3
        else:
            stats[home]["pts"] += 1;  stats[away]["pts"] += 1
            h2h[(home, away)] += 1;   h2h[(away, home)] += 1

    def sort_key(t):
        s = stats[t]
        gd    = s["gf"] - s["ga"]
        h2h_p = sum(v for (t1, _), v in h2h.items() if t1 == t)
        return (s["pts"], gd, s["gf"], h2h_p)

    ranked = sorted(teams, key=sort_key, reverse=True)
    return [
        {"team": t, "pos": i+1,
         "pts": stats[t]["pts"], "gf": stats[t]["gf"], "ga": stats[t]["ga"],
         "gd": stats[t]["gf"] - stats[t]["ga"]}
        for i, t in enumerate(ranked)
    ]


# ── Knockout match ────────────────────────────────────────────────────────────

def simulate_knockout(home: str, away: str) -> str:
    """Return winner. Draw → extra-time/penalties with 60/40 edge to higher-Elo team.

    Real WC penalty shootout data (1982–2022) shows the team kicking first
    wins ~57–60% of shootouts. We proxy 'kicks first' with the model's
    stronger team (home_win > away_win). This replaces the arbitrary ±0.05 nudge.
    """
    res = predict_match(home, away)
    r   = random.random()
    if r < res["home_win"]:
        return home
    elif r < res["home_win"] + res["draw"]:
        # 60/40 to stronger team (statistically grounded from WC shootout data)
        edge = 0.60 if res["home_win"] >= res["away_win"] else 0.40
        return home if random.random() < edge else away
    return away


# ── Full tournament ───────────────────────────────────────────────────────────

def simulate_tournament(groups_df: pd.DataFrame) -> dict[str, int]:
    """Simulate one full WC 2026. Returns {team: finishing_position}."""
    positions: dict[str, int] = {}

    # ── Group stage ───────────────────────────────────────────────────────────
    group_results: dict[str, list] = {}
    all_thirds: list[dict] = []

    for grp, gdf in groups_df.groupby("group"):
        standing = simulate_group(gdf["country"].tolist())
        group_results[grp] = standing
        all_thirds.append({**standing[2], "group": grp})

    # ── 8 best third-place teams ──────────────────────────────────────────────
    best_thirds = sorted(all_thirds, key=lambda x: (x["pts"], x["gd"], x["gf"]), reverse=True)[:8]
    third_teams = {t["team"] for t in best_thirds}

    # Mark eliminated thirds (4 who didn't qualify)
    for t in all_thirds:
        if t["team"] not in third_teams:
            positions[t["team"]] = 37   # group stage exit (3rd, not best)

    # ── Build R32 field ───────────────────────────────────────────────────────
    grp_order = sorted(group_results.keys())
    firsts  = [group_results[g][0]["team"] for g in grp_order]
    seconds = [group_results[g][1]["team"] for g in grp_order]
    thirds  = [t["team"] for t in best_thirds]
    random.shuffle(thirds)   # ponytail: simplified bracket seeding

    # 32 teams: pair 12 firsts vs 8 thirds, remaining 4 firsts vs 4 seconds,
    # 8 remaining seconds paired among themselves
    r32_pairs = (
        list(zip(firsts[:8],  thirds)) +          # 8 winners vs 8 best thirds
        list(zip(firsts[8:],  seconds[:4])) +     # 4 winners vs 4 runners-up
        [(seconds[i], seconds[i+1]) for i in range(4, 12, 2)]  # 4 runner-up pairs
    )

    # ── Knockout rounds ───────────────────────────────────────────────────────
    def run_round(pairs, loser_pos):
        winners, losers = [], []
        for h, a in pairs:
            w = simulate_knockout(h, a)
            winners.append(w)
            losers.append(a if w == h else h)
        for t in losers:
            positions[t] = loser_pos
        return winners

    r16    = run_round(r32_pairs,                                      33)  # R32 losers
    qf     = run_round([(r16[i], r16[i+1]) for i in range(0,16,2)],   17)  # R16 losers
    sf     = run_round([(qf[i],  qf[i+1])  for i in range(0, 8,2)],    9)  # QF losers
    finals = run_round([(sf[i],  sf[i+1])  for i in range(0, 4,2)],    5)  # SF losers

    # 3rd-place match
    sf_losers = [t for t in sf if t not in finals]
    if len(sf_losers) >= 2:
        third = simulate_knockout(sf_losers[0], sf_losers[1])
        fourth = sf_losers[1] if third == sf_losers[0] else sf_losers[0]
        positions[third]  = 3
        positions[fourth] = 4

    # Final
    champion = simulate_knockout(finals[0], finals[1])
    runner   = finals[1] if champion == finals[0] else finals[0]
    positions[champion] = 1
    positions[runner]   = 2

    return positions


# ── Monte Carlo ───────────────────────────────────────────────────────────────

def monte_carlo(n: int = 10_000, seed: int = 42) -> dict:
    np.random.seed(seed)
    random.seed(seed)

    groups_df = pd.read_csv(GROUPS_CSV)

    print(f"  Warming prediction cache...")
    warm_cache(groups_df)

    counts = defaultdict(lambda: defaultdict(int))

    for i in range(n):
        if i % 500 == 0:
            print(f"  {i}/{n} simulations...", flush=True)
        result = simulate_tournament(groups_df)
        for team, pos in result.items():
            counts[team]["sims"] += 1
            if pos == 1:   counts[team]["win"]     += 1
            if pos <= 2:   counts[team]["final"]   += 1
            if pos <= 4:   counts[team]["semi"]    += 1
            if pos <= 8:   counts[team]["quarter"] += 1
            if pos <= 16:  counts[team]["r16"]     += 1
            if pos <= 32:  counts[team]["r32"]     += 1

    return {
        t: {
            "win":     round(counts[t]["win"]     / n, 4),
            "final":   round(counts[t]["final"]   / n, 4),
            "semi":    round(counts[t]["semi"]    / n, 4),
            "quarter": round(counts[t]["quarter"] / n, 4),
            "r16":     round(counts[t]["r16"]     / n, 4),
            "r32":     round(counts[t]["r32"]     / n, 4),
        }
        for t in groups_df["country"].tolist()
    }


# ── Quick test ────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    results = monte_carlo(n=1000)
    ranked  = sorted(results.items(), key=lambda x: -x[1]["win"])
    print(f"\n{'Team':<30} {'Win%':>6} {'Final%':>8} {'Semi%':>7} {'QF%':>6}")
    print("-" * 60)
    for team, r in ranked[:20]:
        print(f"  {team:<28} {r['win']:>5.1%}  {r['final']:>6.1%}  {r['semi']:>6.1%}  {r['quarter']:>5.1%}")
