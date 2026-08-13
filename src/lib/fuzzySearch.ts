/**
 * KeyFlow Lightweight Typo-Tolerant Fuzzy Search Engine
 * Zero external dependencies. Fast edit-distance and token-similarity scoring.
 */

import { SETTINGS_INDEX, type SettingSearchItem } from "./settingsIndex";

export interface SearchResult {
  item: SettingSearchItem;
  score: number;
}

/**
 * Calculates Levenshtein edit distance between strings `a` and `b`.
 */
function editDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;

  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,      // deletion
        dp[i][j - 1] + 1,      // insertion
        dp[i - 1][j - 1] + cost // substitution
      );
    }
  }
  return dp[m][n];
}

/**
 * Normalizes string by trimming, converting to lowercase, and stripping punctuation.
 */
function normalize(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

/**
 * Searches the settings index with fuzzy typo tolerance.
 * Returns up to `maxResults` matching settings sorted by relevance score.
 */
export function searchSettings(query: string, maxResults = 8): SearchResult[] {
  const q = normalize(query);
  if (!q) return [];

  const qTokens = q.split(" ").filter(Boolean);

  const results: SearchResult[] = [];

  for (const item of SETTINGS_INDEX) {
    const titleNorm = normalize(item.title);
    const descNorm = normalize(item.description);
    const catNorm = normalize(item.categoryLabel);
    const keywordsNorm = (item.keywords ?? []).map(normalize);
    const synonymsNorm = (item.synonyms ?? []).map(normalize);

    let score = 0;

    // 1. Exact title match
    if (titleNorm === q) {
      score += 1000;
    }
    // 2. Title starts with query
    else if (titleNorm.startsWith(q)) {
      score += 800;
    }
    // 3. Title contains whole query as substring
    else if (titleNorm.includes(q)) {
      score += 650;
    }

    // 4. Token matches in title
    for (const qToken of qTokens) {
      if (titleNorm.includes(qToken)) {
        score += 300;
      }
      if (catNorm.includes(qToken)) {
        score += 150;
      }
    }

    // 5. Keyword & Synonym matches
    for (const kw of keywordsNorm) {
      if (kw === q || kw.includes(q)) {
        score += 450;
      } else {
        for (const qToken of qTokens) {
          if (kw.includes(qToken)) score += 200;
        }
      }
    }

    for (const syn of synonymsNorm) {
      if (syn === q || syn.includes(q)) {
        score += 400;
      } else {
        for (const qToken of qTokens) {
          if (syn.includes(qToken)) score += 180;
        }
      }
    }

    // 6. Description matches
    if (descNorm.includes(q)) {
      score += 250;
    }

    // 7. Typo / Edit Distance scoring
    // Check edit distance between query token and words in title / keywords
    const titleWords = titleNorm.split(" ");
    const candidateWords = [...titleWords, ...keywordsNorm, ...synonymsNorm];

    for (const qToken of qTokens) {
      if (qToken.length < 3) continue; // Skip tiny tokens for edit distance

      for (const word of candidateWords) {
        if (word.length < 3) continue;
        const dist = editDistance(qToken, word);
        const maxLen = Math.max(qToken.length, word.length);
        const similarity = 1 - dist / maxLen;

        // Allow up to 2 typos for medium words, 3 for long words
        if (dist <= (qToken.length > 6 ? 3 : 2) && similarity >= 0.55) {
          const typoScore = Math.round(350 * similarity);
          if (typoScore > score) {
            score = typoScore;
          }
        }
      }
    }

    if (score > 120) {
      results.push({ item, score });
    }
  }

  // Sort descending by score
  results.sort((a, b) => b.score - a.score);

  return results.slice(0, maxResults);
}
