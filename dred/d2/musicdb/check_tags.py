import json

with open('d2_tags_result.json', 'r', encoding='utf-8') as f:
    results = json.load(f)

print(f"태그 붙은 곡 수: {len(results)}")

# 샘플 10개 확인
items = list(results.items())[:10]
for spotify_id, tags in items:
    print(f"{spotify_id}: {tags}")

# 키워드별 분포
from collections import Counter
all_tags = []
for tags in results.values():
    all_tags.extend(tags)

print(f"\n키워드 분포:")
for tag, count in Counter(all_tags).most_common():
    print(f"  {tag}: {count}곡")
