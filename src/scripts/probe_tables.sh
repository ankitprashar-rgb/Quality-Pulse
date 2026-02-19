#!/bin/bash

# Load env vars
export $(grep -v '^#' .env | xargs)

URL="$VITE_SUPABASE_URL/rest/v1"
KEY="$VITE_SUPABASE_ANON_KEY"

TABLES=("print_media" "lamination" "printers" "printer" "media" "materials" "master_data" "configurations" "settings" "dropdowns" "options" "lookup" "definitions" "products" "items" "media_options" "static_data")

echo "Probing tables..."

for table in "${TABLES[@]}"; do
  # We use head=true to just check existence without fetching data
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" -H "apikey: $KEY" -H "Authorization: Bearer $KEY" -H "Range: 0-0" "$URL/$table?select=*&limit=1")
  
  if [ "$STATUS" == "200" ] || [ "$STATUS" == "206" ]; then
    echo "[FOUND] $table exists!"
    # Fetch sample
    curl -s -H "apikey: $KEY" -H "Authorization: Bearer $KEY" "$URL/$table?select=*&limit=2"
    echo ""
  else
    echo "[NOT FOUND] $table (Status: $STATUS)"
  fi
done
