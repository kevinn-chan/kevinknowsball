"""
Poisson + Monte Carlo simulation engine.
All models and data are loaded once at module level for Monte Carlo speed.

simulate_scoreline(lam_h, lam_a) → (home_goals, away_goals)
simulate_group(teams)            → sorted group standings (FIFA tiebreaker rules)
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
_cache_misses = 0

if os.path.exists(_CACHE_FILE):
    import json as _json
    with open(_CACHE_FILE) as _f:
        _PRED_CACHE = _json.load(_f)
    print(f"  Loaded {len(_PRED_CACHE)} pre-computed predictions")


_HOST_NATIONS = {"United States", "Mexico", "Canada"}
_HOST_BOOST   = 0.025  # ~20 ELO points of home-crowd advantage

def predict_match(home: str, away: str) -> dict:
    global _cache_misses
    key = f"{home}|{away}"
    result = _PRED_CACHE.get(key)
    if result is None:
        _cache_misses += 1
        if _cache_misses <= 10:
            print(f"  [WARN] Cache miss #{_cache_misses}: {key}", flush=True)
        result = _predict_match(home, away, _MODELS, _SQUAD, _ARCH)

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
    if hg == 0 and ag == 0: return 1 - lh * la * DC_RHO
    if hg == 0 and ag == 1: return 1 + la * DC_RHO
    if hg == 1 and ag == 0: return 1 + lh * DC_RHO
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
    """
    Round-robin 6 matches. Standings sorted by official FIFA tiebreaker rules:
      1. Points
      2. Goal difference (all group matches)
      3. Goals scored (all group matches)
      4. Head-to-head points (among tied teams only)
      5. Head-to-head goal difference (among tied teams only)
      6. Head-to-head goals scored (among tied teams only)
      7. Drawing of lots (random)
    """
    stats    = {t: {"pts": 0, "gf": 0, "ga": 0} for t in teams}
    h2h_pts  = defaultdict(int)   # h2h_pts[(t1,t2)]  = pts t1 earned vs t2
    h2h_gf   = defaultdict(int)   # h2h_gf[(t1,t2)]   = goals t1 scored vs t2

    for home, away in combinations(teams, 2):
        res = predict_match(home, away)
        hg, ag = simulate_scoreline(res["lambda_home"], res["lambda_away"])

        stats[home]["gf"] += hg;  stats[home]["ga"] += ag
        stats[away]["gf"] += ag;  stats[away]["ga"] += hg
        h2h_gf[(home, away)] += hg
        h2h_gf[(away, home)] += ag

        if hg > ag:
            stats[home]["pts"] += 3
            h2h_pts[(home, away)] += 3
        elif hg < ag:
            stats[away]["pts"] += 3
            h2h_pts[(away, home)] += 3
        else:
            stats[home]["pts"] += 1;  stats[away]["pts"] += 1
            h2h_pts[(home, away)] += 1;   h2h_pts[(away, home)] += 1

    def overall_key(t):
        s = stats[t]
        return (s["pts"], s["gf"] - s["ga"], s["gf"])

    def h2h_key(t, group):
        """H2H pts, GD, GF against other members of the tied group only."""
        opps = [o for o in group if o != t]
        pts  = sum(h2h_pts[(t, o)] for o in opps)
        gf   = sum(h2h_gf[(t, o)] for o in opps)
        ga   = sum(h2h_gf[(o, t)] for o in opps)
        return (pts, gf - ga, gf)

    # Sort by overall criteria first
    pre_sorted = sorted(teams, key=overall_key, reverse=True)

    # Break remaining ties with H2H within the tied subset, then random
    result = []
    i = 0
    while i < len(pre_sorted):
        key = overall_key(pre_sorted[i])
        j   = i
        while j < len(pre_sorted) and overall_key(pre_sorted[j]) == key:
            j += 1
        tied = pre_sorted[i:j]

        if len(tied) == 1:
            result.extend(tied)
        else:
            # Sort tied group by H2H (only between each other)
            h2h_sorted = sorted(tied, key=lambda t: h2h_key(t, tied), reverse=True)

            # Check if H2H fully resolved the tie; for remaining ties use random lots
            # Group by H2H key, randomise within each sub-tie
            h2h_pre: list[str] = []
            k = 0
            while k < len(h2h_sorted):
                hkey = h2h_key(h2h_sorted[k], tied)
                l = k
                while l < len(h2h_sorted) and h2h_key(h2h_sorted[l], tied) == hkey:
                    l += 1
                sub_tie = h2h_sorted[k:l]
                random.shuffle(sub_tie)   # drawing of lots for final tie
                h2h_pre.extend(sub_tie)
                k = l

            result.extend(h2h_pre)
        i = j

    return [
        {"team": t, "pos": i + 1,
         "pts": stats[t]["pts"], "gf": stats[t]["gf"], "ga": stats[t]["ga"],
         "gd": stats[t]["gf"] - stats[t]["ga"]}
        for i, t in enumerate(result)
    ]


# ── Knockout match ────────────────────────────────────────────────────────────

def simulate_knockout(home: str, away: str) -> str:
    """Return winner. Draw → penalties resolved by model's relative win probability."""
    res = predict_match(home, away)
    r   = random.random()
    if r < res["home_win"]:
        return home
    elif r < res["home_win"] + res["draw"]:
        pen_p = res["home_win"] / (res["home_win"] + res["away_win"])
        return home if random.random() < pen_p else away
    return away


# ── WC 2026 R32 bracket ───────────────────────────────────────────────────────
#
# Official FIFA WC2026 structure:
#   - 12 groups (A–L) paired as (A,B),(C,D),(E,F),(G,H),(I,J),(K,L)
#   - Each group pair produces two R32 matches: 1X vs 2Y and 1Y vs 2X
#   - 8 best 3rd-place teams are seeded 1–8, paired #1v#8, #2v#7, #3v#6, #4v#5
#   - The 4 thirds-matches are placed one per bracket quarter
#
# Bracket quarters (each QT → 1 QF winner → SF):
#   QT1: 1A vs 2B, 1C vs 2D, 3rd#1 vs 3rd#8, 1E vs 2F
#   QT2: 1B vs 2A, 1D vs 2C, 3rd#2 vs 3rd#7, 1F vs 2E
#   QT3: 1G vs 2H, 1I vs 2J, 3rd#3 vs 3rd#6, 1K vs 2L
#   QT4: 1H vs 2G, 1J vs 2I, 3rd#4 vs 3rd#5, 1L vs 2K
#
# Group-pair teams can meet no earlier than the semi-finals.
# Best-thirds are seeded to prevent #1 playing #2 before QF.

def _build_r32_pairs(group_results: dict, best_thirds: list[dict]) -> list[tuple[str, str]]:
    """
    Return the 16 R32 matchups in bracket order.
    best_thirds must already be sorted best→worst (index 0 = best).
    """
    def first(g):  return group_results[g][0]["team"]
    def second(g): return group_results[g][1]["team"]

    t = [x["team"] for x in best_thirds]  # t[0]=best, t[7]=worst

    return [
        # Quarter 1
        (first("A"), second("B")),
        (first("C"), second("D")),
        (t[0], t[7]),              # 3rd #1 vs 3rd #8
        (first("E"), second("F")),
        # Quarter 2
        (first("B"), second("A")),
        (first("D"), second("C")),
        (t[1], t[6]),              # 3rd #2 vs 3rd #7
        (first("F"), second("E")),
        # Quarter 3
        (first("G"), second("H")),
        (first("I"), second("J")),
        (t[2], t[5]),              # 3rd #3 vs 3rd #6
        (first("K"), second("L")),
        # Quarter 4
        (first("H"), second("G")),
        (first("J"), second("I")),
        (t[3], t[4]),              # 3rd #4 vs 3rd #5
        (first("L"), second("K")),
    ]


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
        # 4th-place teams eliminated
        positions[standing[3]["team"]] = 49

    # ── 8 best third-place teams ──────────────────────────────────────────────
    best_thirds = sorted(
        all_thirds,
        key=lambda x: (x["pts"], x["gd"], x["gf"]),
        reverse=True
    )[:8]
    third_teams = {t["team"] for t in best_thirds}

    for t in all_thirds:
        if t["team"] not in third_teams:
            positions[t["team"]] = 37   # eliminated 3rd-place

    # ── Build R32 bracket (fixed, seeded — no randomness) ────────────────────
    r32_pairs = _build_r32_pairs(group_results, best_thirds)

    # ── Knockout rounds ───────────────────────────────────────────────────────
    def run_round(pairs, loser_pos):
        winners = []
        for h, a in pairs:
            w = simulate_knockout(h, a)
            winners.append(w)
            positions[a if w == h else h] = loser_pos
        return winners

    r16    = run_round(r32_pairs,                                       33)
    qf     = run_round([(r16[i], r16[i+1]) for i in range(0, 16, 2)],  17)
    sf     = run_round([(qf[i],  qf[i+1])  for i in range(0,  8, 2)],   9)
    finals = run_round([(sf[i],  sf[i+1])  for i in range(0,  4, 2)],   5)

    # 3rd-place playoff
    sf_losers = [t for t in sf if t not in finals]
    if len(sf_losers) >= 2:
        third   = simulate_knockout(sf_losers[0], sf_losers[1])
        fourth  = sf_losers[1] if third == sf_losers[0] else sf_losers[0]
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
