# WC2026 Project Handoff

Last updated: **June 22, 2026**

---

## Project Goal

Build a **State-of-the-Art Football Analytics Engine** for the 2026 FIFA World Cup (48 teams, Groups A–L):
- Simulate the tournament group stage → knockout rounds via Monte Carlo
- Predict win probabilities for any matchup using XGBoost + squad quality nudge
- Surface everything in a Next.js "Football Manager" UI

**Live:** [kevinknowsball.vercel.app](https://kevinknowsball.vercel.app) · API: [kevinknowsball.onrender.com](https://kevinknowsball.onrender.com)

---

## Phase 1: Data Ingestion ✅ COMPLETE

| Source | File | Contents |
|---|---|---|
| Kaggle (Transfermarkt) | `raw_kaggle/results.csv` | 100+ years of international match history (to Jun 27 2026) |
| Kaggle (Transfermarkt) | `raw_kaggle/players.csv` | Financial data, positions, caps |
| Kaggle (Transfermarkt) | `raw_kaggle/appearances.csv` | Club minutes played (to May 24 2026 — covers full domestic season) |
| FBref (soccerdata) | `raw_scraped/fbref_global_stats.csv` | Per-90 tactical stats, 10 leagues, 2025/26 season |
| Wikipedia | `raw_scraped/manager_tenures.csv` | National team managers + appointment dates |
| Transfermarkt | `raw_scraped/wc_injured_players.csv` | Players missing WC due to injury (return > Jul 19 2026) |
| Wikipedia | `raw_scraped/wc2026_official_squads.csv` | Official 26-man squads for all 48 teams (scraped Jun 20 2026) |

---

## Phase 2: ETL & Fusion Pipeline ✅ COMPLETE

| Script | Output | Key Technique |
|---|---|---|
| `clean_results.py` | `cleaned/cleaned_results.csv` (~49k matches) | Tournament weighting: WC=60, continental=50, qualifiers/NL=30, friendly=10 |
| `clean_manager.py` | `cleaned/cleaned_wc_managers.csv` | tenure_days + has_elite_pedigree binary flag (14 managers) |
| `players_database.py` | `cleaned/players_masterlist.csv` (17,358 players) | DuckDB joins + RapidFuzz entity resolution (TM ↔ FBref) + KNN imputation |

### players_masterlist.csv schema
```
player_id, player_name, country, wc_group, club_team, age, general_position,
specific_position, market_value, international_caps, international_goals,
goals_per_90, assists_per_90, interceptions, tackles_won, crosses
```

### players_database.py — key fixes applied
- **FBref name collision dedup**: FBref has multiple players with same name (e.g. "Rodri" at Man City and "Rodri" at Moreirense). Fixed by deduplicating FBref on `norm_name` before JOIN, then deduplicating final result by `player_id`. Result: 17,358 unique players, 0 duplicates (was 19,191 with duplicates).

### elite_pedigree managers (clean_manager.py)
Currently flagged as elite (has_elite_pedigree=1):
Scaloni, Deschamps, Ancelotti, Tuchel, R. Martínez, Nagelsmann, Marsch, Lopetegui, Pochettino, G. Potter, R. Garcia, De la Fuente, Bielsa, Rangnick

**Removed from list**: Javier Aguirre (Mexico), Ronald Koeman (Netherlands) — Jun 22 2026

---

## Phase 3: Advanced Feature Engineering ✅ COMPLETE

### A. `build_elo.py` ✅ COMPLETE

538-style Elo engine:
- Margin of Victory multiplier (538-style autocorrelation correction)
- Home advantage (zeroed on neutral ground — all WC games neutral)
- Predecessor team inheritance (USSR→Russia, Yugoslavia→Serbia/Croatia, etc.)
- Exponential `hot_elo` decay (365-day half-life, replaced hard 24-month reset)
- Confederation-anchored mean reversion (UEFA 1680, CONMEBOL 1700, CAF 1620, etc.)

**Bug fixed (Jun 22 2026):** Mean reversion was unbounded — South Africa's apartheid-era inactivity gap (~22yr) caused `factor > 1`, overshooting the anchor and producing `full_elo = -787`. Fixed by clamping `factor = min(1.0, reversion_rate * years_inactive)`. South Africa now correctly at 1686.

**Manual calibration overrides** (applied after ELO computation):

| Team | Adjustment | Reason |
|---|---|---|
| Mexico | −40 | CONCACAF weak-pool inflation |
| Australia | −30 | AFC weak-pool inflation |
| Iran | −30 | AFC weak-pool inflation |
| Morocco | +40 | WC2022 SF run suppressed by CAF pool |
| Senegal | +30 | AFCON winners, CAF pool suppression |

Outputs:
- `data/engineered/elo_history.csv` — full match-by-match Elo history
- `data/engineered/team_elo_current.csv` — 48 teams as of June 2026

Current top 5: Argentina 2086, Spain 2068, France 2047, England 2012, Brazil 2004

### B. `squad_metrics.py` ✅ COMPLETE

Fuzzy entity resolution (official squads ↔ masterlist) with **6-pass position+country-scoped matching**:

1. Exact match, same country + same position
2. Exact match, same country (any position)
3. Reversed tokens, same country + same position (Korean/East Asian names)
4. Reversed tokens, same country (any position)
5. Fuzzy WRatio ≥ 85, same country (position bucket first, then any)
6. Fuzzy WRatio ≥ 85, globally (fallback for countries absent from masterlist)

**Key guards:**
- `_pos_ok()`: rejects GK↔outfield swaps at every fuzzy pass — prevents e.g. GK matching to a striker with a similar name
- Caps-gap rejection: if caps gap > 40 AND name similarity < 50%, reject (wrong person)
- Within each position bucket, highest `international_caps` breaks ties

**Match rate: 93.7%** (1,171/1,250 players). 79 genuinely unmatched (Iran transliteration, Cape Verde single-names, Haiti, DR Congo) get safe defaults.

**Previous issues fixed (Jun 22 2026):**
- Emiliano Martínez (ARG GK) was matching to Uruguay MID → now correct (GK, 59 caps, Aston Villa)
- Mohamed Alaa (EGY GK) was matching to Mohamed Salah (ATT) → now correct (GK)
- Panama/Morocco/Haiti/Algeria GKs were matching to outfield players → all fixed
- 83 critical wrong matches reduced to 0 GK position mismatches

**Club data source**: `club` column comes from `wc2026_official_squads.csv` (scraped Jun 2026, authoritative). Masterlist `club_team` from Transfermarkt is stale and NOT used for club linkage.

18 squad_adv features and weights (sum = 1.00):

| Feature | Weight | Notes |
|---|---|---|
| `first_xi_value` | 0.17 | Best starting XI market value |
| `pct_elite_league` | 0.16 | % players in Big 5 leagues |
| `avg_caps` | 0.09 | International experience |
| `total_squad_value` | 0.08 | Full squad depth |
| `has_elite_pedigree` | 0.07 | Manager elite pedigree flag |
| `age_peak_score` | 0.06 | Asymmetric age scoring |
| `star_player_value` | 0.05 | Top-3 players avg value |
| `club_linkage_score` | 0.05 | Chemistry: 3+ players same club |
| `star_reliance_gini` | 0.04 | High = star-reliant = fragile (sign: a−h) |
| `total_club_minutes` | 0.04 | Match sharpness / burnout |
| `tenure_days` | 0.04 | Manager continuity |
| `depth_def` | 0.03 | Defensive depth score |
| `depth_att` | 0.03 | Attacking depth score |
| `depth_mid` | 0.03 | Midfield depth score |
| `depth_gk` | 0.03 | GK depth score |
| `goals_per_player` | 0.01 | Attacking threat distribution |
| `tactical_entropy` | 0.01 | Role diversity (from archetypes) |
| `avg_versatility` | 0.01 | Player multi-role capability |

Output: `data/engineered/team_squad_metrics.csv` — 48 teams, 37 columns

### C. `tactical_clusters.py` ✅ COMPLETE

FM26-inspired two-step K-Means (position-first → role within position). 20 roles:

GK · Ball-Playing CB · Stopper CB · Traditional CB · Attacking Wing-Back · Full-Back · Holding Full-Back · Deep-Lying Playmaker · Box-to-Box DM · Midfield Playmaker · Box-to-Box · Pressing CM · Advanced Playmaker · Attacking Midfielder · Inside Forward · Traditional Winger · Wide Playmaker · Poacher · False Nine · Target Forward · Data-Limited

Outputs:
- `data/engineered/players_with_clusters.csv`
- `data/engineered/team_archetype_balance.csv` (includes `tactical_entropy`, `avg_versatility`)
- `data/engineered/cluster_model.pkl`

---

## Phase 4: Machine Learning Predictor ✅ COMPLETE

`data/feature_engineering/train_model.py`

- **Algorithm**: XGBoost (via scikit-learn HistGradientBoosting)
- **Training data**: 49,214 international matches, time-decay weighted (4-year half-life)
- **Training features**: `elo_diff`, `hot_elo_diff`, `tournament_weight` — ELO only, intentionally
- **Squad metrics used at inference only** via `squad_adv` nudge (`nudge = 0.22 * squad_adv`), not during training — squad data doesn't exist for historical matches
- **Outputs**: λ_home, λ_away (Poisson rates) + W/D/L classifier probabilities
- **Dixon-Coles ρ** calibrated from WC data

Output: `data/engineered/xgb_model.pkl`

---

## Phase 5: Predictions Cache ✅ COMPLETE

`data/engineered/predictions_cache.json` — 2,256 entries (48 × 47 permutations)

Pre-computes every possible matchup. Cache must be regenerated after any change to:
- `team_squad_metrics.csv` (squad_metrics.py)
- `team_archetype_balance.csv` (tactical_clusters.py)
- `team_elo_current.csv` (build_elo.py)
- `xgb_model.pkl` (train_model.py)

---

## Backend ✅ COMPLETE

`backend/simulate.py` — core prediction engine:
- **Neutral ground symmetrization**: averages `predict(A,B)` and `predict(B,A)` to cancel classifier home-team bias for all non-host WC matches
- **Host nation boost**: USA, Canada, Mexico get ±0.025 crowd advantage
- Cache-first with live fallback on miss

`backend/main.py` — FastAPI endpoints:
- `GET /health` · `GET /teams` · `POST /predict` · `POST /simulate/match` · `GET /simulate/bracket` · `GET /monte-carlo`

**Deployed**: https://kevinknowsball.onrender.com

---

## Frontend ✅ COMPLETE

Next.js 14 — Vercel

Components: SplineHero · TournamentBracket · TournamentOdds · MatchPredictor · TeamExplorer · Navbar

---

## Rebuild Order (after any data change)

```
1. players_database.py        → cleaned/players_masterlist.csv
2. clean_manager.py           → cleaned/cleaned_wc_managers.csv
3. build_elo.py               → engineered/team_elo_current.csv + elo_history.csv
4. squad_metrics.py           → engineered/team_squad_metrics.csv
5. tactical_clusters.py       → engineered/team_archetype_balance.csv + cluster_model.pkl
6. [retrain if ELO history changed] train_model.py → engineered/xgb_model.pkl
7. regen cache                → engineered/predictions_cache.json
```

---

## Key Gotchas

- **Country name normalisation**: canonical names are `Türkiye`, `Czech Republic`, `United States`, `South Korea`, `Iran`, `DR Congo`, `Cape Verde`, `Bosnia and Herzegovina`, `Ivory Coast`, `Curaçao`
- **Club linkage uses squad CSV clubs**, not masterlist `club_team` (Transfermarkt data is stale)
- **`tactical_entropy` and `avg_versatility`** live in `team_archetype_balance.csv`, not `team_squad_metrics.csv` — joined at inference in `get_team_features()`
- **Mean reversion clamp**: `factor = min(1.0, ...)` — do not remove, prevents negative ELO for teams with long historical inactivity
- **Saudi League** not on FBref — Saudi players have KNN-imputed tactical stats
- **Injury scrape** may silently return empty if Transfermarkt blocks
- **elite_managers list** in `clean_manager.py` is hardcoded — review before each tournament

---

## File Structure

```
WC2026/
├── data/
│   ├── raw_kaggle/           # Transfermarkt Kaggle dump (archive-4 = latest, May 2026)
│   ├── raw_scraped/          # FBref, manager, injury, official squads
│   ├── cleaned/              # Cleaned CSVs → model inputs
│   ├── engineered/           # Model outputs (elo, squad metrics, clusters, pkl, cache)
│   ├── scraping_process/     # Scraping scripts
│   ├── cleaning_process/     # ETL scripts
│   └── feature_engineering/  # build_elo.py, squad_metrics.py, tactical_clusters.py, train_model.py
├── backend/
│   ├── main.py               # FastAPI app
│   └── simulate.py           # Prediction engine + neutral symmetrization
├── README.md
├── handoff.md                # This file
└── .venv/                    # Python 3.12
```
