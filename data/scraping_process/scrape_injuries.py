import pandas as pd
import requests
from bs4 import BeautifulSoup
import time
import re
from pathlib import Path

def get_injuries():
    headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'}

    injured_players = []
    league_codes = ['GB1', 'ES1', 'IT1', 'L1', 'FR1', 'SA1', 'MSL1', 'NL1', 'PO1','TR1'] #relevant leagues
    wc_end = pd.to_datetime('2026-07-19') #set to miss whole wc

    for league in league_codes:
        url = f"https://www.transfermarkt.com/premier-league/verletztespieler/wettbewerb/{league}" #tf link
        res = requests.get(url, headers=headers)

        if res.status_code != 200:
            continue

        soup = BeautifulSoup(res.text, 'html.parser')
        table = soup.find('table', {'class': 'items'})

        if not table:
            continue

        for row in table.find_all('tr', {'class': ['odd', 'even']}):
            try:
                name_tag = row.find('td', {'class': 'hauptlink'})
                name = name_tag.text.strip() if name_tag else None

                date_match = re.search(r'\d{2}/\d{2}/\d{4}', row.text.replace('\n', ' '))
                return_date = date_match.group(0) if date_match else None

                if name and return_date:
                    injured_players.append({
                        'player_name': name,
                        'return_date_str': return_date
                    })

            except Exception:
                pass

        time.sleep(2)

    df = pd.DataFrame(injured_players)

    if df.empty:
        print("No injury data parsed.")
        return

    df['return_date'] = pd.to_datetime(df['return_date_str'], format='%d/%m/%Y', errors='coerce')

    out_df = df[df['return_date'] > wc_end].copy()
    out_df['is_missing_tournament'] = 1
    out_df = out_df[['player_name', 'return_date', 'is_missing_tournament']]

    out_dir = Path(__file__).parent.parent / 'raw_scraped'
    out_dir.mkdir(exist_ok=True)
    out_path = out_dir / 'wc_injured_players.csv'

    out_df.to_csv(out_path, index=False)
    print(f"Filtered to {len(out_df)} players missing the tournament.")
    print(f"Saved: {out_path}")


if __name__ == "__main__":
    get_injuries()