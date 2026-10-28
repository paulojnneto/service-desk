// Text for the help center search: lowercase, without accents, letters and digits only,
// so "horario" finds "horário" and the same words match in PostgreSQL and PGlite.

const STOP_WORDS = new Set([
  "a",
  "as",
  "o",
  "os",
  "e",
  "de",
  "da",
  "das",
  "do",
  "dos",
  "em",
  "no",
  "na",
  "nos",
  "nas",
  "um",
  "uma",
  "que",
  "com",
  "para",
  "por",
  "meu",
  "minha",
  "nao",
  "se",
  "ao",
  "esta",
  "tem",
]);

export function normalizeText(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

// A full-text query that matches any of the meaningful words: long questions stay useful.
export function toSearchQuery(question: string): string | null {
  const words = [...new Set(normalizeText(question).split(" "))].filter(
    (word) => word.length > 1 && !STOP_WORDS.has(word),
  );
  return words.length > 0 ? words.join(" | ") : null;
}

export function articleSearchText(article: { title: string; body: string }): string {
  return normalizeText(`${article.title} ${article.body}`);
}
