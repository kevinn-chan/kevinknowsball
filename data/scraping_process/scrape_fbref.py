import soccerdata as sd
import pandas as pd
import time
from pathlib import Path
import os

def scrape_stealth_mode():

    target_leagues = [ "ENG-Premier League","ESP-La Liga", "ITA-Serie A", "GER-Bundesliga", "FRA-Ligue 1", "NED-Eredivisie", "POR-Primeira Liga", "TUR-Süper Lig", "USA-Major League Soccer", "KSA-Saudi Professional League" ]

    out_dir = Path(__file__).resolve().parent.parent / 'raw_scraped'
    out_dir.mkdir(exist_ok=True)
    out_path = out_dir / 'fbref_global_stats.csv'

    # If the file already exists from a partial run, load it so we don't overwrite good data
    if os.path.exists(out_path):
        master_df = pd.read_csv(out_path)
        print(f"Found existing data with {len(master_df)} players. Resuming...")
    else:
        master_df = pd.DataFrame()

    for league in target_leagues:
        print(f"\n--- Scraping {league} ---")
        try:
            fbref = sd.FBref(leagues=league, seasons="2526")
            fbref.rate_limit = 10

            #Extract Data
            standard = fbref.read_player_season_stats(stat_type="standard")
            misc = fbref.read_player_season_stats(stat_type="misc")

            #Merge
            merged = standard.join(misc, rsuffix='_misc').reset_index()

            #Clean column names
            merged.columns = [
                '_'.join(col).strip('_') if isinstance(col, tuple) else col
                for col in merged.columns
            ]

            #Append to master dataframe
            master_df = pd.concat([master_df, merged], ignore_index=True)

            #Save immediately so if we crash on the next league, this data is safe.
            master_df.to_csv(out_path, index=False)
            print(f"✅ Saved {league}. Current total players: {len(master_df)}")

            #manual sleep before switching leagues to reset FBref's bot-detection
            print("Sleeping for 15 seconds before the next league...")
            time.sleep(15)

        except Exception as e:
            print(f"Failed on {league}. FBref hit us with a block. Error: {e}")
            print("Stopping the script to protect the IP. Run this again in an hour; it will resume where it left off")
            break

    print("\n Scraping process complete or paused.") #found out fbref does not have Saudi League data (move on without it)


if __name__ == "__main__":
    scrape_stealth_mode()