# WC2026 Project Handoff

Transitioning from Gemini to Claude. Full architecture from Gemini conversations + codebase.

---

## Project Goal

Build a **State-of-the-Art Football Analytics Engine** for the 2026 FIFA World Cup (48 teams, Groups A–L):
- Simulate the tournament group stage → knockout rounds via Monte Carlo
- Predict win probabilities for any matchup using XGBoost
- Surface everything in a Streamlit "Football Manager" UI

---

## Phase 1: Data Ingestion ✅ COMPLETE

| Source | File | Contents |
|---|---|---|
| Kaggle (Transfermarkt) | `raw_kaggle/results.csv` | 100+ years of international match history |
| Kaggle (Transfermarkt) | `raw_kaggle/players.csv` | Financial data, positions, caps |
| Kaggle (Transfermarkt) | `raw_kaggle/appearances.csv` | Club minutes played (for burnout metric) |
| FBref (soccerdata) | `raw_scraped/fbref_global_stats.csv` | Per-90 tactical stats, 10 leagues, 2025/26 season |
| Wikipedia | `raw_scraped/manager_tenures.csv` | National team managers + appointment dates |
| Transfermarkt | `raw_scraped/wc_injured_players.csv` | Players missing WC due to injury (return > Jul 19 2026) |
| Wikipedia | `raw_scraped/wc2026_official_squads.csv` | **NEW** — Official 26-man squads for all 48 teams |

---

## Phase 2: ETL & Fusion Pipeline ✅ COMPLETE

| Script | Output | Key Technique |
|---|---|---|
| `clean_results.py` | `cleaned/cleaned_results.csv` (~49k matches) | Tournament weighting: WC=60, continental=50, qualifiers/NL=30, friendly=10 |
| `clean_manager.py` | `cleaned/cleaned_wc_managers.csv` | tenure_days + has_elite_pedigree binary flag |
| `clean_players.py` | `cleaned/squad_strength.csv` | Top-26-by-value aggregate per country (now superseded by official squads) |
| `players_database.py` | `cleaned/players_masterlist.csv` (~18k players) | DuckDB joins + RapidFuzz entity resolution (TM ↔ FBref) + KNN imputation |

### players_masterlist.csv schema (the feature matrix)
```
player_id, player_name, country, wc_group, club_team, age, general_position,
specific_position, market_value, international_caps, international_goals,
goals_per_90, assists_per_90, interceptions, tackles_won, crosses
```
The tactical stats (goals_per_90 … crosses) feed the K-Means clusterer.
Market value + caps feed the XGBoost predictor.

### wc2026_official_squads.csv schema (NEW — actual selections)
```
country, shirt_no, position, player_name, dob, caps, goals, club, age_at_wc, general_position
```
Scraped from Wikipedia. 1,248 players, 26 per team, zero nulls. Replaces the top-26-by-value proxy.

---

## Phase 3: Advanced Feature Engineering ✅ COMPLETE

### A. `build_elo.py` ✅ COMPLETE
538-style Elo engine with:
- Margin of Victory multiplier
- Home advantage (zeroed on neutral ground)
- Predecessor team inheritance (USSR→Russia, Yugoslavia→Serbia/Croatia, etc.)
- Exponential `hot_elo` decay (365-day half-life)
- Mean reversion for long inactivity

Outputs:
- `data/engineered/elo_history.csv` — 98k rows of full match-by-match Elo history
- `data/engineered/team_elo_current.csv` — 48 teams as of June 2026

Top teams: Argentina 2015.8, Spain 2011.8, France 1963.8

### B. `squad_metrics.py` ✅ COMPLETE
Fuzzy entity resolution (Transfermarkt ↔ FBref) with 3-pass matching: exact → reversed tokens (Korean names) → WRatio ≥ 85. Match rate 96.4%.

Features per team (34 columns total):
- `total_squad_value`, `star_reliance_gini`, `avg_age`
- `age_peak_score` — asymmetric: no penalty for youth/prime, −0.225/yr past prime, −0.30/yr way past prime
- Position-specific prime thresholds: GK 36, CB/DM/CM 33, FB/AM/Winger/FW 31
- `pct_elite_league`, `avg_caps`, `burnout` (total club minutes)
- `club_linkage` (max_club_players, top_club)
- `depth_gk/def/mid/att`
- Manager features: `tenure_days`, `has_elite_pedigree`
- `full_elo`, `hot_elo`
- Formation selection: best of {4-3-3, 4-4-2, 4-2-3-1, 5-3-2} maximising starting XI market value

Output: `data/engineered/team_squad_metrics.csv` — 48 teams, 34 columns

### C. `tactical_clusters.py` ✅ COMPLETE (v2 two-step position-first approach)
FM26-inspired taxonomy: split players by `specific_position` into 8 groups, then K-Means within each group using role-relevant features.

20 roles total:
- GK → Goalkeeper
- CB (k=3) → Ball-Playing CB / Stopper CB / Traditional CB
- FB (k=3) → Attacking Wing-Back / Full-Back / Holding Full-Back
- DM (k=2) → Deep-Lying Playmaker / Box-to-Box DM
- CM (k=3) → Midfield Playmaker / Box-to-Box / Pressing CM
- AM (k=2) → Advanced Playmaker / Attacking Midfielder
- WG (k=3) → Inside Forward / Traditional Winger / Wide Playmaker
- FW (k=3) → Poacher / False Nine / Target Forward
- Special: Data-Limited (all-zero FBref stats, mostly K-League players)

Implementation details:
- Fit on WC-only outfield players, predict on all 16,719 deduplicated masterlist players
- Winsorize at p99 per group before fitting; RobustScaler
- Versatility score = 1/(centroid_gap+1)

Outputs:
- `data/engineered/players_with_clusters.csv`
- `data/engineered/team_archetype_balance.csv`
- `data/engineered/cluster_model.pkl`

### Key fixes made during Phase 3
- Bosnia and Herzegovina, Ivory Coast, Curaçao were missing from masterlist — fixed country name mappings in `players_database.py` and `clean_players.py`
- Changed `position` to `sub_position` in SQL to get specific positions (Centre-Back vs Left-Back)
- Korean name ordering fix (family-first on Wikipedia, given-first on Transfermarkt) — token reversal in fuzzy matching
- Hot Elo hard-reset replaced with exponential decay
- Data-Limited archetype for players with zero FBref stats
- Masterlist deduplicated (19,191 → 16,719 unique players) before clustering

---

## Phase 4: Machine Learning Predictor 🔜 NEXT

`train_model.py` — XGBoost gradient-boosted classifier
- **Training data**: historical World Cup matches (2014, 2018, 2022) with retroactive Elo + squad metrics reconstructed at match date
- **Inputs per matchup**: Elo difference, squad value difference, manager rating, tactical balance, burnout, club linkage, avg caps
- **Output**: P(Team A win), P(Draw), P(Team B win)

---

## Phase 5: Streamlit UI 🔜 TO DO (use UIUX Pro Max github skill, and 21st.dev)

`app.py` — "Football Manager" dashboard, Joga Bonito vibes, have some worlc up 2026 atnmosphere
- **Simulator**: user picks matchup → model returns win probabilities
- **Roster viewer**: show players with positions, values, cluster archetypes

---

## File Structure

```
WC2026/
├── data/
│   ├── raw_kaggle/          # Transfermarkt Kaggle dump (static)
│   ├── raw_scraped/         # FBref, manager, injury, official squads
│   ├── cleaned/             # Final cleaned CSVs → model inputs
│   ├── scraping_process/    # All scraping scripts
│   └── cleaning_process/    # All ETL scripts
├── handoff.md               # This file
└── .venv/                   # Python 3.12
```

### Installed deps (relevant)
`duckdb`, `rapidfuzz`, `soccerdata`, `scikit-learn`, `pandas`, `numpy`, `requests`, `beautifulsoup4`, `seleniumbase`

---

## Key Gotchas

- **Country name normalisation** — `country_mapping` dict must stay consistent across all scripts. Current canonical names: `Türkiye`, `Czech Republic`, `United States`, `South Korea`, `Iran`, `DR Congo`, `Cape Verde`
- **Saudi League** — not on FBref via soccerdata; Saudi players have KNN-imputed tactical stats
- **elite_managers list** in `clean_manager.py` is hardcoded — **Carlo Ancelotti (Brazil)** needs to be added; audit others
- **Injury scrape** may silently return empty if Transfermarkt blocks (no auth header check)
- **KNN imputation** runs only on outfield players; GKs get fillna(0) for tactical cols
- **Official squads** (`wc2026_official_squads.csv`) now make `squad_strength.csv` largely obsolete — Phase 3 should filter masterlist to actual selected players only
