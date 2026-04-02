import pandas as pd

df = pd.read_csv('muse_v3.csv')

dred_genres = [
    'indie', 'ambient', 'folk', 'alternative', 'soul', 'jazz',
    'experimental', 'singer-songwriter', 'acoustic', 'indie rock',
    'electronica', 'indie pop', 'post-rock', 'chill', 'new wave',
    'downtempo', 'post-punk', 'dark ambient', 'sad', 'shoegaze',
    'trip-hop', 'j-pop', 'blues', 'alternative rock', 'electronic'
]

# 단계별로 몇 개씩 걸러지는지
total = len(df)
has_spotify = df['spotify_id'].notna().sum()
genre_filter = df[df['genre'].isin(dred_genres) & df['spotify_id'].notna()]
vad_filter = genre_filter[
    (genre_filter['valence_tags'] >= 1.0) &
    (genre_filter['valence_tags'] <= 4.5) &
    (genre_filter['arousal_tags'] >= 1.0) &
    (genre_filter['arousal_tags'] <= 4.0)
]

print(f"전체:              {total:,}개")
print(f"spotify_id 있음:   {has_spotify:,}개")
print(f"장르 필터 후:      {len(genre_filter):,}개")
print(f"V-A-D 필터 후:     {len(vad_filter):,}개  ← DRED 풀")
