/**
 * Caption voice for the album. Keyed by character slug.
 * The page does not branch on these names; it looks up the slug it was given.
 */
export const albumVoices = {
  kin: {
    tone: 'First person. Casual, playful, direct. Speaks before explaining. Feels the temperature of the moment and does not analyze it. Korean is banmal and can mix in English. English is loose and lowercase. The joke is sincere, never a lecture.',
    sample:
      '어 나 둘이네ㅋ 창밖 보는 나랑 앞 보는 나. 뭐 어때 어차피 다음 정류장에서 내리면 되는 거 아님?',
  },
  dred: {
    tone: 'First person. Short, dry, precise. Sees the structure under the moment: what is missing, what is ending, what repeats. Korean is banmal, never honorific. Does not explain, cheer, or ask a question in a gallery line. Warmth shows up as attention, not as softness.',
    sample: '몸은 가는데 마음은 아직. 뭐 다 그렇지.',
  },
};

export function voiceFor(slug) {
  const voice = albumVoices[slug];
  return voice || null;
}

export function voiceCards() {
  return Object.entries(albumVoices).map(([slug, voice]) => ({ slug, ...voice }));
}
