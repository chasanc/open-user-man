import type { IncomingMessage, ServerResponse } from 'node:http';

const MAX_BODY_BYTES = 10_000;

export const escapeHtml = (text: string): string =>
  text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

export function page(title: string, body: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(title)}</title>
<style>body{font-family:system-ui,sans-serif;max-width:22rem;margin:4rem auto;padding:0 1rem}
label{display:block;margin-top:1rem}input{width:100%;padding:.5rem;box-sizing:border-box}
button{margin-top:1.5rem;padding:.5rem 1rem}.error{color:#b00020}code{word-break:break-all}</style></head>
<body><h1>${escapeHtml(title)}</h1>${body}</body></html>`;
}

export async function readForm(req: IncomingMessage): Promise<URLSearchParams> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > MAX_BODY_BYTES) throw new Error('Request body too large');
    chunks.push(chunk as Buffer);
  }
  return new URLSearchParams(Buffer.concat(chunks).toString('utf8'));
}

export function send(res: ServerResponse, status: number, html: string): void {
  res.statusCode = status;
  res.setHeader('content-type', 'text/html; charset=utf-8');
  res.setHeader('cache-control', 'no-store');
  // The library protects its own pages; ours would otherwise be frameable for clickjacking.
  res.setHeader('content-security-policy', "frame-ancestors 'none'");
  res.setHeader('x-frame-options', 'DENY');
  res.end(html);
}
