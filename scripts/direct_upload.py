
import json
import requests
from datetime import datetime

# Supabase Credentials
SUPABASE_URL = "https://trgvsjirzofgkheaqzne.supabase.co"
SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRyZ3Zzamlyem9mZ2toZWFxem5lIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzgzNDc1ODQsImV4cCI6MjA1MzkyMzU4NH0.tMnBXEqKRbvWcDrqJXYNuqzWJKPEqcIKdGOTVZVkBYY"

def parse_number(val):
    if not val: return 0
    try:
        if isinstance(val, str):
            val = val.replace('%', '').replace(',', '').strip()
        return float(val)
    except:
        return 0

def parse_date(val):
    if not val: return None
    try:
        # Handle formats like 2025-11-17 or 11/17/2025
        if '-' in val:
            return val
        dt = datetime.strptime(val, "%m/%d/%Y")
        return dt.strftime("%Y-%m-%d")
    except:
        return None

# The data extracted from browser (partial list for demonstration, script will handle full)
# I will paste the full data below
raw_data = RAW_DATA_PLACEHOLDER

transformed = []
for item in raw_data:
    date = parse_date(item.get("Date") or item.get("Timestamp"))
    if not date: continue
    
    transformed.append({
        "date": date,
        "client_name": item.get("Client Name", ""),
        "vertical": item.get("Vertical", ""),
        "project_name": item.get("Project Name", ""),
        "product": item.get("Product / Panel", ""),
        "print_media": item.get("Print Media", ""),
        "lamination": item.get("Lamination Media", ""),
        "printer_model": item.get("Printer Model", ""),
        "size": item.get("Size", ""),
        "master_qty": parse_number(item.get("Master Qty")),
        "batch_qty": parse_number(item.get("Batch Qty")),
        "design_rej": parse_number(item.get("Design File Rejection")),
        "print_rej": parse_number(item.get("Printing Rejection")),
        "lam_rej": parse_number(item.get("Lamination Rejection")),
        "cut_rej": parse_number(item.get("Cut Rejection")),
        "pack_rej": parse_number(item.get("Packaging Rejection")),
        "media_rej": parse_number(item.get("Media Rejection")),
        "qty_rejected": parse_number(item.get("Qty Rejected")),
        "qty_delivered": parse_number(item.get("Qty Delivered")),
        "rejection_percent": parse_number(item.get("Rejection %")),
        "in_stock": parse_number(item.get("In Stock")),
        "reason": item.get("Rejection Reason", "")
    })

print(f"Uploading {len(transformed)} records...")

# Upload in batches of 50
headers = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "return=minimal"
}

BATCH_SIZE = 50
for i in range(0, len(transformed), BATCH_SIZE):
    batch = transformed[i:i+BATCH_SIZE]
    print(f"Sending batch {i//BATCH_SIZE + 1}...")
    response = requests.post(f"{SUPABASE_URL}/rest/v1/rejection_log", headers=headers, json=batch)
    if response.status_code >= 400:
        print(f"❌ Error: {response.status_code} - {response.text}")
    else:
        print(f"✅ Batch successful")

print("🎉 All data uploaded!")
