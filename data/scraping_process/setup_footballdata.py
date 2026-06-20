import json
from pathlib import Path

def setup_footballdata_config():
    config_dir = Path.home() / 'soccerdata' / 'config'
    config_dir.mkdir(parents=True, exist_ok=True)

    config_file = config_dir / 'league_dict.json'

    custom_leagues = {
        "NED-Eredivisie": {"FBref": "Eredivisie"},
        "POR-Primeira Liga": {"FBref": "Primeira Liga"},
        "TUR-Süper Lig": {"FBref": "Süper Lig"},
        "USA-Major League Soccer": {"FBref": "Major League Soccer"},
        "KSA-Saudi Professional League": {"FBref": "Saudi Professional League"}
    }

    with open(config_file, 'w', encoding='utf-8') as f:
        json.dump(custom_leagues, f, indent=4, ensure_ascii=False)

    print(f"Successfully created custom league mapping at: {config_file}")
    print("The backend is now unlocked. You can run your FBref scraper!")


if __name__ == "__main__":
    setup_footballdata_config()