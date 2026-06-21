"""
WC 2026 Match Outcome Predictor — Phase 4 (Option A: xG Regression)
=====================================================================
Trains THREE models on historical WC data:
  1. clf   — 3-class W/D/L classifier (used for knockout round advancement)
  2. reg_h — regressor predicting λ_home (expected goals, home perspective)
  3. reg_a — regressor predicting λ_away (expected goals, away perspective)

λ values feed into the Poisson simulation layer (backend/simulate.py) to
generate integer scorelines for group stage ranking (pts → GD → GF).

Uses sklearn HistGradientBoosting (XGBoost-equivalent; no OpenMP needed).
"""

import os
import pickle
import warnings

import numpy as np
import pandas as pd
from scipy.optimize import minimize_scalar
from scipy.stats import poisson as _poisson_dist
from sklearn.ensemble import HistGradientBoostingClassifier, HistGradientBoostingRegressor
from sklearn.model_selection import StratifiedKFold, KFold, cross_val_score

warnings.filterwarnings("ignore")

BASE       = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
ELO_HIST   = os.path.join(BASE, "data", "engineered",  "elo_history.csv")
SQUAD_MET  = os.path.join(BASE, "data", "engineered",  "team_squad_metrics.csv")
ARCHETYPE  = os.path.join(BASE, "data", "engineered",  "team_archetype_balance.csv")
RESULTS    = os.path.join(BASE, "data", "cleaned",      "cleaned_results.csv")
MODEL_OUT  = os.path.join(BASE, "data", "engineered",   "xgb_model.pkl")

TRAIN_FEATURES = ["elo_diff", "hot_elo_diff", "tournament_weight"]

# Half-life for time-decay weighting: 4 years = 1461 days
_DECAY_HALFLIFE_DAYS = 1461
_REFERENCE_DATE = pd.Timestamp("2026-06-01")


# ── 1. Build training data ────────────────────────────────────────────────────

def build_training_data() -> pd.DataFrame:
    elo  = pd.read_csv(ELO_HIST,  parse_dates=["date"])
    res  = pd.read_csv(RESULTS,   parse_dates=["date"])

    # All international matches (not WC-only).
    # tournament_weight used as sample_weight in fit() to preserve WC emphasis.
    all_res = res.copy()

    # Home-perspective Elo rows (all tournaments)
    home_elo = elo.copy()
    home_elo = home_elo.rename(columns={
        "team": "home_team", "opponent": "away_team",
        "pre_match_full_elo": "home_full_elo",
        "pre_match_hot_elo":  "home_hot_elo",
    })

    # Away-perspective Elo rows (all tournaments)
    away_elo = elo[
        ["date", "team", "opponent", "pre_match_full_elo", "pre_match_hot_elo"]
    ].copy()
    away_elo = away_elo.rename(columns={
        "team": "away_team", "opponent": "home_team",
        "pre_match_full_elo": "away_full_elo",
        "pre_match_hot_elo":  "away_hot_elo",
    })

    # Merge Elo onto results
    df = all_res.merge(
        home_elo[["date", "home_team", "away_team", "home_full_elo", "home_hot_elo", "result"]],
        on=["date", "home_team", "away_team"], how="inner"
    ).merge(
        away_elo[["date", "home_team", "away_team", "away_full_elo", "away_hot_elo"]],
        on=["date", "home_team", "away_team"], how="inner"
    )

    # Deduplicate (each match appears once from each side in elo_history)
    df = df.drop_duplicates(subset=["date", "home_team", "away_team"])

    df["elo_diff"]     = df["home_full_elo"] - df["away_full_elo"]
    df["hot_elo_diff"] = df["home_hot_elo"]  - df["away_hot_elo"]

    # Target: 0=away win, 1=draw, 2=home win
    def outcome(r):
        if r == 1.0:   return 2
        elif r == 0.5: return 1
        else:          return 0
    df["target"] = df["result"].apply(outcome)

    # ── Time-decay weight (exponential, half-life = 4 years) ─────────────────
    days_ago = (_REFERENCE_DATE - df["date"]).dt.days.clip(lower=0)
    decay    = np.exp(-np.log(2) * days_ago / _DECAY_HALFLIFE_DAYS)
    # Combined weight: tournament importance × recency decay
    df["sample_weight"] = df["tournament_weight"] * decay

    return df


# ── 2. Train classifier (W/D/L) ───────────────────────────────────────────────

def train_classifier(df: pd.DataFrame):
    X  = df[TRAIN_FEATURES].values
    y  = df["target"].values
    sw = df["sample_weight"].values

    cv = StratifiedKFold(n_splits=5, shuffle=True, random_state=42)
    best_ll, best_p = float("inf"), {"max_depth": 3, "learning_rate": 0.05}

    for md in [3, 4, 5]:
        for lr in [0.05, 0.10, 0.15]:
            clf = HistGradientBoostingClassifier(
                max_iter=300, max_depth=md, learning_rate=lr,
                random_state=42, early_stopping=False)
            ll = -cross_val_score(clf, X, y, cv=cv, scoring="neg_log_loss",
                                  params={"sample_weight": sw}).mean()
            if ll < best_ll:
                best_ll, best_p = ll, {"max_depth": md, "learning_rate": lr}

    print(f"  Classifier  best={best_p}  CV log-loss={best_ll:.4f}")
    clf = HistGradientBoostingClassifier(
        max_iter=300, random_state=42, early_stopping=False, **best_p)
    clf.fit(X, y, sample_weight=sw)
    return clf


# ── 3. Train xG regressors (λ_home, λ_away) ──────────────────────────────────

def train_regressors(df: pd.DataFrame):
    X  = df[TRAIN_FEATURES].values
    yh = df["home_score"].values.astype(float)
    ya = df["away_score"].values.astype(float)
    sw = df["sample_weight"].values

    cv = KFold(n_splits=5, shuffle=True, random_state=42)
    best_mse, best_p = float("inf"), {"max_depth": 3, "learning_rate": 0.05}

    for md in [3, 4, 5]:
        for lr in [0.05, 0.10, 0.15]:
            reg = HistGradientBoostingRegressor(
                max_iter=300, max_depth=md, learning_rate=lr,
                random_state=42, early_stopping=False)
            # Average MSE across both targets, weighted
            mse_h = -cross_val_score(reg, X, yh, cv=cv, scoring="neg_mean_squared_error",
                                     params={"sample_weight": sw}).mean()
            mse_a = -cross_val_score(reg, X, ya, cv=cv, scoring="neg_mean_squared_error",
                                     params={"sample_weight": sw}).mean()
            mse = (mse_h + mse_a) / 2
            if mse < best_mse:
                best_mse, best_p = mse, {"max_depth": md, "learning_rate": lr}

    print(f"  Regressors  best={best_p}  CV MSE={best_mse:.4f}")
    reg_h = HistGradientBoostingRegressor(
        max_iter=300, random_state=42, early_stopping=False, **best_p)
    reg_a = HistGradientBoostingRegressor(
        max_iter=300, random_state=42, early_stopping=False, **best_p)
    reg_h.fit(X, yh, sample_weight=sw)
    reg_a.fit(X, ya, sample_weight=sw)
    return reg_h, reg_a


# ── 4. Calibrate Dixon-Coles ρ from WC match data ────────────────────────────

def calibrate_rho(df: pd.DataFrame) -> float:
    """MLE estimate of Dixon-Coles ρ from WC goal data.

    Uses per-match mean goals as proxy for λ (fast; no per-match regressor needed
    at calibration time). A more precise version would use per-match predictions.
    """
    wc_df    = df[df["tournament_weight"] == 60].copy()
    mean_lh  = float(wc_df["home_score"].mean())
    mean_la  = float(wc_df["away_score"].mean())
    scores   = list(zip(wc_df["home_score"].astype(int), wc_df["away_score"].astype(int)))

    def neg_loglik(rho: float) -> float:
        ll = 0.0
        for hg, ag in scores:
            p_h = _poisson_dist.pmf(hg, mean_lh)
            p_a = _poisson_dist.pmf(ag, mean_la)
            # DC tau correction
            if   hg == 0 and ag == 0: tau = 1.0 - mean_lh * mean_la * rho
            elif hg == 0 and ag == 1: tau = 1.0 + mean_la * rho
            elif hg == 1 and ag == 0: tau = 1.0 + mean_lh * rho
            elif hg == 1 and ag == 1: tau = 1.0 - rho
            else:                     tau = 1.0
            ll += np.log(max(p_h * p_a * tau, 1e-15))
        return -ll

    result  = minimize_scalar(neg_loglik, bounds=(-0.5, 0.0), method="bounded")
    rho_hat = float(result.x)
    print(f"  Calibrated DC ρ = {rho_hat:.4f}  (was fixed at -0.10)")
    return rho_hat


# ── 5. Prediction helper ──────────────────────────────────────────────────────

def get_team_features(name: str, squad: pd.DataFrame, arch: pd.DataFrame) -> dict:
    row = squad[squad["country"] == name]
    if row.empty:
        raise ValueError(f"'{name}' not found in squad metrics")
    r = row.iloc[0].to_dict()
    a = arch[arch["country"] == name]
    if not a.empty:
        r["tactical_entropy"] = a.iloc[0]["tactical_entropy"]
        r["avg_versatility"]  = a.iloc[0]["avg_versatility"]
    else:
        r["tactical_entropy"] = 0.0
        r["avg_versatility"]  = 0.0
    return r


def predict_match(home: str, away: str, models: dict,
                  squad: pd.DataFrame, arch: pd.DataFrame) -> dict:
    h = get_team_features(home, squad, arch)
    a = get_team_features(away, squad, arch)
    # Guard: replace any NaN metric with 0 so tanh doesn't propagate NaN
    for d in (h, a):
        for k, v in d.items():
            if isinstance(v, float) and (np.isnan(v) or np.isinf(v)):
                d[k] = 0.0

    elo_diff     = h["full_elo"]  - a["full_elo"]
    hot_elo_diff = h["hot_elo"]   - a["hot_elo"]
    X = np.array([[elo_diff, hot_elo_diff, 60.0]])

    # W/D/L probs from classifier
    probs = models["clf"].predict_proba(X)[0]   # [away_win, draw, home_win]

    # xG from regressors — clip hard; regressors can output negative on edge cases
    lam_h = float(np.clip(models["reg_h"].predict(X)[0], 0.20, 5.0))
    lam_a = float(np.clip(models["reg_a"].predict(X)[0], 0.20, 5.0))

    # Squad-metric soft nudge (20% weight on top of Elo signal)
    squad_adv = (
        0.30 * np.tanh((h["total_squad_value"]  - a["total_squad_value"])  / 1e8)
        + 0.15 * np.tanh((h["age_peak_score"]   - a["age_peak_score"])     * 5)
        + 0.15 * np.tanh((h["pct_elite_league"] - a["pct_elite_league"])   * 3)
        + 0.15 * np.tanh((h["depth_overall"]    - a["depth_overall"])      * 5)
        + 0.10 * np.tanh((a["total_club_minutes"]- h["total_club_minutes"]) / 1e4)
        + 0.05 * (float(h["has_elite_pedigree"]) - float(a["has_elite_pedigree"]))
        + 0.05 * np.tanh(h["tactical_entropy"]  - a["tactical_entropy"])
        + 0.05 * np.tanh((h["avg_versatility"]  - a["avg_versatility"])    * 5)
    )
    nudge = 0.20 * squad_adv
    probs_adj = probs.copy()
    probs_adj[2] = np.clip(probs_adj[2] + nudge, 0.01, 0.98)
    probs_adj[0] = np.clip(probs_adj[0] - nudge, 0.01, 0.98)
    probs_adj /= probs_adj.sum()

    # Also nudge λ values — clip again after nudge
    lam_h = float(np.clip(lam_h * (1 + 0.10 * squad_adv), 0.20, 5.0))
    lam_a = float(np.clip(lam_a * (1 - 0.10 * squad_adv), 0.20, 5.0))

    # ELO-calibration anchor: blend model probs with pure ELO expectation (neutral venue).
    # The classifier over-learned real home advantage from training data — at WC neutral
    # venues a 400-point ELO gap should give the stronger team ~85%+ win probability, not
    # produce a coin flip. Blending 50/50 anchors predictions to the ELO reality while
    # keeping squad/form signal from the model.
    elo_home_win = 1.0 / (1.0 + 10.0 ** (-elo_diff / 400.0))
    draw_rate    = 0.22  # typical WC draw rate (roughly constant across mismatches)
    elo_away_win = max(1.0 - elo_home_win - draw_rate, 0.02)
    elo_prior = np.array([elo_away_win, draw_rate, elo_home_win])
    elo_prior /= elo_prior.sum()

    BLEND = 0.50
    probs_adj = BLEND * probs_adj + (1.0 - BLEND) * elo_prior
    probs_adj /= probs_adj.sum()

    # Floor the stronger team's λ: if one team is 150+ ELO points better, they should
    # score at least 0.9 goals in expectation (equivalent to ~0.6 GPG over 90 min).
    if elo_diff < -150:   # away team much stronger
        lam_a = max(lam_a, 0.20 + 0.006 * min(abs(elo_diff), 300))
    elif elo_diff > 150:  # home team much stronger
        lam_h = max(lam_h, 0.20 + 0.006 * min(elo_diff, 300))

    return {
        "home": home, "away": away,
        "away_win":  round(float(probs_adj[0]), 4),
        "draw":      round(float(probs_adj[1]), 4),
        "home_win":  round(float(probs_adj[2]), 4),
        "lambda_home": round(lam_h, 3),
        "lambda_away": round(lam_a, 3),
    }


# ── Main ──────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    print("=" * 60)
    print("WC 2026 AI Predictor — Phase 4: Model Training (xG mode)")
    print("=" * 60)

    print("\n[1/4] Building training data (all internationals + time-decay)...")
    df = build_training_data()
    wc_df = df[df["tournament_weight"] == 60]
    print(f"  Total rows: {len(df)}  |  WC rows: {len(wc_df)}")
    print(f"  WC avg goals: H={wc_df['home_score'].mean():.2f}  A={wc_df['away_score'].mean():.2f}")
    print(f"  WC class balance: {wc_df['target'].value_counts().sort_index().to_dict()}")
    print(f"  Sample weight range: [{df['sample_weight'].min():.4f}, {df['sample_weight'].max():.1f}]")

    print("\n[2/4] Calibrating Dixon-Coles ρ from WC data...")
    rho_calibrated = calibrate_rho(df)

    print("\n[3/4] Training models...")
    clf        = train_classifier(df)
    reg_h, reg_a = train_regressors(df)

    models = {"clf": clf, "reg_h": reg_h, "reg_a": reg_a,
              "features": TRAIN_FEATURES, "dc_rho": rho_calibrated}

    os.makedirs(os.path.dirname(MODEL_OUT), exist_ok=True)
    with open(MODEL_OUT, "wb") as f:
        pickle.dump(models, f)
    print(f"\n  Saved → {MODEL_OUT}")

    print("\n[4/4] Sample predictions...")
    squad = pd.read_csv(SQUAD_MET)
    arch  = pd.read_csv(ARCHETYPE)

    for matchup in [("Argentina", "France"), ("Spain", "England"), ("Brazil", "Germany")]:
        r = predict_match(*matchup, models, squad, arch)
        print(f"\n  {r['home']} vs {r['away']}")
        print(f"    Home win {r['home_win']:.1%} | Draw {r['draw']:.1%} | Away win {r['away_win']:.1%}")
        print(f"    xG  {r['lambda_home']:.2f} — {r['lambda_away']:.2f}")

    print("\nDone.")
