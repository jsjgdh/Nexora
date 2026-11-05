/* The product's copy rules, as one table of patterns.
 *
 * The rules live here, away from the walk that finds the strings, so the rules
 * can be tested on their own. `scripts/copy-rules.test.ts` drives this module
 * over a list of known-good and known-bad strings and asserts what each rule
 * does and does not fire on. A rule that cannot be shown on a fixture does not
 * belong in this table.
 *
 * Every rule here is decidable from the string alone, or from the string and
 * the file it came from. Two of the product's rules are not, and they are not
 * here: "one label per intent" needs to know which two controls mean the same
 * action, and "no marketing voice" needs a reader. What this table can do is
 * decide the words, the punctuation and the constructions that carry the voice.
 * The checker's own report says which rules it decided and which it left to a
 * person.
 *
 * Nothing in this file is scanned by the checker. The words below are patterns
 * to look for, not copy, and a rule that flagged its own table would be
 * useless. */

/** The em dash and the en dash, by code point. */
export const EM_DASH = "\u2014";
export const EN_DASH = "\u2013";

/**
 * The one primary call to action.
 *
 * The label is release-aware in the product (`release.label`), so the two
 * spellings are the two states of the world, not two marketing variants. The
 * retired sales phrase is still caught below, because it must not come back
 * over a build that does not exist.
 */
export const CTA_LABEL = "Download the IDE";
export const CTA_LABELS: readonly string[] = [CTA_LABEL, "Get the IDE when it ships"];

/**
 * The words the product refuses.
 *
 * Each entry is a word and the pattern that finds it. The patterns are
 * case-insensitive and match on word boundaries, so "mastered" is found by
 * "master" and "unlocks" is found by "unlock". Two entries need a note:
 *
 *   - "journey" is refused as a marketing word, not as a noun. A page may say
 *     that a build journey is the sequence of steps, and a lesson may say
 *     that an error travels on a journey. What is refused is the promotional
 *     use, so the pattern only fires on the constructions that sell something.
 *   - "let's go" is listed before "let's" so that the longer phrase is the one
 *     reported.
 */
export const REFUSED_WORDS: { word: string; re: RegExp }[] = [
  { word: "let's go", re: /\blet['\u2019]s\s+go\b/i },
  { word: "let's", re: /\blet['\u2019]s\b/i },
  { word: "exciting", re: /\bexciting\b/i },
  { word: "amazing", re: /\bamazing\b/i },
  { word: "powerful", re: /\bpowerful\b/i },
  { word: "seamless", re: /\bseamless(?:ly)?\b/i },
  { word: "robust", re: /\brobust(?:ly|ness)?\b/i },
  { word: "dive in", re: /\bdive\s+in\b/i },
  { word: "unlock", re: /\bunlock(?:s|ed|ing)?\b/i },
  {
    word: "journey (marketing)",
    re: /(?:\b(?:your|our|their)\s+journey\b|\bjourney\s+(?:to|toward|towards|of|ahead)\b|\b(?:start|begin|embark|set\s+off)\w*\s+(?:on\s+)?(?:a|your|the)?\s*journey\b)/i,
  },
  { word: "level up", re: /\blevel[\s-]?up\b/i },
  { word: "master", re: /\bmaster\w*/i },
  { word: "crush it", re: /\bcrush\s+it\b/i },
  { word: "supercharge", re: /\bsupercharg\w*/i },
];

/**
 * The constructions that carry a marketing voice.
 *
 * A product sentence can be second person and still be plain: "sign in to
 * continue" is an instruction, not a claim. What is refused here is the
 * congratulation, the promise of a feeling, and the filler that opens a
 * sales page. Each pattern names one construction, so a hit says which one
 * fired.
 */
export const MARKETING_VOICES: { id: string; re: RegExp; note: string }[] = [
  { id: "congratulation", re: /\bcongratulat\w*\b/i, note: "congratulates the reader" },
  { id: "celebratory-welcome", re: /\bwelcome\s+to\b/i, note: "celebratory welcome" },
  {
    id: "hype-second-person",
    re: /\byou(?:'ll|\s+will|'re|\s+are)\s+(?:be\s+|really\s+|absolutely\s+|truly\s+)?(?:amazed|astonished|blown\s+away|impressed|thrilled|excited|delighted|in\s+love|love\s+it|enjoy|obsessed)\b/i,
    note: "promises the reader a feeling",
  },
  {
    id: "hype-imagine",
    re: /(?:^|[.!?]\s+)imagine\s+(?:a|an|the|your|how|what|where|why|when|if|that)\b/i,
    note: "opens on imagination",
  },
  { id: "hype-get-ready", re: /\bget\s+ready\b/i, note: "opens on a performance" },
  {
    id: "hype-brace",
    re: /\b(?:buckle\s+up|brace\s+yourself|hold\s+on\s+tight)\b/i,
    note: "opens on a performance",
  },
  { id: "hype-you-deserve", re: /\byou\s+deserve\b/i, note: "flatters the reader" },
  {
    id: "hype-ready-to",
    re: /\bready\s+to\s+(?:start|dive|go|begin|rock|shine)\b/i,
    note: "opens on a performance",
  },
  {
    id: "hype-superlative",
    re: /\b(?:world[-\s]class|cutting[-\s]edge|state[-\s]of[-\s]the[-\s]art|game[-\s]changing|revolutionary|next[-\s]generation|best[-\s]in[-\s]class)\b/i,
    note: "claims a superlative",
  },
  {
    id: "hype-your-success",
    re: /\byour\s+(?:success|dream|potential)\b/i,
    note: "sells an outcome to the reader",
  },
  { id: "hype-join-us", re: /\bjoin\s+(?:us|thousands)\b/i, note: "asks the reader to join" },
  {
    id: "hype-used-by",
    re: /\bused\s+by\s+(?:thousands|millions|teams|companies|developers)\b/i,
    note: "quotes an audience size",
  },
  {
    id: "hype-guarantee",
    re: /\b(?:100\s*%\s*satisfaction|satisfaction\s+guaranteed|guaranteed\s+results?|guaranteed\s+to\s+work|no\s+risk)\b/i,
    note: "promises a result",
  },
  {
    id: "hype-love",
    re: /\b(?:you(?:'ll|\s+will|'re)\s+love|we\s+love\s+(?:that|it|how))\b/i,
    note: "speaks for the reader",
  },
];

/**
 * The emoji test.
 *
 * `Emoji_Presentation` is the set of characters that are drawn as an emoji on
 * their own. The symbols the product uses as marks, such as the star, the
 * tick and the chevron, are not in it, so a rating row is not an emoji row.
 * The variation selector is counted only after a character that can be drawn
 * either way.
 */
export const EMOJI_RE =
  /(?:\p{Emoji_Presentation}|[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}]\uFE0F)/u;

/** The rules this module decides, with the id the report groups by. */
export const RULES = [
  { id: "no-dash", name: "no em dash and no en dash", kind: "text" },
  { id: "no-exclamation", name: "no exclamation mark", kind: "text" },
  { id: "no-emoji", name: "no emoji", kind: "text" },
  { id: "no-banned-word", name: "none of the refused words", kind: "text" },
  { id: "no-marketing-voice", name: "no marketing voice", kind: "text" },
  { id: "one-label-per-intent", name: "one label per intent", kind: "cross-string" },
  { id: "cta-once", name: "one primary call to action per surface", kind: "cross-string" },
];

/** A violation, with the place in the string that caused it. */
export type Violation = {
  rule: string;
  detail: string;
  match: string;
  index: number;
};

/**
 * True when the text after a mark starts a new sentence.
 *
 * A sentence starts with a capital letter or with nothing at all. A word in
 * lower case after the mark means the mark was part of the word before it.
 */
export function closesSentence(text: string, after: number): boolean {
  const rest = text.slice(after).replace(/^\s+/, "");
  if (rest.length === 0) return true;
  const first = rest[0]!;
  return first === first.toUpperCase();
}

/**
 * Check one string.
 *
 * The string is what a learner or a reader sees, so every rule that can be
 * decided from the string is decided here.
 */
export function checkText(text: string): Violation[] {
  const found: Violation[] = [];
  if (typeof text !== "string" || text.length === 0) return found;

  const em = text.indexOf(EM_DASH);
  const en = text.indexOf(EN_DASH);
  if (em !== -1 || en !== -1) {
    found.push({
      rule: "no-dash",
      detail: em !== -1 ? "em dash" : "en dash",
      match: em !== -1 ? EM_DASH : EN_DASH,
      index: em !== -1 ? em : en,
    });
  }

  // An exclamation mark is one that closes an exclamation: a word, then "!",
  // then the end of the phrase or a space, and the sentence after it starts
  // again. A "!" that opens a line is a marker, a "!" inside a quoted fragment
  // is part of what is quoted, and the "!" in a macro name is part of the name.
  const bang = /[A-Za-z0-9]!(?=\s|$)/.exec(text);
  if (bang && closesSentence(text, bang.index + bang[0].length)) {
    found.push({
      rule: "no-exclamation",
      detail: "exclamation mark",
      match: "!",
      index: bang.index + bang[0].length - 1,
    });
  }

  const emoji = EMOJI_RE.exec(text);
  if (emoji) {
    found.push({ rule: "no-emoji", detail: "emoji", match: emoji[0], index: emoji.index });
  }

  for (const entry of REFUSED_WORDS) {
    const hit = entry.re.exec(text);
    if (hit) {
      found.push({
        rule: "no-banned-word",
        detail: entry.word,
        match: hit[0],
        index: hit.index,
      });
    }
  }

  for (const entry of MARKETING_VOICES) {
    const hit = entry.re.exec(text);
    if (hit) {
      found.push({
        rule: "no-marketing-voice",
        detail: entry.id,
        match: hit[0],
        index: hit.index,
      });
    }
  }

  return found;
}

/**
 * The comparison key for two labels.
 *
 * Two labels are the same label when a reader would read them the same way:
 * case, trailing punctuation and spacing do not matter. What does matter is
 * the words, so "Mark as complete" and "Mark complete" are two labels and are
 * reported as such.
 */
export function labelKey(text: string): string {
  return text
    .toLowerCase()
    .replace(/[.!?,;:]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Two labels are near-duplicates when they differ only by a filler word.
 *
 * This is what catches the same intent wearing two words: "Mark as complete"
 * and "Mark complete" are one intent with two labels, and a plain string
 * comparison would call them different.
 */
export function sameIntent(a: string, b: string): boolean {
  const drop = (value: string): string =>
    value
      .replace(/\b(?:as|the|a|an|it|this|that|to|my|your|now|up)\b/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  const ka = drop(labelKey(a));
  const kb = drop(labelKey(b));
  if (ka === kb) return true;
  return ka.length > 3 && kb.length > 3 && (ka.includes(kb) || kb.includes(ka));
}

/**
 * The near-variants of the primary call to action.
 *
 * The product's primary call to action has one spelling. A surface that says
 * "Try it free today" is a second spelling of the same action, so the
 * variants are found and reported rather than counted as the one action.
 */
export function ctaVariant(text: string): string | null {
  const trimmed = text.trim();
  if (trimmed === CTA_LABEL) return null;
  if (!/\btry\b/i.test(trimmed)) return null;
  if (!/\bfree\b/i.test(trimmed)) return null;
  return trimmed;
}
