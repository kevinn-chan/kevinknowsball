import duckdb
import pandas as pd
import unicodedata
from pathlib import Path
from rapidfuzz import process, fuzz
from sklearn.impute import KNNImputer


def strip_accents(text):
    #remove accents on names
    if pd.isna(text):
        return text
    return ''.join(c for c in unicodedata.normalize('NFD', str(text))
                   if unicodedata.category(c) != 'Mn')


def build_master_database():

    base_dir = Path(__file__).resolve().parent.parent
    tm_file = base_dir / 'raw_kaggle' / 'players.csv'
    fbref_file = base_dir / 'raw_scraped' / 'fbref_global_stats.csv'
    groups_file = base_dir / 'cleaned' / 'wc_2026_groups.csv'
    out_file = base_dir / 'cleaned' / 'players_masterlist.csv'

    con = duckdb.connect()

    # extract & clean transfermarkt data
    tm_query = f"""
    WITH 
    wc_teams AS (
        SELECT country, "group" AS wc_group FROM read_csv_auto('{groups_file}')),
    
    tm_mapped AS (
        SELECT player_id, name AS player_name, current_club_name AS tm_club_name,
            -- Calculate age based on the 2026 World Cup year
            (2026 - TRY_CAST(SUBSTR(CAST(date_of_birth AS VARCHAR), 1, 4) AS INTEGER)) AS tm_age,
            CASE
                WHEN country_of_citizenship = 'Turkey' THEN 'Türkiye'
                WHEN country_of_citizenship = 'Korea, South' THEN 'South Korea'
                WHEN country_of_citizenship = 'Iran, Islamic Republic of' THEN 'Iran'
                WHEN country_of_citizenship = 'USA' THEN 'United States'
                WHEN country_of_citizenship = 'Bosnia-Herzegovina' THEN 'Bosnia and Herzegovina'
                WHEN country_of_citizenship = 'Cote d''Ivoire' THEN 'Ivory Coast'
                WHEN country_of_citizenship = 'Curacao' THEN 'Curaçao'
                ELSE country_of_citizenship
            END AS country,
            CASE
                WHEN position = 'Goalkeeper' THEN 'GK'
                WHEN position = 'Defender' THEN 'DEF'
                WHEN position = 'Midfield' THEN 'MID'
                WHEN position = 'Attack' THEN 'ATT'
                ELSE 'Unknown'
            END AS general_position,
            sub_position AS specific_position,
            COALESCE(market_value_in_eur, 50000) AS market_value,
            international_caps,
            international_goals
        FROM read_csv_auto('{tm_file}')
        WHERE last_season >= 2024
    )
    SELECT t.*, w.wc_group 
    FROM tm_mapped t
    INNER JOIN wc_teams w ON t.country = w.country
    """
    tm_df = con.execute(tm_query).df()

    # 3. Extract FBref Data
    fbref_query = f"""
    SELECT 
        player AS fbref_name,
        team AS club_team,
        TRY_CAST(SUBSTR(CAST(age AS VARCHAR), 1, 2) AS INTEGER) AS age,
        "Per 90 Minutes_Gls" AS goals_per_90,
        "Per 90 Minutes_Ast" AS assists_per_90,
        Performance_misc_Int AS interceptions,
        Performance_misc_TklW AS tackles_won,
        Performance_misc_Crs AS crosses
    FROM read_csv_auto('{fbref_file}')
    """
    fbref_df = con.execute(fbref_query).df()

    # 4. The Fuzzy Matching Bridge
    print("Executing Fuzzy Entity Resolution...")

    tm_df['norm_name'] = tm_df['player_name'].apply(strip_accents)
    fbref_df['norm_name'] = fbref_df['fbref_name'].apply(strip_accents)

    fbref_dict = dict(zip(fbref_df['norm_name'], fbref_df['fbref_name']))
    fbref_norm_keys = list(fbref_dict.keys())

    mapping_data = []
    for tm_name, tm_norm in zip(tm_df['player_name'], tm_df['norm_name']):
        if tm_norm in fbref_dict:
            mapping_data.append({'player_name': tm_name, 'matched_fbref': fbref_dict[tm_norm]})
        else:
            match = process.extractOne(tm_norm, fbref_norm_keys, scorer=fuzz.WRatio)
            if match and match[1] >= 88:
                mapping_data.append({'player_name': tm_name, 'matched_fbref': fbref_dict[match[0]]})
            else:
                mapping_data.append({'player_name': tm_name, 'matched_fbref': None})

    mapping_df = pd.DataFrame(mapping_data)

    con.register('tm_df', tm_df)
    con.register('fbref_df', fbref_df)
    con.register('mapping_df', mapping_df)

    # 5. Master Merge
    # FIXED: The waterfall COALESCE now checks FBref first, then Transfermarkt, then defaults.
    final_query = """
    SELECT 
        t.player_id, t.player_name, t.country, t.wc_group,
        COALESCE(f.club_team, t.tm_club_name, 'Unknown') AS club_team,
        COALESCE(f.age, t.tm_age, 26) AS age,
        t.general_position, t.specific_position, t.market_value, 
        t.international_caps, t.international_goals,
        f.goals_per_90,       
        f.assists_per_90,     
        f.interceptions,      
        f.tackles_won,        
        f.crosses             
    FROM tm_df t
    LEFT JOIN mapping_df m ON t.player_name = m.player_name
    LEFT JOIN fbref_df f ON m.matched_fbref = f.fbref_name
    ORDER BY t.country, t.market_value DESC
    """
    master_df = con.execute(final_query).df()

    # 6. Machine Learning KNN Imputation
    print("Executing KNN Imputation for Missing Tactical Data...")
    outfield_mask = master_df['general_position'] != 'GK'
    tactical_cols = ['goals_per_90', 'assists_per_90', 'interceptions', 'tackles_won', 'crosses']

    features = ['market_value', 'age', 'international_caps'] + tactical_cols

    # Cast explicitly to float64 to prevent Pandas casting errors
    master_df[features] = master_df[features].astype('float64')

    imputer = KNNImputer(n_neighbors=5, weights='distance')
    imputed_data = imputer.fit_transform(master_df.loc[outfield_mask, features])
    master_df.loc[outfield_mask, features] = imputed_data

    master_df[tactical_cols] = master_df[tactical_cols].fillna(0)

    for col in tactical_cols:
        master_df[col] = master_df[col].round(2)

    # 7. Export
    master_df.to_csv(out_file, index=False)

    print(f"\n✅ Master database successfully generated!")
    print(f"- Total eligible players: {len(master_df)}")
    print(f"- Output saved to: {out_file}")


if __name__ == "__main__":
    build_master_database()