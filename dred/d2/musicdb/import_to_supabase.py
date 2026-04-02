import pandas as pd
import json

df = pd.read_csv('dred_pool.csv')

# 컬럼명 맞추기
df = df.rename(columns={
    'track': 'title',
    'valence_tags': 'valence',
    'arousal_tags': 'arousal',
    'dominance_tags': 'dominance'
})

# d2_tags 빈 배열로 초기화
df['d2_tags'] = [[] for _ in range(len(df))]

# Supabase import용 JSON 생성
records = df[['artist','title','genre','spotify_id','valence','arousal','dominance','d2_tags']].to_dict(orient='records')

with open('d2_tracks_import.json', 'w', encoding='utf-8') as f:
    json.dump(records, f, ensure_ascii=False, indent=2)

print(f"완료: {len(records)}곡 → d2_tracks_import.json")
print(f"\n샘플 3개:")
for r in records[:3]:
    print(r)
