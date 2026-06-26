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

def best_formation(squad: pd.DataFrame) -> tuple[str, dict, float]:
    """
    Selects the formation (from 4-3-3 / 4-4-2 / 4-2-3-1 / 5-3-2) that maximises
    the total market value of the starting XI.
    Returns (formation_name, starter_counts_dict, first_xi_value).
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
    # Fallback: top-11 by value when no formation is feasible
    if best_name is None:
        best_val = float(squad['market_value'].fillna(0).nlargest(11).sum())
    return best_name, best_slots, float(best_val)


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
    formation, slots, _ = best_formation(squad)
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
    Six-pass matching strategy, position+country-scoped first to prevent GK↔outfield swaps:
      Pass 1: exact match, same country, same position
      Pass 2: exact match, same country (any position)
      Pass 3: reversed tokens, same country, same position
      Pass 4: reversed tokens, same country
      Pass 5: fuzzy WRatio >= FUZZY_THRESHOLD, same country (position bucket first, then any)
      Pass 6: fuzzy WRatio >= FUZZY_THRESHOLD globally (fallback for missing countries)

    Position-scoping prevents common-name collisions where e.g. GK "Mohamed Alaa" would
    otherwise fuzzy-match "Mohamed Salah" (ATT) within Egypt's roster.
    Within each position bucket, highest international_caps breaks ties.
    """
    master = master.copy()
    master['norm'] = master['player_name'].apply(strip_accents)
    squads = squads.copy()
    squads['norm'] = squads['player_name'].apply(strip_accents)

    # Normalise squad position to masterlist general_position codes
    POS_MAP = {'GK': 'GK', 'GKP': 'GK', 'DEF': 'DEF', 'MID': 'MID',
               'ATT': 'ATT', 'FWD': 'ATT', 'FW': 'ATT', 'MF': 'MID', 'DF': 'DEF'}

    def reverse_tokens(s: str) -> str:
        parts = s.split()
        return ' '.join(parts[1:] + parts[:1]) if len(parts) >= 2 else s

    from collections import defaultdict

    # Build country+pos lookup: (country, pos) → {norm_name → master_idx}
    # and country-only lookup: country → {norm_name → master_idx}
    # Ties broken by highest international_caps.
    def _upsert(lookup, key, nm, idx, caps):
        if nm not in lookup[key]:
            lookup[key][nm] = idx
        else:
            existing_caps = master.loc[lookup[key][nm], 'international_caps']
            if pd.notna(caps) and caps > (existing_caps or 0):
                lookup[key][nm] = idx

    country_pos_lookup: dict[tuple, dict[str, int]] = defaultdict(dict)
    country_lookup:     dict[str,   dict[str, int]] = defaultdict(dict)

    for idx, mrow in master.iterrows():
        c   = mrow['country']
        nm  = mrow['norm']
        pos = mrow.get('general_position', '')
        caps = mrow['international_caps']
        _upsert(country_pos_lookup, (c, pos), nm, idx, caps)
        _upsert(country_lookup, c, nm, idx, caps)

    # Global fallback: highest-caps player wins when multiple share a name
    global_lookup = {}
    for idx, mrow in master.sort_values('international_caps', ascending=False).iterrows():
        nm = mrow['norm']
        if nm not in global_lookup:
            global_lookup[nm] = idx
    global_norms = list(global_lookup.keys())

    def _fuzzy_best(nm, nm_r, norm_pool, lookup):
        r1 = process.extractOne(nm,   norm_pool, scorer=fuzz.WRatio)
        r2 = process.extractOne(nm_r, norm_pool, scorer=fuzz.WRatio)
        best = max([r for r in [r1, r2] if r], key=lambda x: x[1], default=None)
        if best and best[1] >= FUZZY_THRESHOLD:
            return lookup[best[0]]
        return None

    def _pos_ok(mid: int, sq_pos: str) -> bool:
        """Reject GK↔outfield swaps. ATT/MID/DEF mismatches are tolerated (label differences)."""
        if mid is None:
            return False
        ml_pos = master.loc[mid, 'general_position']
        if sq_pos == 'GK' and ml_pos != 'GK':
            return False
        if sq_pos != 'GK' and ml_pos == 'GK':
            return False
        return True

    matches = []
    for _, row in squads.iterrows():
        country  = row['country']
        nm       = row['norm']
        nm_r     = reverse_tokens(nm)
        sq_pos   = POS_MAP.get(str(row.get('position', '')).upper(), '')
        cp_key   = (country, sq_pos)

        cp_lookup = country_pos_lookup.get(cp_key, {})
        c_lookup  = country_lookup.get(country, {})
        cp_norms  = list(cp_lookup.keys())
        c_norms   = list(c_lookup.keys())

        mid = None

        # Pass 1: exact, same country+pos
        if nm in cp_lookup:
            mid = cp_lookup[nm]
        # Pass 2: exact, same country any pos (with GK guard)
        elif nm in c_lookup:
            candidate = c_lookup[nm]
            mid = candidate if _pos_ok(candidate, sq_pos) or sq_pos not in ('GK',) else None
            if mid is None and nm in c_lookup:
                mid = c_lookup[nm]  # accept anyway for non-GK — outfield label diffs are fine
        # Pass 3: reversed, same country+pos
        elif nm_r in cp_lookup:
            mid = cp_lookup[nm_r]
        # Pass 4: reversed, same country any pos
        elif nm_r in c_lookup:
            candidate = c_lookup[nm_r]
            mid = candidate if _pos_ok(candidate, sq_pos) or sq_pos not in ('GK',) else None
            if mid is None:
                mid = c_lookup[nm_r]
        # Pass 5a: fuzzy within same country+pos (position bucket first)
        elif cp_norms:
            mid = _fuzzy_best(nm, nm_r, cp_norms, cp_lookup)
            if mid is None and c_norms:
                candidate = _fuzzy_best(nm, nm_r, c_norms, c_lookup)
                # Reject GK↔outfield swaps from cross-position fuzzy
                mid = candidate if (candidate is None or _pos_ok(candidate, sq_pos)) else None
            if mid is None:
                candidate = _fuzzy_best(nm, nm_r, global_norms, global_lookup)
                mid = candidate if (candidate is None or _pos_ok(candidate, sq_pos)) else None
        # Pass 5b: fuzzy within same country (no position bucket available)
        elif c_norms:
            candidate = _fuzzy_best(nm, nm_r, c_norms, c_lookup)
            mid = candidate if (candidate is None or _pos_ok(candidate, sq_pos)) else None
            if mid is None:
                candidate = _fuzzy_best(nm, nm_r, global_norms, global_lookup)
                mid = candidate if (candidate is None or _pos_ok(candidate, sq_pos)) else None
        # Pass 6: fuzzy global fallback (country absent from masterlist)
        else:
            candidate = _fuzzy_best(nm, nm_r, global_norms, global_lookup)
            mid = candidate if (candidate is None or _pos_ok(candidate, sq_pos)) else None

        # Reject matches where caps gap > 40 AND name similarity < 50% — wrong person
        # Squad caps = 0 means unknown, so skip the check in that case.
        if mid is not None:
            sq_caps = row.get('caps', None)
            ml_caps = master.loc[mid, 'international_caps']
            if (pd.notna(sq_caps) and float(sq_caps) > 5
                    and pd.notna(ml_caps)
                    and abs(float(sq_caps) - float(ml_caps)) > 40):
                sq_n = nm.replace(' ', '')
                ml_n = strip_accents(master.loc[mid, 'player_name']).replace(' ', '')
                import rapidfuzz.distance as _rfd
                ratio = 1 - _rfd.Levenshtein.distance(sq_n, ml_n) / max(len(sq_n), len(ml_n), 1)
                if ratio < 0.5:
                    mid = None  # caps + name both wrong → better to have no match

        matches.append({'player_name': row['player_name'], 'master_idx': mid})

    # Align by row position, not player_name — avoids cross-join when same name
    # appears for two countries (e.g. Emiliano Martínez in ARG and URU).
    match_df = pd.DataFrame(matches).reset_index(drop=True)
    merged = squads.reset_index(drop=True).join(match_df[['master_idx']])
    # NOTE: we deliberately do NOT pull club_team from the masterlist — it comes
    # from stale Kaggle/Transfermarkt data (e.g. Haaland→Feyenoord, Kane→Leicester).
    # The 'club' column from wc2026_official_squads.csv (scraped Jun 2026) is the
    # authoritative, up-to-date source for club linkage.
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
    # Exclude null / unknown clubs so unmatched players don't get grouped under
    # the same blank label and produce a fake chemistry bonus.
    _UNKNOWN_CLUBS = {'unknown', 'n/a', 'none', ''}
    valid_clubs      = squad['club'].dropna()
    valid_clubs      = valid_clubs[~valid_clubs.str.lower().isin(_UNKNOWN_CLUBS)]
    club_counts      = valid_clubs.value_counts() if len(valid_clubs) else pd.Series(dtype=int)
    max_club_players = int(club_counts.iloc[0]) if len(club_counts) else 1
    top_club         = club_counts.index[0]  if len(club_counts) else 'Unknown'
    # Normalise by full squad size (not just valid_clubs) — keeps score honest
    # for teams where some club data is missing.
    club_linkage_score = round(max(0, max_club_players - 2) / max(len(squad), 1), 3)

    # ── First XI value ────────────────────────────────────────────────────────
    _, _, first_xi_value = best_formation(squad)
    first_xi_value = round(first_xi_value, 0)

    # ── Goal-scoring pedigree ─────────────────────────────────────────────────
    goals_per_player = round(total_goals / max(len(squad), 1), 2)

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
        'max_club_players':    max_club_players,
        'top_club':            top_club,
        'club_linkage_score':  club_linkage_score,
        # First XI & goals
        'first_xi_value':      first_xi_value,
        'goals_per_player':    goals_per_player,
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

    # ── Also save a player-level WC squad file for the /players endpoint ─────
    # Use official squad data for caps/goals/club (more accurate than masterlist).
    # role/versatility added downstream by tactical_clusters.py via player_id join.
    group_map = elo.set_index('country')['group'].to_dict()
    wc_players = fused[[
        'player_name', 'country', 'player_id', 'club',
        'age_at_wc', 'general_position', 'specific_position',
        'market_value', 'caps', 'goals',
        'goals_per_90', 'assists_per_90', 'interceptions', 'tackles_won', 'crosses',
    ]].copy()
    wc_players = wc_players.rename(columns={
        'club':       'club_team',
        'age_at_wc':  'age',
        'caps':       'international_caps',
        'goals':      'international_goals',
    })
    wc_players['wc_group'] = wc_players['country'].map(group_map)
    wc_players['role']        = ''
    wc_players['versatility'] = 0.5
    wc_players.to_csv(out_dir / 'wc_squad_players.csv', index=False)
    print(f"✅ Saved {len(wc_players)} WC squad players → wc_squad_players.csv")

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
