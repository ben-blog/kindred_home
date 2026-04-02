import pandas as pd

df = pd.read_csv('muse_v3.csv')

dred_genres = [
    'indie', 'ambient', 'folk', 'alternative', 'soul', 'jazz',
    'experimental', 'singer-songwriter', 'acoustic', 'indie rock',
    'electronica', 'indie pop', 'post-rock', 'chill', 'new wave',
    'downtempo', 'post-punk', 'dark ambient', 'sad', 'shoegaze',
    'trip-hop', 'j-pop', 'blues', 'alternative rock', 'electronic'
]

dred_pool = df[
    (df['valence_tags'] >= 1.0) &
    (df['valence_tags'] <= 4.5) &
    (df['arousal_tags'] >= 1.0) &
    (df['arousal_tags'] <= 4.0) &
    (df['spotify_id'].notna()) &
    (df['genre'].isin(dred_genres))
].copy()

out = dred_pool[['artist','track','genre','valence_tags','arousal_tags','dominance_tags','spotify_id']].reset_index(drop=True)
out.to_csv('dred_pool.csv', index=False)

print(f"저장 완료: {len(out)}곡 → dred_pool.csv")
print(f"\n장르 분포:")
print(out['genre'].value_counts().to_string())
print(f"\n샘플 10곡:")
print(out[['artist','track','genre','valence_tags','arousal_tags']].sample(10).to_string())
