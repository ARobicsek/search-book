export function normalizeCompanyName(name: string): string {
  if (!name) return '';
  // Remove zero-width spaces, joiners, non-breaking spaces, etc.
  // Then trim and lowercase. This ensures robust string matching
  // when handling text extracted by AI models from LinkedIn.
  return name.replace(/[\u200B-\u200D\uFEFF\u00A0]/g, '').toLowerCase().trim();
}
