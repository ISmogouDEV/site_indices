import requests
import pandas as pd
import sqlite3
from datetime import datetime
import os

# Codes from SGS (Banco Central)
INDICATORS = {
    'SELIC': 11,
    'CDI': 12,
    'IPCA': 433,
    'IGP-M': 189,
    'IGP-DI': 190,
    'IPC-FIPE': 193,
    'TR': 226 # Found TR code 226 for monthly TR
}

DB_PATH = 'data/database.sqlite'

def setup_db():
    if not os.path.exists('data'):
        os.makedirs('data')
    
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS indicators (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT,
            date TEXT,
            value REAL,
            UNIQUE(name, date)
        )
    ''')
    conn.commit()
    conn.close()

def fetch_sgs(indicator_name, code):
    print(f"Fetching {indicator_name} (SGS Code: {code})...")
    # Use dates to limit range
    today = datetime.now().strftime('%d/%m/%Y')
    # Use 5 years for daily, 20 years for monthly
    start_year = datetime.now().year - (5 if indicator_name in ['SELIC', 'CDI'] else 20)
    start_date = f"01/01/{start_year}"
    
    url = f"https://api.bcb.gov.br/dados/serie/bcdata.sgs.{code}/dados?formato=json&dataInicial={start_date}&dataFinal={today}"
    
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json, text/plain, */*'
    }
    try:
        response = requests.get(url, headers=headers, timeout=15)
        response.raise_for_status()
        data = response.json()
        df = pd.DataFrame(data)
        if df.empty:
            return df
        df['name'] = indicator_name
        df['date'] = pd.to_datetime(df['data'], format='%d/%m/%Y').dt.strftime('%Y-%m-%d')
        df['value'] = df['valor'].astype(float)
        return df[['name', 'date', 'value']]
    except Exception as e:
        print(f"Warning: Could not fetch {indicator_name}: {e}")
        return pd.DataFrame()

def save_to_db(df):
    if df.empty:
        return
    conn = sqlite3.connect(DB_PATH)
    # Using SQL directly to handle "OR IGNORE" for unique constraint
    for _, row in df.iterrows():
        conn.execute("INSERT OR REPLACE INTO indicators (name, date, value) VALUES (?, ?, ?)", 
                     (row['name'], row['date'], row['value']))
    conn.commit()
    conn.close()

def main():
    setup_db()
    for name, code in INDICATORS.items():
        # Fetch last 2 years of data for performance, or more if needed
        # For simplicity, fetching all available for indices with monthly data
        df = fetch_sgs(name, code)
        save_to_db(df)
    print("Data update complete.")

if __name__ == "__main__":
    main()
