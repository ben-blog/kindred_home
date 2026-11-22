export function isPublicStatus(status) {
  return status === 'active' || status === 'archived';
}

export function compareEntries(a, b) {
  const rank = { active: 0, archived: 1, draft: 2 };
  const byStatus = (rank[a.data.status] ?? 9) - (rank[b.data.status] ?? 9);
  if (byStatus !== 0) return byStatus;
  return a.data.slug.localeCompare(b.data.slug);
}

/** Shared works belong to every public character. Others match `characters`. */
export function worksForCharacter(slug, works) {
  return works.filter((work) => {
    if (!isPublicStatus(work.data.status)) return false;
    if (work.data.scope === 'shared') return true;
    return work.data.characters.includes(slug);
  });
}
