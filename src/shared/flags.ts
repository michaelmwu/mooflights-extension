export function flagEmoji(code: string): string {
  if (!/^[A-Za-z]{2}$/.test(code)) return "";
  return String.fromCodePoint(...[...code.toUpperCase()].map((character) => 0x1f1e6 + character.charCodeAt(0) - 65));
}
