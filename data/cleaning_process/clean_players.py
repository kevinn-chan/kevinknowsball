import duckdb
from pathlib import Path

def clean_player_data_optimized():

    DATA_DIR = Path(__file__).resolve().parent.parent
    players_path = DATA_DIR / 'raw_kaggle' / 'players.csv'
    groups_path = DATA_DIR / 'cleaned' / 'wc_2026_groups.csv'

    # DuckDB query to handle ranking, filtering, and joining in one incredibly fast pass
    query = f"""
    WITH mapped_players AS (
        -- 1. Map names, filter active players, and handle null values
        SELECT 
            player_id,
            CASE 
                WHEN country_of_citizenship = 'Turkey' THEN 'Türkiye'
                WHEN country_of_citizenship = 'Korea, South' THEN 'South Korea'
                WHEN country_of_citizenship = 'Iran, Islamic Republic of' THEN 'Iran'
                WHEN country_of_citizenship = 'Bosnia-Herzegovina' THEN 'Bosnia and Herzegovina'
                WHEN country_of_citizenship = 'Cote d''Ivoire' THEN 'Ivory Coast'
                WHEN country_of_citizenship = 'Curacao' THEN 'Curaçao'
                ELSE country_of_citizenship
            END AS country,
            COALESCE(market_value_in_eur, 50000) AS market_value,
            international_caps,
            international_goals,
            CASE WHEN current_club_domestic_competition_id IN ('GB1', 'ES1', 'IT1', 'L1', 'FR1') THEN 1 ELSE 0 END AS in_top_5_league
        FROM read_csv_auto('{players_path}')
        WHERE last_season >= 2023
    ),
    ranked_players AS (
        -- 2. The Crucial Step: Rank players by market value within their country
        SELECT 
            *,
            ROW_NUMBER() OVER(PARTITION BY country ORDER BY market_value DESC) as squad_rank
        FROM mapped_players
    ),
    squad_aggregations AS (
        -- 3. Aggregate ONLY the top 26 players (World Cup roster size)
        SELECT 
            country,
            SUM(market_value) AS total_squad_value,
            ROUND(AVG(market_value), 2) AS avg_player_value,
            MAX(market_value) AS star_player_value,
            SUM(international_caps) AS total_caps,
            SUM(international_goals) AS total_goals,
            SUM(in_top_5_league) AS top_5_league_players
        FROM ranked_players
        WHERE squad_rank <= 26
        GROUP BY country
    )
    -- 4. Final Join to guarantee our 48-team matrix
    SELECT 
        g.country,
        g.group,
        COALESCE(s.total_squad_value, 0) AS total_squad_value,
        COALESCE(s.avg_player_value, 0) AS avg_player_value,
        COALESCE(s.star_player_value, 0) AS star_player_value,
        COALESCE(s.total_caps, 0) AS total_caps,
        COALESCE(s.total_goals, 0) AS total_goals,
        COALESCE(s.top_5_league_players, 0) AS top_5_league_players
    FROM read_csv_auto('{groups_path}') g
    LEFT JOIN squad_aggregations s ON g.country = s.country
    ORDER BY g.group, g.country;
    """

    final_df = duckdb.query(query).df()

    out_path = DATA_DIR / 'cleaned' / 'squad_strength.csv'
    final_df.to_csv(out_path, index=False)
    print(f"✅ Saved active 26-man squad strength for {len(final_df)} teams to {out_path}")


if __name__ == "__main__":
    clean_player_data_optimized()