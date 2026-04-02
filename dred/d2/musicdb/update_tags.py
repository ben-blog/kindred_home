import json
import urllib.request

SUPABASE_URL = "https://atzqusbarkpbgznkqeyb.supabase.co"
SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF0enF1c2JhcmtwYmd6bmtxZXliIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTExODQyNCwiZXhwIjoyMDkwNjk0NDI0fQ.nI8zQ-tG4toNbnHbLgP8o1BylSdvkVC6q4aYfn2OEgQ"

with open('d2_tags_clean.json', 'r', encoding='utf-8') as f:
    results = json.load(f)

success = 0
fail = 0

for i, (spotify_id, tags) in enumerate(results.items()):
    data = json.dumps({"d2_tags": tags}).encode('utf-8')
    url = f"{SUPABASE_URL}/rest/v1/d2_tracks?spotify_id=eq.{spotify_id}"
    req = urllib.request.Request(
        url,
        data=data,
        method='PATCH',
        headers={
            'apikey': SUPABASE_KEY,
            'Authorization': f'Bearer {SUPABASE_KEY}',
            'Content-Type': 'application/json',
            'Prefer': 'return=minimal'
        }
    )
    try:
        urllib.request.urlopen(req)
        success += 1
    except Exception as e:
        fail += 1

    if (i + 1) % 500 == 0:
        print(f"{i + 1}/{len(results)} 완료...")

print(f"\n업데이트 완료: 성공 {success}곡 / 실패 {fail}곡")
