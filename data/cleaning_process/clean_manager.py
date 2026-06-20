import pandas as pd
import numpy as np
from pathlib import Path

def cleaning_managers():
    DATA_DIR = Path(__file__).resolve().parent.parent
    managers_path = DATA_DIR / 'raw_scraped' / 'manager_tenures.csv'
    groups_path = DATA_DIR / 'cleaned' / 'wc_2026_groups.csv'

    managers_df = pd.read_csv(managers_path)
    groups_df = pd.read_csv(groups_path)

    #standardise country names for entity resolution
    country_mapping = {'Turkey': 'Türkiye', 'Czechia': 'Czech Republic', 'USA': 'United States','Korea Republic': 'South Korea',
                        'IR Iran': 'Iran', 'Congo DR': 'DR Congo','Cape Verde Islands': 'Cape Verde'}

    managers_df['country'] = managers_df['country'].replace(country_mapping)

    #left join to filter only 48 qualified countries
    merge_df = pd.merge(groups_df, managers_df, on='country', how='left')

    #input relevant missing data, or fill NaNs with 0
    merge_df.loc[merge_df['manager']== 'Darren Bazeley', 'tenure_days'] = 1030
    merge_df.loc[merge_df['manager']== 'Jamal Sellami', 'tenure_days'] = 700
    merge_df['tenure_days'] = merge_df['tenure_days'].fillna(0).astype(int)

    #manually define the managers who have elite club/international pedigree
    elite_managers = ['Lionel Scaloni','Didier Deschamps','Carlo Ancelotti','Thomas Tuchel','Roberto Martínez','Julian Nagelsmann','Javier Aguirre',
                    'Jesse Marsch','Julen Lopetegui','Mauricio Pochettino','Ronald Koeman','Graham Potter','Rudi Garcia','Luis de la Fuente','Marcelo Bielsa','Ralf Rangnick']

    #create binary flag
    merge_df['has_elite_pedigree'] = np.where(merge_df['manager'].isin(elite_managers), 1, 0)


    clean_df = merge_df[['country', 'group', 'manager', 'tenure_days', 'has_elite_pedigree']]

    #checks
    missing = clean_df[clean_df['manager'].isna()]['country'].tolist()
    if missing:
        print(f"\n Missing manager data for: {missing}")
        print("Update the 'country_mapping' dictionary to align the names.")
    else:
        print("No missing managers detected.")


    out_dir = Path(__file__).parent.parent / 'cleaned'
    out_dir.mkdir(exist_ok=True)
    out_path = out_dir / 'cleaned_wc_managers.csv'
    clean_df.to_csv(out_path, index=False)
    print(f" Saved 48 World Cup managers to {out_path}")

if __name__ == "__main__":
    cleaning_managers()