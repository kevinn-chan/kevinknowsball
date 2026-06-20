import re
import io
import ssl
import warnings
import pandas as pd
import requests
from bs4 import BeautifulSoup
from pathlib import Path

warnings.filterwarnings("ignore", category=UserWarning)
ssl._create_default_https_context = ssl._create_unverified_context

COUNTRY_MAPPING = {
    'Turkey': 'Türkiye', 'Czechia': 'Czech Republic', 'USA': 'United States',
    'Korea Republic': 'South Korea', 'IR Iran': 'Iran', 'Congo DR': 'DR Congo',
    'Cape Verde Islands': 'Cape Verde',
}

def scrape_squads() -> pd.DataFrame:
    url = "https://en.wikipedia.org/wiki/2026_FIFA_World_Cup_squads"
    headers = {'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'}

    print("Fetching Wikipedia squad page...")
    resp = requests.get(url, headers=headers, timeout=30)
    resp.raise_for_status()

    soup = BeautifulSoup(resp.text, 'html.parser')

    # Extract h3 country names in document order (h2 are group headers, skip them)
    country_names = [
        re.sub(r'\[.*?\]', '', tag.get_text(strip=True))
        for tag in soup.find_all('h3')
    ]
    print(f"Found {len(country_names)} country headers")

    # pandas reads ALL tables; squad tables have Pos., Caps, Goals columns
    tables = pd.read_html(io.StringIO(resp.text))
    squad_tables = [t for t in tables if 'Pos.' in t.columns and 'Caps' in t.columns and 'Goals' in t.columns]
    print(f"Found {len(squad_tables)} squad tables")

    # Zip tables to countries — Wikipedia orders them group by group, 4 teams each
    rows = []
    for country, table in zip(country_names, squad_tables):
        country = COUNTRY_MAPPING.get(country, country)
        for _, row in table.iterrows():
            # Parse DOB: "Month Day, Year (aged ##)" → "YYYY-MM-DD"
            dob_raw = str(row.get('Date of birth (age)', ''))
            dob_match = re.search(r'(\w+ \d{1,2},\s*\d{4})', dob_raw)
            dob = None
            if dob_match:
                try:
                    dob = pd.to_datetime(dob_match.group(1)).strftime('%Y-%m-%d')
                except Exception:
                    pass

            # Clean player name (strip captain marker and any parenthetical suffix)
            player = re.sub(r'\s*\(.*?\)\s*$', '', str(row.get('Player', ''))).strip()

            rows.append({
                'country': country,
                'shirt_no': row.get('No.'),
                'position': str(row.get('Pos.', '')).strip(),
                'player_name': player,
                'dob': dob,
                'caps': row.get('Caps'),
                'goals': row.get('Goals'),
                'club': str(row.get('Club', '')).strip(),
            })

    df = pd.DataFrame(rows)

    # Calculate age at tournament start (June 11, 2026)
    tournament_start = pd.Timestamp('2026-06-11')
    df['dob_dt'] = pd.to_datetime(df['dob'], errors='coerce')
    df['age_at_wc'] = ((tournament_start - df['dob_dt']).dt.days / 365.25).round(1)
    df.drop(columns=['dob_dt'], inplace=True)

    # Normalise position to match existing schema
    pos_map = {'GK': 'GK', 'DF': 'DEF', 'MF': 'MID', 'FW': 'ATT'}
    df['general_position'] = df['position'].map(pos_map).fillna('Unknown')

    return df


if __name__ == "__main__":
    df = scrape_squads()

    out_dir = Path(__file__).resolve().parent.parent / 'raw_scraped'
    out_dir.mkdir(exist_ok=True)
    out_path = out_dir / 'wc2026_official_squads.csv'

    df.to_csv(out_path, index=False)
    print(f"\n✅ Saved {len(df)} players across {df['country'].nunique()} countries to {out_path}")
    print(df.groupby('country').size().to_string())
