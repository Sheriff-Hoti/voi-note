/** "25 Nov 2026, 09:00": when a Note was captured, as the list and the Note screen show it. */
export function noteDate(epochMs: number): string {
  return new Date(epochMs).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' });
}

/** The first non-empty line of a Note's text, which stands in for a title. */
export function firstLine(text: string): string {
  return (
    text
      .split('\n')
      .find((line) => line.trim())
      ?.trim() ?? ''
  );
}

/** "1:05" for 65 000 ms. */
export function elapsed(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}
