import json

with open('d2_tags_result.json', 'r', encoding='utf-8') as f:
    results = json.load(f)

VALID_KEYWORDS = {
    '퇴근하는 길', '새벽인데', '밥은 혼자', '잠이 안 와',
    '그냥 걷고 싶어', '어딘가 가는 중', '그냥 지쳤어',
    '멍때리는 중', '뭔가 놓친 것 같아', '할 말이 있는데',
    '결정을 못 하겠어', '괜찮다고 했는데', '끝난 것 같은데',
    '이유 없이 별로', '설레면 안 되는데'
}

cleaned = {}
fixed = 0
for spotify_id, tags in results.items():
    valid_tags = [t for t in tags if t in VALID_KEYWORDS]
    if len(valid_tags) != len(tags):
        fixed += 1
    cleaned[spotify_id] = valid_tags

with open('d2_tags_clean.json', 'w', encoding='utf-8') as f:
    json.dump(cleaned, f, ensure_ascii=False, indent=2)

print(f"정제 완료: {fixed}곡 수정")
print(f"최종: {len(cleaned)}곡 → d2_tags_clean.json")
