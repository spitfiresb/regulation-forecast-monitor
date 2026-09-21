// Keep product typography consistent without changing the archived source text.
export function displayText(text: string | null | undefined): string {
  return (text ?? "").replace(/\s*\u2014\s*/g, " - ");
}
