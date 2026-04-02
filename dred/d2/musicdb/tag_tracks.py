import anthropic
import pandas as pd
import json
import time

client = anthropic.Anthropic()

df = pd.read_csv('dred_pool.csv')
df = df.rename(columns={'track': 'title', 'valence_tags': 'valence', 'arousal_tags': 'arousal'})
df = df.drop_duplicates(subset='spotify_id', keep='first').reset_index(drop=True)

KEYWORDS = [
    '퇴근하는 길', '새벽인데', '밥은 혼자', '잠이 안 와',
    '그냥 걷고 싶어', '어딘가 가는 중', '그냥 지쳤어',
    '멍때리는 중', '뭔가 놓친 것 같아', '할 말이 있는데',
    '결정을 못 하겠어', '괜찮다고 했는데', '끝난 것 같은데',
    '이유 없이 별로', '설레면 안 되는데'
]

SYSTEM = """너는 DRED라는 캐릭터야. 건조하고 관찰자적이며, 도시적이고 차갑지만 깊이가 있어.
주어진 곡들을 보고, 각 곡에 어울리는 D2 키워드를 골라줘.
키워드는 반드시 아래 목록에서만 선택해:
퇴근하는 길, 새벽인데, 밥은 혼자, 잠이 안 와, 그냥 걷고 싶어, 어딘가 가는 중,
그냥 지쳤어, 멍때리는 중, 뭔가 놓친 것 같아, 할 말이 있는데,
결정을 못 하겠어, 괜찮다고 했는데, 끝난 것 같은데, 이유 없이 별로, 설레면 안 되는데

규칙:
- 곡당 1~4개 키워드
- 반드시 JSON 배열로만 응답
- 설명 없음"""

def tag_batch(batch):
    tracks_str = '\n'.join([f'{i+1}. {r["artist"]} - {r["title"]} ({r["genre"]}, v:{r["valence"]:.2f}, a:{r["arousal"]:.2f})'
                            for i, r in enumerate(batch)])
    prompt = f"""아래 곡들 각각에 D2 키워드를 배정해줘.
반드시 이 형식으로만 응답해 (JSON 배열):
[["키워드1","키워드2"], ["키워드1"], ...]

곡 목록:
{tracks_str}"""

    msg = client.messages.create(
        model='claude-haiku-4-5-20251001',
        max_tokens=2000,
        system=SYSTEM,
        messages=[{'role': 'user', 'content': prompt}]
    )
    
    text = msg.content[0].text.strip()
    # JSON 추출
    start = text.find('[')
    end = text.rfind(']') + 1
    return json.loads(text[start:end])

# 배치 처리
BATCH_SIZE = 50
results = {}
total = len(df)

print(f"총 {total}곡 처리 시작 (배치 크기: {BATCH_SIZE})")

for i in range(0, total, BATCH_SIZE):
    batch = df.iloc[i:i+BATCH_SIZE].to_dict(orient='records')
    batch_num = i // BATCH_SIZE + 1
    total_batches = (total + BATCH_SIZE - 1) // BATCH_SIZE
    
    try:
        tags = tag_batch(batch)
        for j, row in enumerate(batch):
            if j < len(tags):
                results[row['spotify_id']] = tags[j]
        print(f"배치 {batch_num}/{total_batches} 완료 ({i+len(batch)}/{total}곡)")
        time.sleep(1)  # API 레이트 리밋 방지
    except Exception as e:
        print(f"배치 {batch_num} 오류: {e}")
        time.sleep(3)

# 결과 저장
with open('d2_tags_result.json', 'w', encoding='utf-8') as f:
    json.dump(results, f, ensure_ascii=False, indent=2)

print(f"\n완료: {len(results)}곡 태그 결과 → d2_tags_result.json")
