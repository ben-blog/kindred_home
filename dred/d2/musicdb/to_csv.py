import pandas as pd
import json

with open('d2_tracks_import.json', 'r', encoding='utf-8') as f:
    records = json.load(f)

df = pd.DataFrame(records)

# 중복 spotify_id 제거 (첫 번째 것만 유지)
before = len(df)
df = df.drop_duplicates(subset='spotify_id', keep='first')
after = len(df)
print(f"중복 제거: {before - after}개 제거 → {after}곡 남음")

df['d2_tags'] = '{}'
df.to_csv('d2_tracks_final.csv', index=False)
print(f"완료 → d2_tracks_final.csv")
