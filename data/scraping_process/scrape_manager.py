import pandas as pd
import requests
from datetime import datetime
from pathlib import Path
import ssl
import io
import warnings

# Bypass SSL verification for macOS and suppress BeautifulSoup warnings
warnings.filterwarnings("ignore", category=UserWarning)
ssl._create_default_https_context = ssl._create_unverified_context


def get_managers():
    url = "https://en.wikipedia.org/wiki/List_of_current_national_association_football_team_managers"
    headers = {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
    }

    try:
        response = requests.get(url, headers=headers)
        response.raise_for_status()

        # Parse tables from HTML
        tables = pd.read_html(io.StringIO(response.text))
        valid_tables = [t for t in tables if 'Team' in t.columns and 'Manager' in t.columns]

        if not valid_tables:
            print("No matching tables found on the page.")
            return

        df = pd.concat(valid_tables, ignore_index=True)

    except Exception as e:
        print(f"Error fetching data: {e}")
        return

    # Keep relevant columns and rename them
    df = df[['Team', 'Manager', 'Assumed role']].copy()
    df.columns = ['country', 'manager', 'appointed_date_str']

    # Clean Wikipedia reference brackets (e.g., '[F 1]')
    df['appointed_date_str'] = df['appointed_date_str'].astype(str).str.replace(r'\[.*\]', '', regex=True)

    # Convert to datetime and calculate tenure
    df['appointed_date'] = pd.to_datetime(df['appointed_date_str'], errors='coerce')
    df['tenure_days'] = (pd.to_datetime(datetime.today()) - df['appointed_date']).dt.days

    # Remove rows where the manager position is vacant
    df = df[~df['manager'].str.contains('Vacant', case=False, na=False)].copy()

    df_final = df[['country', 'manager', 'appointed_date', 'tenure_days']]

    # Save to CSV
    output_dir = Path(__file__).parent.parent / 'raw_scraped'
    output_dir.mkdir(parents=True, exist_ok=True)
    output_path = output_dir / 'manager_tenures.csv'

    df_final.to_csv(output_path, index=False)
    print(f"Saved {len(df_final)} records to {output_path}")


if __name__ == "__main__":
    get_managers()