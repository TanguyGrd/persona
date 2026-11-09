/*! Adapted from Capri Companion (MIT), copyright (c) 2026 Capri Companion contributors.
 * Source c094ec1e74941c075cf0a2ce5ab340a58a3c6344, src/main/ai/actionStream.ts.
 * Full notice: THIRD-PARTY-NOTICES.md. No character assets or voice were copied. */
export class SentenceChunker {
  private buf = '';
  push(text: string): string[] {
    this.buf += text;
    const out: string[] = [];
    const re = /[^.!?…\n]+[.!?…]+["')\]]*\s+|[^\n]+\n+/g;
    let m: RegExpExecArray | null;
    let last = 0;
    while ((m = re.exec(this.buf))) {
      const sentence = m[0].trim();
      if (sentence.length >= 2) out.push(sentence);
      last = re.lastIndex;
    }
    this.buf = this.buf.slice(last);
    return out;
  }
  end(): string[] { const text = this.buf.trim(); this.buf = ''; return text ? [text] : []; }
}
export function speakable(text: string): string {
  return text.replace(/```[\s\S]*?```/g, ' (code dans la conversation) ')
    .replace(/`([^`]+)`/g, '$1').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/https?:\/\/\S+/g, 'le lien').replace(/[*_#>~|]/g, '').replace(/\s+/g, ' ').trim();
}
