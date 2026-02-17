
import os
import json
import csv
from google.oauth2 import service_account
from googleapiclient.discovery import build

def fetch_sheet_data():
    creds_path = '../google-credentials.json'
    spreadsheet_id = '1PDWBktsa6WDa-waadkviayR7wEVPiTN3S9SogROlXU8'
    range_name = 'Rejection Log!A:Z'

    print(f"Reading credentials from {creds_path}...")
    with open(creds_path) as f:
        info = json.load(f)

    creds = service_account.Credentials.from_service_account_info(info)
    service = build('sheets', 'v4', credentials=creds)

    print(f"Fetching data from spreadsheet {spreadsheet_id}...")
    sheet = service.spreadsheets()
    result = sheet.values().get(spreadsheetId=spreadsheet_id, range=range_name).execute()
    values = result.get('values', [])

    if not values:
        print('No data found.')
        return

    output_file = 'rejection_log_data.csv'
    print(f"Saving {len(values)} rows to {output_file}...")
    with open(output_file, 'w', newline='', encoding='utf-8') as f:
        writer = csv.writer(f)
        writer.writerows(values)

    print("✅ Done!")

if __name__ == '__main__':
    try:
        fetch_sheet_data()
    except Exception as e:
        print(f"❌ Error: {e}")
