// ═══════════════════════════════════════════
// core.js — K2 공통 데이터·로직 (DOM 없음)
// ═══════════════════════════════════════════

// ── CONFIG ──
export const SUPA_URL = 'https://lmfyspozcmyefgrkgxch.supabase.co';
export const SUPA_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxtZnlzcG96Y215ZWZncmtneGNoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ2OTQxMTksImV4cCI6MjA5MDI3MDExOX0.cwB-4U5tnY3AC-lZhRv0ptWZZ5tqVZyK0TiHlQk1ViI';
export const API_URL = 'https://kin-agent-production.up.railway.app';

// 절대 경로 사용 — Vercel rewrite 환경에서 상대경로 오동작 방지
export const KIN_IMGS = {
  excited: '/kin/k2/assets/kin_excited.webp',
  happy: '/kin/k2/assets/kin_happy.webp',
  thinking: '/kin/k2/assets/kin_thinking1.webp',
  serious: '/kin/k2/assets/kin_serious.webp',
  sad: '/kin/k2/assets/kin_sad.webp',
};

export const BG_IMAGES = [
  '/kin/k2/assets/bg/bg1.png',
  '/kin/k2/assets/bg/bg2.png',
  '/kin/k2/assets/bg/bg3.png',
  '/kin/k2/assets/bg/bg4.png',
  '/kin/k2/assets/bg/bg5.png',
  '/kin/k2/assets/bg/bg6.png',
  '/kin/k2/assets/bg/bg7.png',
  '/kin/k2/assets/bg/bg8.png',
  '/kin/k2/assets/bg/bg9.png',
  '/kin/k2/assets/bg/bg10.png',
];

export const COVER_MAL_IDS = [
  { id: 21, title: '원피스' },
  { id: 20, title: '나루토' },
  { id: 16498, title: '진격의 거인' },
  { id: 38000, title: '귀멸의 칼날' },
  { id: 11061, title: '헌터×헌터' },
  { id: 5114, title: '강철의 연금술사' },
  { id: 1535, title: '데스노트' },
  { id: 33, title: '베르세르크' },
  { id: 40748, title: '주술회전' },
  { id: 44511, title: '체인소맨' },
  { id: 223, title: '드래곤볼' },
  { id: 170, title: '슬램덩크' },
];

export const SLOTS = [
  { format: 'work', difficulty: 'easy' },
  { format: 'character', difficulty: 'easy' },
  { format: 'outlier', difficulty: 'easy' },
  { format: 'relation', difficulty: 'mid' },
  { format: 'character', difficulty: 'mid' },
  { format: 'work', difficulty: 'mid' },
  { format: 'author', difficulty: 'mid' },
  { format: 'outlier', difficulty: 'hard' },
  { format: 'relation', difficulty: 'hard' },
  { format: 'author', difficulty: 'hard' },
];

export const FORMAT_LABELS = {
  ko: { work: '설정', character: '캐릭터', outlier: '아닌것', author: '작가', relation: '관계' },
  en: {
    work: 'setting',
    character: 'character',
    outlier: 'not this',
    author: 'author',
    relation: 'relation',
  },
};

// ── LANG ──
const _callbacks = [];
let _lang = localStorage.getItem('k2_lang') || (navigator.language?.startsWith('ko') ? 'ko' : 'en');

export const getLang = () => _lang;
export const t = (ko, en) => (_lang === 'ko' ? ko : en);

export function onLangChange(cb) {
  _callbacks.push(cb);
}

export function setLang(l) {
  _lang = l;
  localStorage.setItem('k2_lang', l);
  document.documentElement.lang = l;
  _callbacks.forEach((cb) => cb(l));
}

// ── SUPABASE ──
export async function supaFetch(path, opts = {}) {
  const res = await fetch(`${SUPA_URL}/rest/v1/${path}`, {
    ...opts,
    headers: {
      apikey: SUPA_KEY,
      Authorization: `Bearer ${SUPA_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
      ...(opts.headers || {}),
    },
  });
  if (!res.ok) throw new Error(`Supabase ${res.status}`);
  const ct = res.headers.get('content-type') || '';
  if (ct.includes('json') && res.status !== 204) return res.json();
  return null;
}

export async function supaCount(path) {
  const res = await fetch(`${SUPA_URL}/rest/v1/${path}`, {
    headers: {
      apikey: SUPA_KEY,
      Authorization: `Bearer ${SUPA_KEY}`,
      Prefer: 'count=exact',
      Range: '0-0',
    },
  });
  if (!res.ok) throw new Error(`Supabase ${res.status}`);
  const cr = res.headers.get('content-range');
  return parseInt(cr?.split('/')[1] || '0', 10);
}

// ── UTILS ──
export const genUUID = () => {
  if (crypto.randomUUID) return crypto.randomUUID();
  return ([1e7] + -1e3 + -4e3 + -8e3 + -1e11).replace(/[018]/g, (c) =>
    (c ^ (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (c / 4)))).toString(16)
  );
};

let _lastBgIdx = -1;
export function getRandomBg() {
  let idx;
  do {
    idx = Math.floor(Math.random() * BG_IMAGES.length);
  } while (idx === _lastBgIdx);
  _lastBgIdx = idx;
  return BG_IMAGES[idx];
}

export async function fetchAniListCover(malId) {
  const query = `query($id:Int,$t:MediaType){Media(idMal:$id,type:$t){coverImage{large}}}`;
  for (const type of ['ANIME', 'MANGA']) {
    try {
      const res = await fetch('https://graphql.anilist.co', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, variables: { id: malId, t: type } }),
      });
      const url = (await res.json())?.data?.Media?.coverImage?.large;
      if (url) return url;
    } catch {}
  }
  return null;
}

export function loadImgCORS(img, src) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(reject, 4000);
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      clearTimeout(timer);
      resolve();
    };
    img.onerror = () => {
      clearTimeout(timer);
      reject();
    };
    img.src = src;
  });
}

// ── KIN 반응 풀 ──
const KIN_REACTIONS = {
  correct_easy: [
    '그건 알아야지. 이걸 모르면 솔직히 좀 곤란해.',
    '뭐, 기본이긴 한데. 그래도 알고 있어서 다행이야.',
    '맞아. 이 정도는 알고 있어야 대화가 돼.',
    '당연한 거 아냐? 근데 당연한 걸 안다는 게 생각보다 중요해.',
    '어, 그건 알고 있었구나. 출발은 나쁘지 않네.',
    '기본은 되네. 이제부터가 진짜야.',
    '그거야 뭐. 모르면 더 이상한 거지.',
    '모를 줄 알았는데. 편견이었나봐.',
    '이 정도는 맞혀야지. 안 맞히면 진짜 걱정되는 거야.',
    '그럼 그렇지. 이거 틀리면 어디서부터 다시 시작해야 하나 싶었어.',
    '기본 중의 기본. 여기서 헷갈리면 나중에 진짜 어렵거든.',
    '알고 있었어? 다행이다. 진심으로.',
  ],
  correct_mid: [
    '어, 맞네. 솔직히 좀 의외야.',
    '이걸 알고 있었어? 좀 읽었구나, 진짜로.',
    '알고 있었어? 생각보다 훨씬 아는데.',
    '오. 알고 있었구나. 이건 좀 놀랍다.',
    '맞아. 이 정도 알면 그냥 취미라고 부르기 좀 애매해.',
    '생각보다 아는구나. 괜히 얕봤나봐.',
    '어, 이걸 알아? 이건 그냥 아무나 아는 게 아닌데.',
    '좀 읽었네. 표시 나거든, 이런 거에서.',
    '어, 봤구나. 이건 찾아본 게 아니라 진짜 본 사람만 알아.',
    '그걸 알고 있었어. 어떻게 알았어, 솔직히.',
    '나름 알고 있네. 이 정도면 인정할 수밖에 없어.',
    '진짜로? 이거 아는 사람 별로 없는데.',
  ],
  correct_hard: [
    '진짜로? 이건... 좀 무섭다. 어떻게 알아.',
    '어, 그것도 알아? 이 정도면 그냥 덕후야. 좋은 의미로.',
    '놀랍네. 이거 아는 사람 손에 꼽거든.',
    '이걸 아는 사람이 있네. 솔직히 나도 반신반의했어.',
    '이건 좀 대단한데. 별로 인정 안 하는데 인정한다.',
    '어, 진짜 알고 있었어? 찾아본 거 아니지? 진짜지?',
    '이 정도면 인정. 진심으로, 아무한테나 하는 말 아니야.',
    '그것까지 알고 있어? 이건 좀 차원이 다른 얘기야.',
    '...맞네. 할 말이 없다. 진짜로.',
    '이건 좀 무섭다. 어디까지 읽은 거야, 솔직히.',
    '제대로 읽었구나. 이건 그냥 읽어서는 기억 못 해.',
    '만화방 단골 자격 있다. 아니, 그냥 만화방 차려도 될 것 같은데.',
  ],
  wrong_easy: [
    '이걸 몰라. 아니, 진짜로 모르는 거야?',
    '진짜로. 이게 말이 돼?',
    '...나가도 돼. 농담이야. 근데 이건 좀 알았으면 했어.',
    '이걸 몰랐어? 이건 좀 충격이다.',
    '좀 그렇다. 이건 알고 있을 줄 알았는데.',
    '기본도 안 되네. 어디서부터 다시 시작해야 하지.',
    '이건 좀. 이거 모르면 나중에 진짜 어려운 거 나왔을 때 어떡해.',
    '어떻게 이걸 몰라. 이건 교과서 첫 장이잖아.',
    '그것도 모르고 여기 들어온 거야? 용기는 인정해.',
    '좀 읽고 와. 뭐부터 읽어야 할지는 알려줄 수 있어.',
    '이거 진짜야? 이게 틀릴 줄은 몰랐어, 솔직히.',
    '기본이잖아, 이건. 근데 뭐, 이제 알았으니까 됐어.',
  ],
  wrong_mid: [
    '그건 뭐. 몰라도 크게 이상한 건 아니야.',
    '몰라도 크게 상관없긴 해. 이건 좀 마이너하거든.',
    '아직 거기까진 안 읽었구나. 그쪽 라인업이 좀 두꺼워서.',
    '그건 좀 어렵긴 해. 나도 처음엔 헷갈렸어.',
    '패스. 이건 알면 오히려 좀 특이한 거야.',
    '넘어가자. 이건 몰라도 인생에 지장 없어.',
    '그래, 그건 그냥 넘어가도 돼. 더 재밌는 거 많으니까.',
    '뭐, 이건 그럴 수 있어. 취향 문제이기도 하고.',
    '그 작품 안 봤구나. 나중에 시간 나면 봐, 괜찮아.',
    '괜찮아, 이건. 이걸 다 알면 그게 더 이상한 거야.',
    '그건 좀 마이너하긴 해. 알면 신기한 정도야.',
    '아직 거기까진. 뭐, 아직 앞에 볼 게 많은 거니까.',
  ],
  wrong_hard: [
    '그건 뭐 몰라도 돼. 진짜로, 이건 알 필요 없어.',
    '사실 나도 찾아봤어. 이게 정상이야.',
    '어려운 거야. 이거 맞히면 그게 더 신기한 거야.',
    '이건 몰라도 됨. 아는 사람이 오히려 좀 이상한 거야.',
    '그건 좀 마이너해. 팬덤 바깥에선 아무도 몰라.',
    '괜찮아. 이건 알아야 한다는 의무가 없거든.',
    '이건 나도 헷갈려. 솔직히 이거 자신 있는 사람 별로 없어.',
    '여기까지 알면 진짜 이상한 거야. 이건 칭찬이야.',
    '그건 아무도 몰라. 아는 척 하는 사람은 있어도.',
    '그건 너무 깊이 들어가는 거야. 거기까지는 나도 안 가봤어.',
    '뭐, 그건 패스. 이 정도는 모르는 게 정상이야.',
    '어려운 거 틀린 거니까 괜찮아. 쉬운 거 틀린 것보다 훨씬 나아.',
  ],
  streak_3: [
    '어, 계속 맞히네. 이거 진짜야?',
    '이거 진짜야? 혹시 전에 다 해봤어?',
    '오. 계속 오네. 멈추지 말고.',
    '슬슬 분위기 나는데. 이대로 가봐.',
    '연속이네. 운인지 실력인지 봐야 알겠어.',
  ],
  streak_5: [
    '이거 진짜 아는 거야? 찍는 거 아니지?',
    '멈추지 않네. 솔직히 좀 무서워지기 시작했어.',
    '좀 무서운데. 어디까지 가는 거야.',
    '이 페이스 실화야? 꺾일 줄 알았는데.',
    '아직도 맞히고 있어. 나 좀 긴장되기 시작했어.',
  ],
  streak_7: [
    '...인정하기 싫은데. 인정해야 할 것 같아.',
    '이 정도면 단골이야. 그냥 여기 살아.',
    '어, 진짜로? 이건 나도 예상 못 했어.',
    '할 말을 잃었어. 진심으로.',
    '이건 좀 전설인데. 기록해둘게.',
  ],
};

const KIN_REACTIONS_EN = {
  correct_easy: [
    "That's a given. If you didn't know this, we'd have a problem.",
    'Come on, basics. But hey, at least you got it.',
    'Right. You need to know this to even have a conversation about it.',
    'Obviously. But knowing the obvious matters more than people think.',
    'Oh, you knew that. Good. I had a moment of doubt there.',
    "At least the basics. Now let's see what else you've got.",
    'Well yeah. Not knowing this would actually be concerning.',
    "Thought you'd miss it. My bad, I underestimated you.",
    "That one you had to get. Anything else would've worried me.",
    "Of course. If you missed that one, we'd need to start from scratch.",
    'The most basic one. Getting confused here means later ones are brutal.',
    'Good. Glad you knew. I actually mean that.',
  ],
  correct_mid: [
    'Oh, you got it. Honestly a little surprising.',
    "You knew this? You've actually read it.",
    'You knew? More than I expected, honestly.',
    "Oh. You actually knew. That's something.",
    'Right. If you know this, calling it a hobby is underselling it.',
    'More than I expected. Maybe I judged too quickly.',
    "You know this one? This isn't common knowledge.",
    "You've read it. It shows in answers like this.",
    "Oh, you've seen it. You can only know this if you actually watched it.",
    'You knew that. How though, seriously.',
    "Not bad. I'll admit it, that's better than I thought.",
    'Really? Not many people know this one.',
  ],
  correct_hard: [
    'For real? This is a little scary. How do you know this.',
    "Oh, you know that too? At this point you're just a fan. The good kind.",
    'Impressive. The people who know this you can count on one hand.',
    'Someone actually knows this. I was genuinely not sure anyone would.',
    "Okay, that's something. I don't say this often but I'm impressed.",
    'You actually knew? Not looked it up, actually knew?',
    "I'll admit it. And I don't admit things easily.",
    "You know that too? We're in a different league now.",
    '...Right. I have nothing to add. Genuinely.',
    "That's a bit scary. How deep have you actually gone.",
    "You've actually read it. This kind of detail doesn't stick unless you did.",
    'You belong here. You could run this place, honestly.',
  ],
  wrong_easy: [
    "You don't know this. No, seriously, you don't know this?",
    'Seriously. How does that happen.',
    'You can leave. Joking. But this one I really needed you to get.',
    "You didn't know? I'm a little shocked, honestly.",
    "That's rough. I thought this one was safe.",
    "Can't even get the basics. Okay. We figure it out from here.",
    "That's something. If you miss this one, the later questions are going to hurt.",
    'How do you not know this. This is page one stuff.',
    'You walked in here not knowing that? Bold.',
    'Go read something. I can tell you where to start.',
    'Is this real? I genuinely did not expect to miss this one.',
    "That's like, the basics. But now you know. That counts for something.",
  ],
  wrong_mid: [
    "Whatever. This one's not really essential knowledge.",
    'Not a big deal. This is a bit niche anyway.',
    "Haven't gotten there yet. That series has a lot of ground to cover.",
    "That one's a bit tough. Confused me too, at first.",
    'Pass. Knowing this one is almost a bit much.',
    "Moving on. Missing this one won't affect your life.",
    "Yeah that one's fine to miss. There's more interesting stuff out there.",
    "That happens. This one's kind of a taste thing.",
    "Haven't seen that one. Worth watching though, when you get to it.",
    "It's okay. You'd have to know everything to get all of these.",
    "That's a bit niche. Knowing it is more of a party trick.",
    "Not there yet. Means there's still stuff to discover.",
  ],
  wrong_hard: [
    "That one doesn't matter. I mean it, you don't need to know this.",
    'I looked it up too, honestly. This is normal.',
    "It's hard. Getting this right would actually be the weird outcome.",
    'Fine to not know this. Knowing it would be stranger.',
    "That's pretty niche. No one outside the fandom knows this.",
    "It's okay. There's no obligation to know this one.",
    "Even I get confused on this. And I'm not admitting that lightly.",
    "Knowing this would be weird. That's a compliment.",
    'Nobody knows that. People pretend to, but nobody actually does.',
    "That's going too deep. Even I haven't gone that far.",
    'Pass on that one. Not knowing this is completely normal.',
    "It's hard, so it's fine. Missing an easy one is worse. Way worse.",
  ],
  streak_3: [
    'Oh, you keep getting them. Is this real?',
    'Is this real? Did you do this before?',
    "Oh. Keep going. Don't stop now.",
    'Starting to feel it. Keep this up.',
    "Back to back. Luck or skill, we'll see.",
  ],
  streak_5: [
    "Do you actually know this? You're not guessing, right?",
    "You're not stopping. Honestly starting to get a little scary.",
    'Getting a bit scary. How far does this go.',
    "This pace is real? Thought you'd slip by now.",
    "Still going. I'm getting nervous, honestly.",
  ],
  streak_7: [
    "...I don't want to admit it. But I have to.",
    "You're a regular. You might as well just live here.",
    "Oh, for real? Even I didn't see this coming.",
    "I'm speechless. Genuinely.",
    "This is kind of legendary. I'm saving this.",
  ],
};

export function pickRxn(key) {
  const pool = getLang() === 'ko' ? KIN_REACTIONS[key] : KIN_REACTIONS_EN[key];
  return pool[Math.floor(Math.random() * pool.length)];
}
export function getRxn(isCorrect, difficulty) {
  return pickRxn(`${isCorrect ? 'correct' : 'wrong'}_${difficulty}`);
}
export function getStreakRxn(n) {
  return pickRxn(n >= 7 ? 'streak_7' : n >= 5 ? 'streak_5' : 'streak_3');
}

// ── 결과 패턴 ──
const RESULT_LABELS = {
  ko: {
    perfect: '만화방 단골',
    zero: '용기 있는 입문자',
    hard_easy_gap: '이상한 덕후',
    major_only: '유명작 생존자',
    outlier_strong: '소거법의 달인',
    one_work: '원작 충성파',
    author_strong: '작가 추종형',
    relation_strong: '커플링형',
    easy_only: '입문 완료',
    all_high: '생각보다 진짜 본 사람',
    all_low: '입문자',
    random: '무작위 독자',
  },
  en: {
    perfect: 'Manga cafe regular',
    zero: 'Brave beginner',
    hard_easy_gap: 'Oddly specific fan',
    major_only: 'Mainstream survivor',
    outlier_strong: 'Process of elimination',
    one_work: 'Loyal to one',
    author_strong: 'Author follower',
    relation_strong: 'Shipping everything',
    easy_only: 'Intro complete',
    all_high: 'Actually watched it',
    all_low: 'Just starting out',
    random: 'Random reader',
  },
};

export function getLabel(pattern) {
  return (
    (getLang() === 'ko' ? RESULT_LABELS.ko : RESULT_LABELS.en)[pattern] ||
    (getLang() === 'ko' ? '무작위 독자' : 'Random reader')
  );
}

const OBS = {
  ko: {
    perfect: [
      '인정. 근데 솔직히 좀 무서워. 이걸 다 어떻게 알아.',
      '다 맞혔어. 말은 안 하겠는데, 얼마나 읽은 거야.',
      '만화방 단골 맞네. 다음엔 진짜 어렵게 낼게.',
    ],
    zero: [
      '이건 좀 대단하다. 하나도 안 맞히려면 오히려 알아야 해.',
      '전부 틀렸어. 이건 진짜 처음인 거야. 어디서부터 시작할지 알려줄까.',
      '0점이야. 근데 여기까지 온 것만으로도 뭔가 있는 거야. 아마도.',
    ],
    hard_easy_gap: [
      '마이너는 꿰고 있는데 기본을 틀렸어. 근데 이런 사람 주변에 꼭 한 명씩은 있더라.',
      '어려운 건 맞히고 쉬운 걸 틀렸어. 설명하기 어려운 타입이야.',
      '기본은 모르는데 마이너는 알아. 어떻게 읽은 거야, 솔직히.',
    ],
    major_only: [
      '유명한 건 다 알고 있구나. 근데 딱 거기까지네. 그것도 나쁘진 않아.',
      '메이저는 완벽한데 그 밖으로는 안 나갔구나. 안전하게 읽는 타입이야.',
      '검증된 것만 읽는 거지. 솔직히 그게 제일 현명한 방법이긴 해.',
    ],
    outlier_strong: [
      '읽지도 않았는데 맞혔어. 솔직히 이게 더 재능 있는 거 맞아.',
      '소거법으로 다 맞혔구나. 읽은 것보다 안 읽은 게 더 많은 타입.',
      '어떻게 알았어, 이거. 느낌으로 맞힌 거지. 그 느낌이 꽤 정확하더라.',
    ],
    one_work: [
      '한 작품에 이 정도면 팬이라고 부르기도 애매해. 그냥 그 작품이 너야.',
      '한 작품에 올인했구나. 나머지는 관심 없는 거고, 그것도 방식이야.',
      '이건 그냥 덕후네. 좋게 말하는 거야.',
    ],
    author_strong: [
      '작품보다 만든 사람에 관심 있구나. 덕질 방향이 좀 독특해.',
      '작가를 따라가는 타입이야. 신작 소식에 제일 먼저 반응하는 사람.',
      '작품 좋아하는 게 아니라 작가 좋아하는 거네. 미묘하게 달라.',
    ],
    relation_strong: [
      '스토리는 기억 안 나는데 누가 누구 스승인지는 알고 있어.',
      '설정보다 관계에 집착하는 타입이야. 커플링에 진심인 거 맞지.',
      '스토리는 흐릿한데 인간관계는 선명하게 기억하네.',
    ],
    easy_only: [
      '기본기는 확실하네. 근데 딱 교과서까지야. 교과서 밖으로 나갈 생각은 없어?',
      '쉬운 건 다 맞혔어. 이제 한 단계만 더 들어가 봐. 생각보다 재밌을 거야.',
      '입문은 완벽하게 했구나. 다음 단계가 사실 더 재밌어.',
    ],
    all_high: [
      '두루두루 읽었네. 취향이 없는 건지 다 있는 건지. 아마 다 있는 쪽일 거야.',
      '골고루 다 알고 있어. 편식 없이 읽는 타입이야.',
      '장르 안 가리고 읽었구나. 같이 만화방 가면 제일 오래 있는 타입.',
    ],
    all_low: [
      '처음 온 거지. 괜찮아, 어디서든 시작은 있으니까. 근데 진짜로 한 편만 읽고 다시 와봐.',
      '많이 안 읽었구나. 아직 취향도 없는 거야. 그거 찾는 게 사실 제일 재밌어.',
      '지금이 제일 부러운 시점이야. 처음 읽을 작품이 아직 이렇게 많으니까.',
    ],
    random: [
      '뭘 읽은 건지 패턴이 없어. 손에 잡히는 대로 읽은 거구나. 그것도 나름 방식이야.',
      '일관성은 없는데 범위는 넓어. 계획 없이 읽는 타입이야.',
      '어떤 기준으로 읽은 건지 모르겠어. 기준이 없는 게 기준인 거지.',
    ],
  },
  en: {
    perfect: [
      'Okay. But honestly a little scary. How do you know all this.',
      'You got everything. How much have you read.',
      "You belong here. Next time I'm making it harder.",
    ],
    zero: [
      "That's impressive in a way. To miss everything you'd almost have to try.",
      'Everything wrong. Want me to tell you where to start?',
      "Zero. But the fact you're here means something. Probably.",
    ],
    hard_easy_gap: [
      "You know the obscure stuff but missed the basics. There's always one person like this.",
      'Got the hard ones, missed the easy ones. Hard to explain that.',
      "Don't know the basics but know the niche stuff. How'd you even read it.",
    ],
    major_only: [
      "You know the big names. And that's it. That's not nothing though.",
      'Perfect on the majors, nothing beyond that. You read safe.',
      'Sticking to the classics. Honestly the most sensible approach.',
    ],
    outlier_strong: [
      "You guessed it without even reading it. That's honestly a skill.",
      'All by elimination. More unread than read, probably.',
      "How'd you know. Felt it, right. That instinct's not bad.",
    ],
    one_work: [
      'At this point calling you a fan is an understatement.',
      "All in on one work. The rest doesn't matter to you.",
      "You're just a hardcore fan. I mean that in the best way.",
    ],
    author_strong: [
      "More interested in the creator than the work. That's a specific way to read.",
      'You follow the author. First to react to new releases.',
      "You don't love the work, you love the person who made it.",
    ],
    relation_strong: [
      "Don't remember the story but you know who trained who.",
      "More obsessed with connections than plot. Shipping things, aren't you.",
      "Story's fuzzy but you remember every relationship clearly.",
    ],
    easy_only: [
      "Solid fundamentals. But that's where it stops. Ready to go deeper?",
      "Got all the easy ones. Just one level further. More interesting than you'd think.",
      'Perfect intro. The next level is actually where it gets good.',
    ],
    all_high: [
      "You've read widely. Either no taste or all taste. Probably all taste.",
      'Even across everything. You read without bias.',
      "No genre preference. You'd be the last one to leave a manga cafe.",
    ],
    all_low: [
      "First time here. That's fine. Read one thing and come back.",
      "You haven't read much yet. Finding your taste is the best part.",
      'This is the best moment to be you. So many first reads still ahead.',
    ],
    random: [
      "No pattern here. You read whatever you grabbed. That's a style.",
      'No consistency but wide range. Unplanned reader.',
      'No idea what the criteria was. No criteria is the criteria.',
    ],
  },
};

export function getObs(pattern, idx) {
  const pool = OBS[getLang()][pattern] || OBS[getLang()].random;
  const i = idx !== undefined && idx < pool.length ? idx : Math.floor(Math.random() * pool.length);
  return { text: pool[i], idx: i };
}

export const REPLAY_HINTS = {
  ko: {
    perfect: '다음엔 더 어렵게 낼게.',
    all_low: '한 편만 보고 다시 와봐.',
    easy_only: '이제 hard 문제만 모아서 줄까?',
    all_high: '레이블이 바뀔 수도 있어. 다시 해봐.',
    random: '패턴 없이 나왔어. 다시 하면 다르게 나올 거야.',
  },
  en: {
    perfect: 'Next time I go harder.',
    all_low: 'Read one series and come back.',
    easy_only: 'Want only hard questions next time?',
    all_high: 'Your label might change. Try again.',
    random: 'No pattern yet. Another round might tell a different story.',
  },
};

export function getReplayHint(pattern) {
  const map = getLang() === 'ko' ? REPLAY_HINTS.ko : REPLAY_HINTS.en;
  return (
    map[pattern] || (getLang() === 'ko' ? '레이블이 바뀔 수도 있어.' : 'Your label might change.')
  );
}

export function detectPattern(answers) {
  const score = answers.filter((a) => a.is_correct).length;
  if (score === 10) return 'perfect';
  if (score === 0) return 'zero';
  const byDiff = (d) => answers.filter((a) => a.difficulty === d);
  const rate = (d) => {
    const g = byDiff(d);
    return g.length ? g.filter((a) => a.is_correct).length / g.length : 0;
  };
  const easyR = rate('easy'),
    midR = rate('mid'),
    hardR = rate('hard'),
    totalR = score / 10;
  const byFmt = (f) => answers.filter((a) => a.format === f);
  const frate = (f) => {
    const g = byFmt(f);
    return g.length ? g.filter((a) => a.is_correct).length / g.length : 0;
  };
  const sc = {
    hard_easy_gap: hardR - easyR,
    major_only: (easyR - hardR) * 0.6 + (midR - hardR) * 0.4,
    outlier_strong: frate('outlier') - totalR,
    author_strong: frate('author') - totalR,
    relation_strong: frate('relation') - totalR,
    easy_only: (easyR - midR) * 0.5 + (easyR - hardR) * 0.5,
    all_high: totalR >= 0.78 ? totalR : 0,
    all_low: totalR <= 0.32 ? 0.32 - totalR : 0,
  };
  const wc = {};
  answers.forEach((a) => {
    const w = a.source_work || '?';
    if (!wc[w]) wc[w] = { total: 0, correct: 0 };
    wc[w].total++;
    if (a.is_correct) wc[w].correct++;
  });
  const mw = Object.values(wc).reduce(
    (b, w) => (w.total >= 3 && w.correct / w.total > b.correct / Math.max(b.total, 1) ? w : b),
    { total: 0, correct: 0 }
  );
  const otherR = score > 0 ? (score - mw.correct) / Math.max(10 - mw.total, 1) : 0;
  sc.one_work = mw.total >= 3 && mw.correct / mw.total >= 0.9 && otherR < 0.4 ? 0.8 : 0;
  const best = Object.entries(sc)
    .filter(([, v]) => v >= 0.2)
    .sort(([, a], [, b]) => b - a)[0];
  return best ? best[0] : 'random';
}
