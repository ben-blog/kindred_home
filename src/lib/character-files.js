const modules = import.meta.glob('../content/characters/*.json', {
  eager: true,
  import: 'default',
});

/** Character files bundled into the server function. Adding a file is enough. */
export function characterRecords() {
  return Object.values(modules)
    .map((record) => {
      if (record && typeof record === 'object' && typeof record.slug === 'string') return record;
      if (record && typeof record === 'object' && record.default?.slug) return record.default;
      return null;
    })
    .filter(Boolean);
}
