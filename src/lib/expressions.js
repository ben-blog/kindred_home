import { expressionEmotions } from '../../world/schema.js';

const TAGS = [
  { emotion: 'joy', pattern: /기뻐|신나|활짝|미소|웃|happy|smile|grin|laugh|bright|excited/i },
  { emotion: 'playful', pattern: /장난|ㅋㅋ|wink|playful|teas|mischief/i },
  { emotion: 'shy', pattern: /부끄|수줍|민망|shy|blush|fluster/i },
  { emotion: 'sad', pattern: /슬프|눈물|외로|쓸쓸|sad|tear|lonely|melanchol/i },
  { emotion: 'intense', pattern: /강렬|노려|예리|충격|intense|glare|stare|fierce|sharp/i },
  { emotion: 'tired', pattern: /피곤|졸|지친|tired|sleepy|exhausted|yawn/i },
  { emotion: 'calm', pattern: /차분|고요|무표정|calm|quiet|still|soft|peace/i },
];

const PORTRAIT =
  /portrait|close-up|close up|face|expression|gaze|eyes|looking|얼굴|표정|눈빛|시선|정면/i;
const ABSENT = /character-absent|absent scene|is gone|없는|없는데|부재|empty seat/i;

/** Editable first pass. A later still can replace `src` without a code change. */
export function suggestFrame(image) {
  const blob = flatten(image);
  const emotions = [];
  for (const tag of TAGS) {
    if (tag.pattern.test(blob) && !emotions.includes(tag.emotion)) emotions.push(tag.emotion);
  }
  if (emotions.length === 0) emotions.push('calm');
  const id = typeof image?.id === 'string' ? image.id : '';
  const filename = typeof image?.filename === 'string' ? image.filename : '';
  const portrait =
    !ABSENT.test(blob) && (PORTRAIT.test(blob) || /portrait/i.test(`${id} ${filename}`));
  return {
    id,
    emotions: emotions.filter((emotion) => expressionEmotions.includes(emotion)).slice(0, 3),
    portrait,
  };
}

export function suggestFrames(gallery) {
  const images = Array.isArray(gallery?.images) ? gallery.images : [];
  return images
    .filter((image) => image && image.is_active !== false && image.id && image.filename)
    .slice()
    .sort((a, b) => (a.order_num ?? 0) - (b.order_num ?? 0))
    .map((image) => suggestFrame(image));
}

/**
 * Join an expression file to a gallery. `frame.src` wins, so a generated still
 * dropped into the file is used without a code change.
 */
export function callFrames(gallery, expression) {
  const images = new Map();
  for (const image of gallery?.images ?? []) {
    if (!image || image.is_active === false || !image.id || !image.filename) continue;
    images.set(image.id, image);
  }
  const frames = [];
  for (const frame of expression?.frames ?? []) {
    const image = images.get(frame.id);
    const src = frame.src || (image ? `/assets/gallery/${image.filename}` : '');
    if (!src.startsWith('/')) continue;
    const title = image?.en?.title || image?.ko?.title || '';
    frames.push({
      id: frame.id,
      src,
      emotions: frame.emotions.filter((emotion) => expressionEmotions.includes(emotion)),
      portrait: frame.portrait === true,
      title: typeof title === 'string' ? title : '',
    });
  }
  return frames.filter((frame) => frame.emotions.length > 0);
}

/** Portraits tagged with the emotion, then any tagged frame, then any portrait. */
export function poolFor(frames, emotion) {
  const list = Array.isArray(frames) ? frames : [];
  const tagged = list.filter((frame) => frame.emotions?.includes(emotion));
  const portraits = tagged.filter((frame) => frame.portrait);
  if (portraits.length > 0) return portraits;
  if (tagged.length > 0) return tagged;
  const anyPortrait = list.filter((frame) => frame.portrait);
  if (anyPortrait.length > 0) return anyPortrait;
  return list;
}

export function openingFrame(frames) {
  const calm = poolFor(frames, 'calm');
  return calm[0] ?? frames[0] ?? null;
}

function flatten(image) {
  const parts = [];
  const walk = (value) => {
    if (typeof value === 'string') parts.push(value);
    else if (Array.isArray(value)) value.forEach(walk);
    else if (value && typeof value === 'object') Object.values(value).forEach(walk);
  };
  walk(image?.en);
  walk(image?.ko);
  walk(image?.tags);
  walk(image?.style);
  return parts.join('\n');
}
