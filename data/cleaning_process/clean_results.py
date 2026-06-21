import pandas as pd
import numpy as np
from pathlib import Path

def clean_match_history():

    DATA_DIR = Path(__file__).resolve().parent.parent
    results_path = DATA_DIR / 'raw_kaggle' / 'results.csv'
    df = pd.read_csv(results_path)

    #removes invalid matches
    initial_len = len(df)
    df = df.dropna(subset=['home_score', 'away_score']).copy()
    print(f"Dropped {initial_len - len(df)} matches with missing scores.")

    #Time series Sorting (for Elo)
    df['date'] = pd.to_datetime(df['date'])
    df = df.sort_values('date').reset_index(drop=True)

    #Entity Resolution
    country_mapping = {'Turkey': 'Türkiye', 'Czechia': 'Czech Republic','USA': 'United States', 'Korea Republic': 'South Korea','IR Iran': 'Iran','Congo DR': 'DR Congo','Cape Verde Islands': 'Cape Verde' }
    df['home_team'] = df['home_team'].replace(country_mapping)
    df['away_team'] = df['away_team'].replace(country_mapping)

    # Tournament Weighting (K-Factor)
    # Weights are calibrated by confederation strength, not just prestige.
    # UEFA Euro avg field ELO ~1830; Gold Cup ~1630; AFCON ~1700; AFC Asian Cup ~1720.
    # Same prestige weight for different-quality fields would inflate CONCACAF/AFC ELOs.
    t = df['tournament']

    conditions = [
        # Tier 1 — 60: FIFA World Cup (global, maximum quality)
        t == 'FIFA World Cup',

        # Tier 2 — 50: Top-two confederation championships (UEFA & CONMEBOL)
        t.str.contains(r'UEFA Euro$|Copa América$', case=False, regex=True, na=False),

        # Tier 3 — 42: Mid-strength confederation championships
        # AFCON avg ~1700 ELO field, AFC Asian Cup ~1720 — slightly below UEFA/CONMEBOL
        t.str.contains(r'African Cup of Nations$|AFC Asian Cup$|Confederations Cup',
                       case=False, regex=True, na=False),

        # Tier 4 — 35: CONCACAF & OFC championships — lower average field quality
        # Gold Cup avg field ~1630 ELO; CONCACAF Championship similar
        t.str.contains(r'Gold Cup$|CONCACAF Championship$|Oceania Nations Cup$',
                       case=False, regex=True, na=False),

        # Tier 5 — 30: UEFA qualifiers & UEFA Nations League (high-quality opponents)
        t.str.contains(r'UEFA Euro qualification|UEFA Nations League',
                       case=False, regex=True, na=False),

        # Tier 6 — 28: Copa América & CONMEBOL qualification (CONMEBOL field, strong)
        t.str.contains(r'Copa América qualification|CONMEBOL',
                       case=False, regex=True, na=False),

        # Tier 7 — 25: AFCON qualification, AFC qualification (decent but weaker fields)
        t.str.contains(r'African Cup of Nations qualification|AFC Asian Cup qualification',
                       case=False, regex=True, na=False),

        # Tier 8 — 20: CONCACAF/Gold Cup qualification & Nations League — weakest field
        t.str.contains(r'Gold Cup qualification|CONCACAF Nations League|CONCACAF Championship qualification'
                       r'|CONCACAF Nations League qualification',
                       case=False, regex=True, na=False),

        # Tier 9 — 22: Other WC qualification (mix of confederations)
        t.str.contains(r'FIFA World Cup qualification', case=False, regex=True, na=False),

        # Tier 10 — 10: Friendlies
        t == 'Friendly',
    ]
    choices = [60, 50, 42, 35, 30, 28, 25, 20, 22, 10]
    df['tournament_weight'] = np.select(conditions, choices, default=18)  # default: minor cup

    out_dir = Path(__file__).parent.parent / 'cleaned'
    out_dir.mkdir(exist_ok=True)
    out_path = out_dir / 'cleaned_results.csv'

    df.to_csv(out_path, index=False)
    print(f" Saved {len(df)} cleaned historical matches to {out_path}")


if __name__ == "__main__":
    clean_match_history()