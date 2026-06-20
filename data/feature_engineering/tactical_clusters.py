"""
Tactical Cluster Engine v2 — Two-Step Position-First Clustering
FM26-inspired role taxonomy detected from FBref per-90 stats.

Step 1: Split players by specific_position into 8 groups.
Step 2: K-Means within each group using role-relevant features.

Roles per group:
  GK  → Goalkeeper (no clustering — no GK-specific stats available)
  CB  → Ball-Playing CB / Stopper CB / Traditional CB
  FB  → Attacking Wing-Back / Traditional Full-Back / Holding Full-Back
  DM  → Deep-Lying Playmaker / Screening DM
  CM  → Midfield Playmaker / Box-to-Box / Pressing CM
  AM  → Shadow Striker / Advanced Playmaker
  WG  → Inside Forward / Traditional Winger / Wide Playmaker
  FW  → Poacher / False Nine / Target Forward

⚠️  Centroid-based auto-labeling: on retrain, verify printed centroids still
    align with the expected feature rankings (e.g. Ball-Playing CB = highest assists).
"""

import pickle
import numpy as np
import pandas as pd
from pathlib import Path
from sklearn.cluster import KMeans
from sklearn.preprocessing import RobustScaler

# ── Position group config ─────────────────────────────────────────────────────
# features: which FBref cols to cluster on (order affects nothing, RobustScaler normalises)
# k: number of clusters
# auto_label: priority-ordered list of (feature_to_rank_by, label).
#   The cluster with the HIGHEST centroid value for that feature gets the label.
#   Last entry uses feature=None → catches the remainder.
#   ⚠️  If two entries compete for the same feature, the first one wins.

GROUPS = {
    'GK': {
        'positions':  ['Goalkeeper'],
        'features':   None,   # no clustering
        'k':          0,
        'auto_label': [(None, 'Goalkeeper')],
    },
    'CB': {
        'positions':  ['Centre-Back'],
        'features':   ['interceptions', 'tackles_won', 'assists_per_90', 'crosses'],
        'k':          3,
        # Ball-Playing CB: highest assists (progressive passing from deep)
        # Stopper CB: highest interceptions (aggressive, steps out to challenge)
        # Traditional CB: positional, stays deep
        'auto_label': [
            ('assists_per_90', 'Ball-Playing CB'),
            ('interceptions',  'Stopper CB'),
            (None,             'Traditional CB'),
        ],
    },
    'FB': {
        'positions':  ['Left-Back', 'Right-Back'],
        'features':   ['crosses', 'assists_per_90', 'interceptions', 'tackles_won'],
        'k':          3,
        # Attacking Wing-Back: highest crosses (overlapping runners)
        # Full-Back: balanced attack/defence — the catch-all
        # Holding Full-Back: highest interceptions, low crosses (stays deep)
        'auto_label': [
            ('crosses',       'Attacking Wing-Back'),
            ('interceptions', 'Holding Full-Back'),
            (None,            'Full-Back'),
        ],
    },
    'DM': {
        'positions':  ['Defensive Midfield'],
        'features':   ['interceptions', 'tackles_won', 'assists_per_90', 'goals_per_90'],
        'k':          2,
        # Deep-Lying Playmaker: higher assists (Vitinha/Rodri — creative pivot)
        # Box-to-Box DM: higher tackles (Caicedo — energetic destroyer)
        'auto_label': [
            ('assists_per_90', 'Deep-Lying Playmaker'),
            (None,             'Box-to-Box DM'),
        ],
    },
    'CM': {
        'positions':  ['Central Midfield', 'Left Midfield', 'Right Midfield'],
        'features':   ['goals_per_90', 'assists_per_90', 'interceptions', 'tackles_won', 'crosses'],
        'k':          3,
        # Midfield Playmaker: highest assists + crosses (dictates tempo)
        # Box-to-Box: balanced output and defensive work
        # Pressing CM: highest tackles (front-foot hunter)
        'auto_label': [
            ('assists_per_90', 'Midfield Playmaker'),
            ('tackles_won',    'Box-to-Box'),
            (None,             'Pressing CM'),
        ],
    },
    'AM': {
        'positions':  ['Attacking Midfield'],
        'features':   ['goals_per_90', 'assists_per_90', 'crosses', 'tackles_won'],
        'k':          2,
        # Advanced Playmaker: highest assists+crosses (classic 10 — Bellingham, Musiala)
        # Attacking Midfielder: goal-leaning AM, sits between 10 and striker
        'auto_label': [
            ('assists_per_90', 'Advanced Playmaker'),
            (None,             'Attacking Midfielder'),
        ],
    },
    'WG': {
        'positions':  ['Left Winger', 'Right Winger'],
        'features':   ['goals_per_90', 'assists_per_90', 'crosses', 'tackles_won'],
        'k':          3,
        # Inside Forward: highest goals (cuts inside, shoots — Salah/Robben type)
        # Traditional Winger: highest crosses (wide deliverer)
        # Wide Playmaker: highest assists but not cross-heavy (link-up, creative)
        'auto_label': [
            ('goals_per_90',   'Inside Forward'),
            ('crosses',        'Traditional Winger'),
            (None,             'Wide Playmaker'),
        ],
    },
    'FW': {
        'positions':  ['Centre-Forward', 'Second Striker'],
        'features':   ['goals_per_90', 'assists_per_90', 'interceptions', 'tackles_won'],
        'k':          3,
        # Poacher: highest goals, stays in box (Haaland type)
        # False Nine: highest assists (drops deep, links play — Firmino type)
        # Target Forward: highest tackles/interceptions (presses, holds up — Giroud type)
        'auto_label': [
            ('goals_per_90',   'Poacher'),
            ('assists_per_90', 'False Nine'),
            (None,             'Target Forward'),
        ],
    },
}

ALL_ROLES = [
    'Goalkeeper',
    # CB
    'Ball-Playing CB', 'Stopper CB', 'Traditional CB',
    # FB
    'Attacking Wing-Back', 'Full-Back', 'Holding Full-Back',
    # DM
    'Deep-Lying Playmaker', 'Box-to-Box DM',
    # CM
    'Midfield Playmaker', 'Box-to-Box', 'Pressing CM',
    # AM
    'Advanced Playmaker', 'Attacking Midfielder',
    # WG
    'Inside Forward', 'Traditional Winger', 'Wide Playmaker',
    # FW
    'Poacher', 'False Nine', 'Target Forward',
    # special
    'Data-Limited',
]

FORMATIONS = {
    '4-3-3':   {'GK': 1, 'DEF': 4, 'MID': 3, 'ATT': 3},
    '4-4-2':   {'GK': 1, 'DEF': 4, 'MID': 4, 'ATT': 2},
    '4-2-3-1': {'GK': 1, 'DEF': 4, 'MID': 5, 'ATT': 1},
    '5-3-2':   {'GK': 1, 'DEF': 5, 'MID': 3, 'ATT': 2},
}


# ── Helpers ───────────────────────────────────────────────────────────────────

def auto_label(km, scaler, features, auto_label_spec):
    """
    Assign human-readable labels to cluster indices based on centroid feature ranks.
    Returns dict {cluster_idx: label_str}.
    """
    centers = scaler.inverse_transform(km.cluster_centers_)  # shape (k, n_features)
    center_df = pd.DataFrame(centers, columns=features)

    labels = {}
    available = set(range(len(center_df)))

    for feat, role in auto_label_spec:
        if feat is None:
            # catch-all: remaining cluster(s) get this label
            for idx in sorted(available):
                labels[idx] = role
            break
        if not available:
            break
        # pick cluster with highest centroid value for this feature among remaining
        best = center_df.loc[list(available), feat].idxmax()
        labels[best] = role
        available.discard(best)

    return labels


def fit_group(group_key, cfg, master, wc_names):
    """Fit scaler + KMeans for one position group. Returns (scaler, km, label_map, caps)."""
    features = cfg['features']
    k = cfg['k']

    pos_mask = master['specific_position'].isin(cfg['positions'])
    wc_mask  = master['player_name'].isin(wc_names)
    data     = master[pos_mask & wc_mask].copy()

    # Exclude all-zero rows from fitting
    valid_mask = ~(data[features] == 0).all(axis=1)
    data = data[valid_mask]

    if len(data) < k * 5:
        print(f"  ⚠️  {group_key}: only {len(data)} valid WC players — skipping cluster, using single label")
        return None, None, {0: cfg['auto_label'][-1][1]}, {}

    # Winsorize at p99
    caps = {}
    for c in features:
        cap = data[c].quantile(0.99)
        caps[c] = cap
        data[c] = data[c].clip(upper=cap)

    scaler = RobustScaler()
    X = scaler.fit_transform(data[features])

    km = KMeans(n_clusters=k, random_state=42, n_init=20)
    km.fit(X)

    label_map = auto_label(km, scaler, features, cfg['auto_label'])

    # Print centroids for verification
    centers = scaler.inverse_transform(km.cluster_centers_)
    print(f"\n  [{group_key}] n={len(data)}, k={k}")
    for i, c in enumerate(centers):
        n_in = (km.labels_ == i).sum()
        vals = ' '.join(f"{f.split('_')[0]}={c[j]:.2f}" for j, f in enumerate(features))
        print(f"    C{i} → '{label_map[i]}' (n={n_in}): {vals}")

    return scaler, km, label_map, caps


# ── Main assign ───────────────────────────────────────────────────────────────

def assign_all(master, models, wc_names):
    df = master.copy()
    df['role'] = 'Unknown'
    df['versatility'] = np.nan

    for group_key, cfg in GROUPS.items():
        scaler, km, label_map, caps = models[group_key]
        features = cfg['features']
        pos_mask = df['specific_position'].isin(cfg['positions'])

        if features is None or km is None:
            # GK or degenerate group — single label
            default_label = cfg['auto_label'][-1][1]
            df.loc[pos_mask, 'role'] = default_label
            df.loc[pos_mask, 'versatility'] = 0.0
            continue

        group_df = df[pos_mask].copy()
        for c in features:
            group_df[c] = group_df[c].clip(upper=caps.get(c, group_df[c].max()))

        # Flag data-limited
        zero_mask = (group_df[features] == 0).all(axis=1)
        df.loc[group_df[zero_mask].index, 'role'] = 'Data-Limited'
        df.loc[group_df[zero_mask].index, 'versatility'] = np.nan

        valid = group_df[~zero_mask].copy()
        if len(valid) == 0:
            continue

        X = scaler.transform(valid[features])
        preds = km.predict(X)
        df.loc[valid.index, 'role'] = [label_map[p] for p in preds]

        # Versatility: 1 / (gap between 1st and 2nd nearest centroid)
        dists = km.transform(X)
        dists_sorted = np.sort(dists, axis=1)
        gap = dists_sorted[:, 1] - dists_sorted[:, 0] + 1e-6
        df.loc[valid.index, 'versatility'] = np.round(1 / (gap + 1), 3)

    return df


# ── Team balance ──────────────────────────────────────────────────────────────

def team_archetype_balance(clustered, squads, squad_metrics):
    deduped = (clustered.sort_values('market_value', ascending=False)
                        .drop_duplicates('player_name'))
    name_to_role = dict(zip(deduped['player_name'], deduped['role']))
    name_to_mv   = dict(zip(deduped['player_name'], deduped['market_value']))
    name_to_vers = dict(zip(deduped['player_name'], deduped['versatility']))

    rows = []
    for country, squad_df in squads.groupby('country'):
        row = {'country': country}

        roles = [name_to_role.get(n, 'Unknown') for n in squad_df['player_name']]
        from collections import Counter
        counts = Counter(roles)

        for role in ALL_ROLES:
            col = role.lower().replace(' ', '_').replace('-', '_')
            row[f'squad_{col}'] = counts.get(role, 0)

        # Shannon entropy
        total = len(roles)
        probs = np.array([counts.get(r, 0) / total for r in ALL_ROLES])
        probs = probs[probs > 0]
        row['tactical_entropy'] = round(float(-np.sum(probs * np.log2(probs))), 3)

        # Avg versatility
        vers = [name_to_vers.get(n, 0) for n in squad_df['player_name']]
        vers_clean = [v for v in vers if not (isinstance(v, float) and np.isnan(v))]
        row['avg_versatility'] = round(float(np.mean(vers_clean)) if vers_clean else 0, 3)

        # Starting XI by formation
        formation_row = squad_metrics.loc[squad_metrics['country'] == country, 'formation']
        formation = formation_row.values[0] if len(formation_row) > 0 else '4-3-3'
        slots = FORMATIONS.get(formation, FORMATIONS['4-3-3'])
        row['formation'] = formation

        starters, used = [], set()
        for pos, n in slots.items():
            pos_players = squad_df[squad_df['general_position'] == pos].copy()
            pos_players['mv'] = pos_players['player_name'].map(name_to_mv).fillna(0)
            top_n = pos_players.nlargest(n, 'mv')['player_name'].tolist()
            starters.extend(top_n)
            used.update(top_n)

        xi_roles = [name_to_role.get(n, 'Unknown') for n in starters]
        xi_counts = Counter(xi_roles)
        for role in ALL_ROLES:
            col = role.lower().replace(' ', '_').replace('-', '_')
            row[f'xi_{col}'] = xi_counts.get(role, 0)

        rows.append(row)

    return pd.DataFrame(rows)


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    base    = Path(__file__).resolve().parent.parent
    out_dir = base / 'engineered'
    out_dir.mkdir(exist_ok=True)

    print("Loading inputs...")
    master        = pd.read_csv(base / 'cleaned'      / 'players_masterlist.csv')
    squads        = pd.read_csv(base / 'raw_scraped'  / 'wc2026_official_squads.csv')
    squad_metrics = pd.read_csv(out_dir               / 'team_squad_metrics.csv')

    # One row per player — keep highest market_value row (most informative position)
    master = (master.sort_values('market_value', ascending=False)
                    .drop_duplicates('player_name')
                    .reset_index(drop=True))

    wc_names = set(squads['player_name'])

    print("\nFitting position-specific cluster models on WC players...")
    models = {}
    for group_key, cfg in GROUPS.items():
        if cfg['features'] is None:
            models[group_key] = (None, None, {0: 'Goalkeeper'}, {})
        else:
            models[group_key] = fit_group(group_key, cfg, master, wc_names)

    # Save all models together
    with open(out_dir / 'cluster_model.pkl', 'wb') as f:
        pickle.dump({'models': models, 'groups': GROUPS, 'all_roles': ALL_ROLES}, f)
    print(f"\n  Model saved → engineered/cluster_model.pkl")

    print("\nAssigning roles to all masterlist players...")
    clustered = assign_all(master, models, wc_names)
    clustered.to_csv(out_dir / 'players_with_clusters.csv', index=False)
    print(f"  Saved {len(clustered)} players → players_with_clusters.csv")

    print("\nBuilding team archetype balance...")
    balance = team_archetype_balance(clustered, squads, squad_metrics)
    balance.to_csv(out_dir / 'team_archetype_balance.csv', index=False)
    print(f"  Saved {len(balance)} teams → team_archetype_balance.csv")

    # ── Spot-checks ───────────────────────────────────────────────────────────
    wc_clustered = clustered[clustered['player_name'].isin(wc_names)]
    print("\n── Role distribution across all WC squads ──")
    print(wc_clustered['role'].value_counts().to_string())

    print("\n── Sample players per role (top 3 by market value) ──")
    for role in ALL_ROLES:
        sample = (wc_clustered[wc_clustered['role'] == role]
                  .nlargest(3, 'market_value')[['player_name', 'specific_position', 'country', 'market_value']])
        if len(sample):
            print(f"\n  {role}:")
            print(sample.to_string(index=False))

    print("\n── Tactical entropy (most balanced → least) ──")
    print(balance[['country', 'formation', 'tactical_entropy', 'avg_versatility']]
          .sort_values('tactical_entropy', ascending=False).to_string(index=False))


if __name__ == '__main__':
    main()
