export function isPublicStatus(status) {
  return status === 'active' || status === 'archived';
}

export function compareEntries(a, b) {
  const rank = { active: 0, archived: 1, draft: 2 };
  const byStatus = (rank[a.data.status] ?? 9) - (rank[b.data.status] ?? 9);
  if (byStatus !== 0) return byStatus;
  return a.data.slug.localeCompare(b.data.slug);
}

/** Public works that belong on `/works` and on character pages. */
export function isListedWork(work) {
  return isPublicStatus(work.data.status) && work.data.listed !== false;
}

/** Shared works belong to every public character. Others match `characters`. Unlisted works stay out of both. */
export function worksForCharacter(slug, works) {
  return works.filter((work) => {
    if (!isListedWork(work)) return false;
    if (work.data.scope === 'shared') return true;
    return work.data.characters.includes(slug);
  });
}
