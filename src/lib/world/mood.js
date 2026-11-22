import { expressionEmotions } from '../../../world/schema.js';

/** Labels the agents already put on a finished reply. Unknown labels are ignored. */
const AGENT_LABELS = {
  laughing: 'playful',
  amused: 'playful',
  happy: 'joy',
  excited: 'joy',
  energetic: 'joy',
  interested: 'playful',
  flustered: 'shy',
  shocked: 'intense',
  surprised: 'intense',
  serious: 'intense',
  sad: 'sad',
  thinking: 'calm',
  calm: 'calm',
  speaking: 'calm',
  default: null,
};

const TEXT_RULES = [
  { emotion: 'shy', pattern: /부끄|수줍|민망|shy|blush|fluster|embarrass/i },
  { emotion: 'sad', pattern: /슬프|눈물|외로|안타깝|sad|sorry|lonely|tear|melanchol/i },
  { emotion: 'tired', pattern: /피곤|졸려|지쳤|지침|tired|sleepy|exhausted|yawn/i },
  { emotion: 'intense', pattern: /강렬|노려|충격|설마|대박|intense|shock|glare|stare|wow|!{2,}/i },
  { emotion: 'playful', pattern: /장난|ㅋㅋ|하하|웃|lol|haha|playful|teas|wink/i },
  { emotion: 'joy', pattern: /기뻐|신나|좋아|미소|happy|great|love|nice|smile|glad/i },
  { emotion: 'calm', pattern: /차분|고요|무표정|괜찮|calm|quiet|still/i },
];

const AROUSED = new Set(['joy', 'playful', 'intense']);

export function mapAgentLabel(label) {
  if (typeof label !== 'string') return null;
  const key = label.trim().toLowerCase();
  if (!Object.hasOwn(AGENT_LABELS, key)) return null;
  return AGENT_LABELS[key];
}

/** First matching rule. No match means the caller decides the fallback. */
export function classifyText(text) {
  if (typeof text !== 'string' || !text.trim()) return null;
  for (const rule of TEXT_RULES) {
    if (rule.pattern.test(text)) return rule.emotion;
  }
  return null;
}

/**
 * One expression for a finished reply.
 * A specific agent label wins. A bland one (`calm`, `speaking`) yields to the text.
 * Energy at or below 2 leans tired unless the reply is already high. Mood at or below 1
 * turns a calm reply sad. Numbers come from the public world snapshot.
 */
export function resolveExpression({ text = '', agentLabel, energy, mood } = {}) {
  const fromAgent = mapAgentLabel(agentLabel);
  const fromText = classifyText(text);
  let emotion = fromAgent && fromAgent !== 'calm' ? fromAgent : fromText || fromAgent || 'calm';
  if (!expressionEmotions.includes(emotion)) emotion = 'calm';
  const energyNumber = typeof energy === 'number' && Number.isFinite(energy) ? energy : null;
  const moodNumber = typeof mood === 'number' && Number.isFinite(mood) ? mood : null;
  if (energyNumber != null && energyNumber <= 2 && !AROUSED.has(emotion)) emotion = 'tired';
  if (moodNumber != null && moodNumber <= 1 && emotion === 'calm') emotion = 'sad';
  return emotion;
}
