"""
Squad Metrics Engine
Aggregates the official 26-man WC2026 squads into one feature vector per country.

Inputs:
  raw_scraped/wc2026_official_squads.csv   — actual selected players
  cleaned/players_masterlist.csv           — market values + tactical stats + sub_position
  raw_kaggle/appearances.csv               — club minutes (burnout)
  raw_scraped/wc_injured_players.csv       — confirmed absences
  cleaned/cleaned_wc_managers.csv          — manager tenure + pedigree
  engineered/team_elo_current.csv          — full/hot Elo + volatility

Output:
  engineered/team_squad_metrics.csv        — one row per country, all features
"""

import unicodedata
import numpy as np
import pandas as pd
from pathlib import Path
from rapidfuzz import process, fuzz

# ── Config ────────────────────────────────────────────────────────────────────

BIG_5        = {'GB1', 'ES1', 'IT1', 'L1', 'FR1'}
BURNOUT_COMPS = BIG_5 | {'NL1','PO1','TR1','BE1','SC1','GR1','DK1','CL','EL','ELQ','CLQ','ECLQ'}
WC_START      = pd.Timestamp('2026-06-11')
FUZZY_THRESHOLD = 85

# ── Position prime thresholds (age beyond which past-prime penalty kicks in) ─
# CB and DM age like wine; wingers and forwards fade faster.
# Sub-positions map to one of three prime-end ages.
PRIME_END = {
    'Goalkeeper':          36,
    'Centre-Back':         33,
    'Defensive Midfield':  33,
    'Central Midfield':    33,
    'Right Midfield':      31,
    'Left Midfield':       31,
    'Attacking Midfield':  31,
    'Right-Back':          31,
    'Left-Back':           31,
    'Right Winger':        31,
    'Left Winger':         31,
    'Second Striker':      31,
    'Centre-Forward':      31,
}
DEFAULT_PRIME_END = {
    'GK':  36,
    'DEF': 33,   # default DEF without sub_position → assume CB
    'MID': 33,
    'ATT': 31,
}

# ── Helpers ───────────────────────────────────────────────────────────────────

def strip_accents(text: str) -> str:
    if pd.isna(text):
        return ''
    return ''.join(
        c for c in unicodedata.normalize('NFD', str(text))
        if unicodedata.category(c) != 'Mn'
    ).lower()


def get_prime_end(row: pd.Series) -> int:
    """Look up past-prime threshold from sub_position, fall back to general_position."""
    sub = row.get('specific_position')
    if pd.notna(sub) and sub in PRIME_END:
        return PRIME_END[sub]
    return DEFAULT_PRIME_END.get(row.get('general_position', 'MID'), 33)


def age_score(age: float, prime_end: int) -> float:
    """
    Asymmetric age scoring with graduated youth bonus:

      Youth and prime (up to prime_end): 1.0 — no bonus, no penalty.
      Past prime (prime_end+1 to prime_end+2): −0.225/yr, floor 0.55.
      Way past prime (>prime_end+2): −0.30/yr additional (2× steeper), floor 0.10.

    The asymmetry is intentional: a 22-year-old and a 28-year-old contribute equally
    in expectation; a 34-year-old forward or a 38-year-old GK is a measurable liability
    in a tournament's knockout rounds.

    💡 IDEA: Post-tournament, calibrate these slopes against actual player performance
    data. The breakpoints are principled but estimated.
    """
    if age <= prime_end:
        return 1.0                                      # youth and prime: no modifier
    years_past = age - prime_end
    if years_past <= 2:
        return max(0.55, 1.0 - years_past * 0.225)     # past prime: −0.225/yr
    return max(0.10, 0.55 - (years_past - 2) * 0.30)   # way past prime: −0.30/yr (2×)


def gini(values: pd.Series) -> float:
    """Gini coefficient [0=equal, 1=one player has everything]. Bounded and zero-floor safe."""
    arr = np.sort(np.abs(values.dropna().values))
    n = len(arr)
    if n == 0 or arr.sum() == 0:
        return 0.0
    idx = np.arange(1, n + 1)
    return float((2 * (idx * arr).sum()) / (n * arr.sum()) - (n + 1) / n)


FORMATIONS = {
    '4-3-3':   {'GK': 1, 'DEF': 4, 'MID': 3, 'ATT': 3},
    '4-4-2':   {'GK': 1, 'DEF': 4, 'MID': 4, 'ATT': 2},
    '4-2-3-1': {'GK': 1, 'DEF': 4, 'MID': 5, 'ATT': 1},
    '5-3-2':   {'GK': 1, 'DEF': 5, 'MID': 3, 'ATT': 2},
}

def best_formation(squad: pd.DataFrame) -> tuple[str, dict]:
    """
    Selects the formation (from 4-3-3 / 4-4-2 / 4-2-3-1 / 5-3-2) that maximises
    the total market value of the starting XI, using only players in their natural
    general_position. Returns (formation_name, starter_counts_dict).

    ⚠️  PROBLEM: We don't have versatility data (e.g., a fullback who can play
    central midfield in an emergency). This means formations that require more
    players at a position than the squad has in that role are marked infeasible,
    even though in practice a manager would adapt. Acceptable for now — the chosen
    formation will always be genuinely achievable with the squad's natural positions.
    """
    pos_vals = {
        pos: sorted(grp['market_value'].fillna(0).tolist(), reverse=True)
        for pos, grp in squad.groupby('general_position')
    }
    best_name, best_val, best_slots = None, -1, None
    for name, slots in FORMATIONS.items():
        feasible = all(len(pos_vals.get(pos, [])) >= n for pos, n in slots.items())
        if not feasible:
            continue
        xi_val = sum(sum(pos_vals[pos][:n]) for pos, n in slots.items())
        if xi_val > best_val:
            best_val, best_name, best_slots = xi_val, name, slots
    return best_name, best_slots


def replacement_depth(squad: pd.DataFrame) -> dict:
    """
    Uses the squad's best formation to define who is a starter vs backup at each
    position. depth_ratio = mean_backup_value / mean_starter_value.
    1.0 = backup quality equals starter quality; 0.0 = complete cliff after starters.

    💡 IDEA: Weight the four position depth scores by injury sensitivity:
    GK > CB > striker > fullback/winger. One GK injury is catastrophic in a way
    one backup winger isn't. Add once the model has enough examples to learn
    the weights itself rather than hardcoding them.

    ⚠️  PROBLEM: market_value undervalues versatile utility players (worth €2M but
    covers three roles). K-Means archetypes will improve this in the next phase.
    """
    formation, slots = best_formation(squad)
    depth_ratios = {'formation': formation}

    for pos, n_starters in slots.items():
        grp = squad[squad['general_position'] == pos]['market_value'].sort_values(ascending=False)
        starters = grp.iloc[:n_starters]
        backups  = grp.iloc[n_starters:]
        s_mean = starters.mean() if len(starters) > 0 and starters.mean() > 0 else 1
        depth_ratios[f'depth_{pos.lower()}'] = round(backups.mean() / s_mean, 3) if len(backups) > 0 else 0.0

    position_depths = [v for k, v in depth_ratios.items() if k.startswith('depth_') and k != 'depth_overall']
    depth_ratios['depth_overall'] = round(float(np.mean(position_depths)), 3)
    return depth_ratios


# ── Step 1: Fuzzy-join official squads → masterlist ───────────────────────────

def fuse_squads_to_masterlist(squads: pd.DataFrame, master: pd.DataFrame) -> pd.DataFrame:
    """
    Three-pass matching strategy:
      Pass 1: exact normalised match
      Pass 2: name-reversed match (handles Korean/East Asian family-first ordering)
      Pass 3: fuzzy WRatio >= FUZZY_THRESHOLD

    ⚠️  PROBLEM: ~3-5% of players in smaller WC nations (Jordan, Haiti, Qatar) are
    genuinely absent from Transfermarkt — they play in domestic leagues with no TM
    presence. These get squad-mean market value and null tactical stats. Acceptable
    at squad level; don't over-engineer a lookup for <50 players.
    """
    master = master.copy()
    master['norm'] = master['player_name'].apply(strip_accents)
    squads = squads.copy()
    squads['norm'] = squads['player_name'].apply(strip_accents)

    def reverse_tokens(s: str) -> str:
        parts = s.split()
        return ' '.join(parts[1:] + parts[:1]) if len(parts) >= 2 else s

    master_norm_to_idx = dict(zip(master['norm'], master.index))
    master_norms = list(master_norm_to_idx.keys())

    matches = []
    for _, row in squads.iterrows():
        nm   = row['norm']
        nm_r = reverse_tokens(nm)   # family-first → given-first attempt

        if nm in master_norm_to_idx:
            matches.append({'player_name': row['player_name'], 'master_idx': master_norm_to_idx[nm]})
        elif nm_r in master_norm_to_idx:
            matches.append({'player_name': row['player_name'], 'master_idx': master_norm_to_idx[nm_r]})
        else:
            # Try fuzzy on both orderings, take the better score
            r1 = process.extractOne(nm,   master_norms, scorer=fuzz.WRatio)
            r2 = process.extractOne(nm_r, master_norms, scorer=fuzz.WRatio)
            best = max([r for r in [r1, r2] if r], key=lambda x: x[1], default=None)
            if best and best[1] >= FUZZY_THRESHOLD:
                matches.append({'player_name': row['player_name'], 'master_idx': master_norm_to_idx[best[0]]})
            else:
                matches.append({'player_name': row['player_name'], 'master_idx': None})

    match_df = pd.DataFrame(matches)
    merged = squads.merge(match_df, on='player_name')
    merged = merged.merge(
        master[['player_id', 'market_value', 'specific_position',
                'goals_per_90', 'assists_per_90', 'interceptions',
                'tackles_won', 'crosses']].rename_axis('master_idx').reset_index(),
        on='master_idx', how='left'
    )

    unmatched = merged['master_idx'].isna().sum()
    rate = 100 * (1 - unmatched / len(merged))
    print(f"  Match rate: {rate:.1f}%  ({len(merged)-unmatched}/{len(merged)} players linked)")
    if unmatched:
        miss_by_country = merged[merged['master_idx'].isna()].groupby('country').size()
        print(f"  Unlinked by country:\n{miss_by_country.to_string()}")
    return merged


# ── Step 2: Burnout ───────────────────────────────────────────────────────────

def build_burnout_map(apps: pd.DataFrame) -> pd.Series:
    """
    ⚠️  PROBLEM: appearances.csv (Kaggle/Transfermarkt) cuts off March 2026.
    Apr–Jun 2026 are missing — CL knockout rounds, title deciders, cup finals.
    These are peak-fatigue weeks. Burnout for England/Germany/France is understated
    ~20-25%. Re-download the Kaggle dataset closer to the tournament for a refresh.

    ⚠️  PROBLEM: MLS (MSL1), J-League, Saudi Pro League (SA1) are absent from this
    dataset entirely. burnout_coverage flags which players have zero data so the
    XGBoost model can downweight this feature for affected squads (Mexico, Japan,
    Saudi Arabia, Uzbekistan).
    """
    season = apps[
        (apps['date'] >= '2025-07-01') &
        (apps['competition_id'].isin(BURNOUT_COMPS))
    ]
    return season.groupby('player_id')['minutes_played'].sum()


# ── Step 3: Per-country aggregation ──────────────────────────────────────────

def aggregate_country(country: str, squad: pd.DataFrame,
                      burnout_map: pd.Series, injured_set: set,
                      elite_players: set) -> dict:

    has_data = squad['market_value'].notna().any()
    mv = squad['market_value'].fillna(squad['market_value'].mean())

    # ── Financial ─────────────────────────────────────────────────────────────
    total_value       = mv.sum()
    star_value        = mv.max()
    star_reliance     = gini(mv) if has_data else np.nan
    haaland_flag      = int(star_value / total_value > 0.30) if total_value > 0 else 0

    # ── Age: position-specific asymmetric scoring ─────────────────────────────
    scores = squad.apply(lambda r: age_score(r['age_at_wc'], get_prime_end(r)), axis=1)
    age_peak_score    = round(scores.mean(), 3)
    # Separate penalty counts for transparency
    n_past_prime      = int((scores < 0.55).sum())
    n_youth           = int((squad['age_at_wc'] < 24).sum())
    avg_age           = round(squad['age_at_wc'].mean(), 1)

    # ── Experience ────────────────────────────────────────────────────────────
    avg_caps          = round(squad['caps'].mean(), 1)
    total_goals       = int(squad['goals'].sum())

    # ── Elite league exposure ──────────────────────────────────────────────────
    squad_ids = squad['player_id'].dropna().astype(int)
    n_elite   = squad_ids.isin(elite_players).sum()
    pct_elite = round(n_elite / len(squad), 3)

    # ── Burnout ───────────────────────────────────────────────────────────────
    mins_series      = burnout_map.reindex(squad_ids).fillna(0)
    total_minutes    = int(mins_series.sum())
    avg_minutes      = round(mins_series.mean(), 0)
    burnout_coverage = round((mins_series > 0).sum() / max(len(squad_ids), 1), 3)

    # ── Club linkage ──────────────────────────────────────────────────────────
    club_counts      = squad['club'].value_counts()
    max_club_players = int(club_counts.iloc[0])
    top_club         = club_counts.index[0]

    # ── Replacement depth ─────────────────────────────────────────────────────
    depth = replacement_depth(squad)

    # ── Injuries ──────────────────────────────────────────────────────────────
    n_injured         = int(squad['player_name'].isin(injured_set).sum())
    injured_value     = squad.loc[squad['player_name'].isin(injured_set), 'market_value'].sum()
    pct_value_injured = round(injured_value / total_value, 3) if total_value > 0 else 0.0

    return {
        'country':            country,
        'has_financial_data': int(has_data),
        # Financial
        'total_squad_value':  round(total_value, 0),
        'star_player_value':  round(star_value, 0),
        'star_reliance_gini': round(star_reliance, 3) if not np.isnan(star_reliance) else None,
        'haaland_flag':       haaland_flag,
        # Age
        'avg_age':            avg_age,
        'age_peak_score':     age_peak_score,
        'n_past_prime':       n_past_prime,
        'n_youth_u24':        n_youth,
        # Experience
        'avg_caps':           avg_caps,
        'total_squad_goals':  total_goals,
        # Elite league
        'pct_elite_league':   pct_elite,
        # Burnout
        'total_club_minutes': total_minutes,
        'avg_club_minutes':   avg_minutes,
        'burnout_coverage':   burnout_coverage,
        # Club linkage
        'max_club_players':   max_club_players,
        'top_club':           top_club,
        # Replacement depth
        **depth,
        # Injuries
        'n_injured':          n_injured,
        'pct_value_injured':  pct_value_injured,
    }


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    base    = Path(__file__).resolve().parent.parent
    out_dir = base / 'engineered'
    out_dir.mkdir(exist_ok=True)

    print("Loading inputs...")
    squads   = pd.read_csv(base / 'raw_scraped'  / 'wc2026_official_squads.csv')
    master   = pd.read_csv(base / 'cleaned'       / 'players_masterlist.csv')
    managers = pd.read_csv(base / 'cleaned'       / 'cleaned_wc_managers.csv')
    injured  = pd.read_csv(base / 'raw_scraped'  / 'wc_injured_players.csv', parse_dates=['return_date'])
    apps     = pd.read_csv(base / 'raw_kaggle'   / 'appearances.csv', parse_dates=['date'])
    elo      = pd.read_csv(out_dir               / 'team_elo_current.csv')

    print("\nFuzzy-matching official squads → masterlist...")
    fused = fuse_squads_to_masterlist(squads, master)

    print("\nBuilding burnout map (2025/26 club minutes)...")
    burnout_map = build_burnout_map(apps)

    # Injury set — fuzzy match names from injury file against squad names
    print("\nMatching injury list to squads...")
    squad_norms  = {strip_accents(n): n for n in fused['player_name']}
    norm_list    = list(squad_norms.keys())
    injured_set  = set()
    for inj in injured['player_name']:
        r = process.extractOne(strip_accents(inj), norm_list, scorer=fuzz.WRatio)
        if r and r[1] >= 88:
            injured_set.add(squad_norms[r[0]])
    print(f"  Confirmed WC absentees in squads: {len(injured_set)}")

    # Elite league flag — player appeared in BIG_5 this season
    print("\nComputing elite league exposure...")
    season_apps   = apps[apps['date'] >= '2025-07-01']
    elite_players = set(season_apps[season_apps['competition_id'].isin(BIG_5)]['player_id'])

    # Enrich fused with specific_position from masterlist (for age scoring)
    # specific_position is already in fused via the merge above

    # ── Aggregate ─────────────────────────────────────────────────────────────
    print("\nAggregating per country...")
    rows = []
    for country, squad in fused.groupby('country'):
        rows.append(aggregate_country(country, squad, burnout_map, injured_set, elite_players))

    metrics = pd.DataFrame(rows)

    # ── Merge managers + elo ──────────────────────────────────────────────────
    metrics = metrics.merge(managers[['country','manager','tenure_days','has_elite_pedigree']], on='country', how='left')
    metrics = metrics.merge(elo[['country','group','full_elo','hot_elo','elo_volatility']], on='country', how='left')
    metrics = metrics.sort_values('full_elo', ascending=False).reset_index(drop=True)
    metrics['squad_rank'] = metrics.index + 1

    out_path = out_dir / 'team_squad_metrics.csv'
    metrics.to_csv(out_path, index=False)
    print(f"\n✅ Saved squad metrics for {len(metrics)} teams → {out_path}")

    # ── Spot-checks ───────────────────────────────────────────────────────────
    pd.set_option('display.max_columns', None)

    print("\n── Top 15 by Elo with key features ──")
    cols = ['country','group','full_elo','hot_elo','total_squad_value',
            'age_peak_score','n_past_prime','n_youth_u24',
            'star_reliance_gini','haaland_flag','pct_elite_league',
            'avg_caps','max_club_players','total_club_minutes','depth_overall']
    print(metrics[cols].head(15).to_string(index=False))

    print("\n── Age Peak Score ranking (higher = better age profile) ──")
    print(metrics[['country','age_peak_score','n_past_prime','n_youth_u24','avg_age']]
          .sort_values('age_peak_score', ascending=False).to_string(index=False))

    print("\n── Replacement Depth ranking ──")
    depth_cols = ['country','depth_overall','depth_gk','depth_def','depth_mid','depth_att']
    print(metrics[depth_cols].sort_values('depth_overall', ascending=False).head(20).to_string(index=False))

    print("\n── Haaland Index — star-reliant squads ──")
    print(metrics[metrics['haaland_flag']==1][
        ['country','star_reliance_gini','star_player_value','total_squad_value']
    ].sort_values('star_reliance_gini', ascending=False).to_string(index=False))


if __name__ == '__main__':
    main()
