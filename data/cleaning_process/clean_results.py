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

    #Tournament Weighting (K-Factor)
    conditions = [
        df['tournament'] == 'FIFA World Cup', #weight 60
        df['tournament'].str.contains(
            'Copa América|UEFA Euro$|African Cup of Nations$|AFC Asian Cup$|Gold Cup$|CONCACAF Championship$',
            case=False, regex=True, na=False), #weight 50
        df['tournament'].str.contains('qualification|Nations League|Confederations Cup', case=False, regex=True,na=False), #weight 30
        df['tournament'] == 'Friendly' #weight 10
    ]
    choices = [60, 50, 30, 10]
    df['tournament_weight'] = np.select(conditions, choices, default=20) #weight 20

    out_dir = Path(__file__).parent.parent / 'cleaned'
    out_dir.mkdir(exist_ok=True)
    out_path = out_dir / 'cleaned_results.csv'

    df.to_csv(out_path, index=False)
    print(f" Saved {len(df)} cleaned historical matches to {out_path}")


if __name__ == "__main__":
    clean_match_history()