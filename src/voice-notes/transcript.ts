import type { Cut } from './chunker';

/**
 * The Transcript so far with the next chunk's text appended, reading as one text. The Speech Model
 * starts every chunk with a capital, so when the text so far doesn't end a sentence (no ".", "?" or
 * "!"), the next word is lowercased (except "I"). A hard cut falls mid-sentence, yet the model often
 * ends the chunk with a period: after a hard cut that period is dropped too. At a pause the model's
 * period is kept, as the speaker likely ended a sentence there.
 */
export function joinTranscript(soFar: string, previousCut: Cut | null, next: string): string {
  if (!next) return soFar;
  if (!soFar) return next;
  if (previousCut === 'hard' && soFar.endsWith('.'))
    return `${soFar.slice(0, -1)} ${lowercaseFirstWord(next)}`;
  if (!/[.?!]$/.test(soFar)) return `${soFar} ${lowercaseFirstWord(next)}`;
  return `${soFar} ${next}`;
}

/** "Will call" → "will call". Leaves "I", "I'll" and acronyms ("NASA") as they are. */
function lowercaseFirstWord(text: string): string {
  const word = /^[A-Za-z']+/.exec(text)?.[0] ?? '';
  if (word === 'I' || word.startsWith("I'") || !/^[A-Z][a-z']*$/.test(word)) return text;
  return text[0].toLowerCase() + text.slice(1);
}
