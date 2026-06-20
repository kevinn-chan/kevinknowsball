import pandas as pd
from pathlib import Path

def get_groups():
    groups = {
        'A': ['Mexico', 'South Africa', 'South Korea', 'Czech Republic'],
        'B': ['Canada', 'Bosnia and Herzegovina', 'Qatar', 'Switzerland'],
        'C': ['Brazil', 'Morocco', 'Haiti', 'Scotland'],
        'D': ['United States', 'Paraguay', 'Australia', 'Türkiye'],
        'E': ['Germany', 'Curaçao', 'Ivory Coast', 'Ecuador'],
        'F': ['Netherlands', 'Japan', 'Sweden', 'Tunisia'],
        'G': ['Belgium', 'Egypt', 'Iran', 'New Zealand'],
        'H': ['Spain', 'Cape Verde', 'Saudi Arabia', 'Uruguay'],
        'I': ['France', 'Senegal', 'Iraq', 'Norway'],
        'J': ['Argentina', 'Algeria', 'Austria', 'Jordan'],
        'K': ['Portugal', 'DR Congo', 'Uzbekistan', 'Colombia'],
        'L': ['England', 'Croatia', 'Ghana', 'Panama']
    }

    data = []
    for group, teams in groups.items():
        for team in teams:
            data.append({'country': team, 'group': group})

    df = pd.DataFrame(data)

    out_dir = Path(__file__).parent.parent / 'cleaned'
    out_dir.mkdir(exist_ok=True)
    out_path = out_dir / 'wc_2026_groups.csv'
    df.to_csv(out_path, index=False)

    print(f"Saved 48 confirmed teams and their groups to {out_path}")

if __name__ == "__main__":
    get_groups()