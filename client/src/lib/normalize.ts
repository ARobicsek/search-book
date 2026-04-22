export function normalizeCompanyName(name: string): string {
  if (!name) return '';
  // Remove zero-width spaces, joiners, non-breaking spaces, etc.
  // Then trim and lowercase. This ensures robust string matching
  // when handling text extracted by AI models from LinkedIn.
  return name.replace(/[​-‍﻿ ]/g, '').toLowerCase().trim();
}

// Mirror of server's `normalizeCompanyNameForDedupe` (server/src/routes/duplicates.ts).
// Strips legal suffixes ("Inc.", "LLC", "Corp.", etc.) so "Foundation Medicine" and
// "Foundation Medicine, Inc." resolve to the same canonical key. Use this for the
// LinkedIn import path where the AI may emit either form.
export function normalizeCompanyNameForDedupe(name: string): string {
  if (!name) return '';
  let n = name.replace(/[​-‍﻿ ]/g, '').trim();
  n = n.replace(/,(?=\s*(Inc\.?|LLC|Corp\.?|Corporation|Ltd\.?|Limited|Co\.?|Company|L\.L\.C\.|L\.P\.)$)/gi, '');
  const suffixPattern = /\s+(Inc\.?|LLC|Corp\.?|Corporation|Ltd\.?|Limited|Co\.?|Company|L\.L\.C\.|L\.P\.)\s*$/gi;
  n = n.replace(suffixPattern, '');
  return n.toLowerCase().replace(/\s+/g, ' ').trim();
}
