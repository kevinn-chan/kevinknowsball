"""
Elo Power Ranking Engine
Iterates chronologically through cleaned_results.csv and produces:
  - elo_history.csv  : every team's Elo AFTER every match they played (for XGBoost training)
  - team_elo_current.csv : current Elo for all 48 WC teams + hot-form Elo (for prediction)

Two Elo signals are tracked in parallel:
  full_elo  : full historical Elo (slow-moving, ~150 years of signal)
  hot_elo   : short-window Elo reset every 24 months (captures tournament momentum)
"""

import math
import numpy as np
import pandas as pd
from pathlib import Path

# ── Constants ────────────────────────────────────────────────────────────────

INITIAL_ELO = 1500
HOME_ADVANTAGE = 100          # Elo points added to home team's expected score calc
                              # zeroed out when neutral=True (all WC games are neutral)
K_SCALE = 0.67                # Scales tournament_weight (max 60) → effective K ≈ 40
                              # 538/ClubElo use K=20-40; WC matches get ~40, friendlies ~7
HOT_DECAY_HALFLIFE = 365      # hot_elo: weight of a match halves after 12 months
                              # Replaces the hard 24-month reset (which was too blunt —
                              # a reset landing after a bad patch wiped earned momentum)

# ── Successor state mapping ───────────────────────────────────────────────────
# ⚠️  PROBLEM: Team continuity breaks across political events.
# These dissolved nations should seed their successor's Elo rather than starting cold.
# Current approach: inherit predecessor's Elo at the dissolution date.
# Known gaps: USSR→Russia (1992), Czechoslovakia→Czech Republic/Slovakia (1994),
#             Yugoslavia→Serbia/Croatia/etc. (early 90s), West Germany→Germany (1990).
PREDECESSOR_MAP = {
    'Russia':          'Soviet Union',
    'Czech Republic':  'Czechoslovakia',
    'Slovakia':        'Czechoslovakia',
    'Serbia':          'Yugoslavia',
    'Croatia':         'Yugoslavia',
    'Slovenia':        'Yugoslavia',
    'North Macedonia': 'Yugoslavia',
    'Bosnia and Herzegovina': 'Yugoslavia',
    'Germany':         'West Germany',    # reunification 1990
}

# ── K-factor with Margin of Victory multiplier ───────────────────────────────
def k_factor(tournament_weight: float, goal_diff: int, winner_elo_diff: float) -> float:
    """
    Base K from tournament importance × MoV multiplier (538-style).

    MoV multiplier: ln(|GD| + 1) × autocorrelation correction
    The autocorrelation term prevents a dominant team from over-gaining Elo
    just by running up the score against weak opposition.

    💡 IDEA: Consider a separate 'dominance bonus' if a team wins 3+ consecutive
    WC matches by 2+ goals — signals a team that's genuinely peaking, not just
    lucky. Feeds into the momentum feature for the XGBoost model.
    """
    base_k = tournament_weight * K_SCALE
    if goal_diff == 0:        # draw — no MoV multiplier
        return base_k
    mov = math.log(abs(goal_diff) + 1)
    # Autocorrelation correction: reduces inflation when strong team beats weak team by a lot
    autocorr = 2.2 / (winner_elo_diff * 0.001 + 2.2)
    return base_k * mov * autocorr


def expected_score(rating_a: float, rating_b: float, home_advantage: float = 0.0) -> float:
    return 1.0 / (1.0 + 10 ** ((rating_b - rating_a - home_advantage) / 400))


def actual_score(home_goals: float, away_goals: float) -> tuple[float, float]:
    if home_goals > away_goals:
        return 1.0, 0.0
    if home_goals < away_goals:
        return 0.0, 1.0
    return 0.5, 0.5    # draw


# ── Mean reversion ────────────────────────────────────────────────────────────
def apply_mean_reversion(elo: float, days_inactive: int) -> float:
    """
    ⚠️  PROBLEM: Teams that don't play for years (WWII gap 1939–1946, or newly
    formed nations) retain stale Elo indefinitely. Fix: pull rating 1/3 of the
    way back to 1500 per full year of inactivity beyond 18 months.

    💡 IDEA: A 'federation strength prior' would be more accurate than pure mean
    reversion — a nation returning from a 2-year break should regress toward
    their confederation average (UEFA ~1650, CONCACAF ~1450), not the global 1500.
    That's a ~15-point improvement in calibration; implement post-MVP.
    """
    if days_inactive <= 548:   # under 18 months → no reversion
        return elo
    years_inactive = (days_inactive - 548) / 365
    reversion_rate = 1/3
    return elo + (INITIAL_ELO - elo) * reversion_rate * years_inactive


# ── Core engine ──────────────────────────────────────────────────────────────

def build_elo(results_path: Path) -> tuple[pd.DataFrame, dict]:
    df = pd.read_csv(results_path, parse_dates=['date'])
    df = df.sort_values('date').reset_index(drop=True)

    full_elo: dict[str, float] = {}     # permanent historical Elo
    hot_elo: dict[str, float] = {}      # recency-weighted Elo (exponential decay)
    last_played: dict[str, pd.Timestamp] = {}
    recent_deltas: dict[str, list] = {}  # last N Elo deltas per team → confidence interval

    history_rows = []

    for _, row in df.iterrows():
        home, away = row['home_team'], row['away_team']
        date = row['date']
        neutral = bool(row['neutral'])
        t_weight = float(row['tournament_weight'])
        home_goals = float(row['home_score'])
        away_goals = float(row['away_score'])

        # ── Initialise new teams (or inherit from predecessor) ────────────────
        for team in [home, away]:
            if team not in full_elo:
                predecessor = PREDECESSOR_MAP.get(team)
                seed = full_elo.get(predecessor, INITIAL_ELO) if predecessor else INITIAL_ELO
                full_elo[team] = seed
                hot_elo[team] = seed          # hot inherits same seed, not 1500
                last_played[team] = date
                recent_deltas[team] = []

        # ── Mean reversion for long inactivity ────────────────────────────────
        for team in [home, away]:
            days_idle = (date - last_played[team]).days
            full_elo[team] = apply_mean_reversion(full_elo[team], days_idle)
            # hot_elo: decay toward 1500 exponentially with time idle
            # A team inactive for 12 months has its gap to 1500 halved.
            decay = math.exp(-math.log(2) * days_idle / HOT_DECAY_HALFLIFE)
            hot_elo[team] = INITIAL_ELO + (hot_elo[team] - INITIAL_ELO) * decay

        # ── Capture pre-match ratings (for XGBoost training rows) ─────────────
        pre_home_full = full_elo[home]
        pre_away_full = full_elo[away]
        pre_home_hot  = hot_elo[home]
        pre_away_hot  = hot_elo[away]

        # ── Home advantage: zero on neutral ground ────────────────────────────
        ha = 0.0 if neutral else HOME_ADVANTAGE

        # ── Expected & actual scores ──────────────────────────────────────────
        exp_home_full = expected_score(pre_home_full, pre_away_full, ha)
        exp_away_full = 1.0 - exp_home_full
        exp_home_hot  = expected_score(pre_home_hot,  pre_away_hot,  ha)
        exp_away_hot  = 1.0 - exp_home_hot

        s_home, s_away = actual_score(home_goals, away_goals)

        # ── K-factor (MoV-adjusted) ───────────────────────────────────────────
        goal_diff = int(abs(home_goals - away_goals))
        winner_elo_diff = abs(pre_home_full - pre_away_full) if goal_diff > 0 else 0
        k = k_factor(t_weight, goal_diff, winner_elo_diff)

        # ── Update ratings ────────────────────────────────────────────────────
        delta_home_full = k * (s_home - exp_home_full)
        delta_away_full = k * (s_away - exp_away_full)
        full_elo[home] += delta_home_full
        full_elo[away] += delta_away_full
        hot_elo[home]  += k * (s_home - exp_home_hot)
        hot_elo[away]  += k * (s_away - exp_away_hot)
        last_played[home] = date
        last_played[away] = date

        # Track last 10 deltas per team for confidence interval
        for team, delta in [(home, delta_home_full), (away, delta_away_full)]:
            recent_deltas[team].append(delta)
            if len(recent_deltas[team]) > 10:
                recent_deltas[team].pop(0)

        # ── Store post-match snapshot for both teams ──────────────────────────
        # ⚠️  IMPORTANT: training rows must use PRE-match Elo, not post-match.
        # We store both so the XGBoost feature builder can use pre-match values
        # while this file also records the post-match state for audit/visualisation.
        for team, opp, s_team, pre_f, post_f, pre_h, post_h in [
            (home, away, s_home, pre_home_full, full_elo[home], pre_home_hot, hot_elo[home]),
            (away, home, s_away, pre_away_full, full_elo[away], pre_away_hot, hot_elo[away]),
        ]:
            history_rows.append({
                'date':            date,
                'team':            team,
                'opponent':        opp,
                'neutral':         neutral,
                'tournament_weight': t_weight,
                'pre_match_full_elo':  round(pre_f, 1),
                'post_match_full_elo': round(full_elo[team], 1),
                'pre_match_hot_elo':   round(pre_h, 1),
                'post_match_hot_elo':  round(hot_elo[team], 1),
                'result':          s_team,    # 1=win, 0.5=draw, 0=loss
            })

    history_df = pd.DataFrame(history_rows)
    return history_df, full_elo, hot_elo, recent_deltas


# ── Output helpers ────────────────────────────────────────────────────────────

def build_current_elo_table(full_elo: dict, hot_elo: dict, recent_deltas: dict, groups_path: Path) -> pd.DataFrame:
    """
    Filters to only the 48 WC teams and attaches their group.
    This is the table the XGBoost predictor and Streamlit UI will read.

    💡 IDEA: Add a 'confidence interval' column derived from the variance in
    the team's last 10 Elo deltas. A team with wildly fluctuating recent results
    (e.g., Algeria ±80 per match) is harder to predict than a stable side
    (e.g., Spain ±15). Feeding uncertainty into the XGBoost model as a feature
    — not just the point estimate — is a meaningful SOTA upgrade.
    """
    groups_df = pd.read_csv(groups_path)
    wc_teams = set(groups_df['country'])

    rows = []
    for country in groups_df['country']:
        f_elo = full_elo.get(country)
        h_elo = hot_elo.get(country)

        # ⚠️  PROBLEM: Some WC teams may have no Elo history at all if their name
        # in wc_2026_groups.csv doesn't match any entry in results.csv.
        # These will appear as None here — check the 'missing' output below.
        deltas = recent_deltas.get(country, [])
        elo_volatility = round(float(np.std(deltas)), 1) if len(deltas) >= 3 else None
        rows.append({
            'country':        country,
            'group':          groups_df.loc[groups_df['country'] == country, 'group'].values[0],
            'full_elo':       round(f_elo, 1) if f_elo else None,
            'hot_elo':        round(h_elo, 1) if h_elo else None,
            'elo_volatility': elo_volatility,   # stdev of last 10 Elo deltas — high = unpredictable
        })

    df = pd.DataFrame(rows).sort_values('full_elo', ascending=False).reset_index(drop=True)
    df['elo_rank'] = df.index + 1
    return df


# ── Main ──────────────────────────────────────────────────────────────────────

if __name__ == '__main__':
    base = Path(__file__).resolve().parent.parent
    results_path = base / 'cleaned' / 'cleaned_results.csv'
    groups_path  = base / 'cleaned' / 'wc_2026_groups.csv'
    out_dir      = base / 'engineered'
    out_dir.mkdir(exist_ok=True)

    print("Building Elo ratings across 49k+ matches...")
    history_df, full_elo, hot_elo, recent_deltas = build_elo(results_path)

    history_path = out_dir / 'elo_history.csv'
    history_df.to_csv(history_path, index=False)
    print(f"✅ Saved {len(history_df):,} match-level Elo snapshots → {history_path}")

    current_df = build_current_elo_table(full_elo, hot_elo, recent_deltas, groups_path)
    current_path = out_dir / 'team_elo_current.csv'
    current_df.to_csv(current_path, index=False)
    print(f"✅ Saved current Elo for {len(current_df)} WC teams → {current_path}")

    missing = current_df[current_df['full_elo'].isna()]['country'].tolist()
    if missing:
        print(f"\n⚠️  These WC teams have NO Elo history (name mismatch in results.csv):")
        for m in missing:
            print(f"   - {m}")
        print("   Fix: add entries to PREDECESSOR_MAP or check country_mapping in clean_results.py")
    else:
        print("\n✅ All 48 WC teams have Elo ratings.")

    print("\n── Top 20 by Full Elo ──")
    print(current_df[['elo_rank', 'country', 'group', 'full_elo', 'hot_elo']].head(20).to_string(index=False))
