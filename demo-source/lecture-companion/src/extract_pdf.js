// Extract text from a PDF file — server-side (text-based PDFs only).
//
// Scanned / image-only PDFs (CamScanner, etc.) are returned with `needsOcr: true`
// and a list of `emptyPages`. The client runs OCR in the browser using
// pdfjs-dist + tesseract.js. This avoids Vercel's serverless function timeout
// (60 s free / 300 s Pro) — OCR on a 24 MB CamScanner PDF can take 5-15 min.
//
// Side benefits:
//   - free (no external OCR API, no Vercel Pro)
//   - privacy: scanned images never leave the student's device
//   - no extra dependencies on the server (tesseract.js + unpdf removed from runtime)

import fs from 'node:fs/promises';

export async function extractPdf(filePath) {
  let pdfParse;
  try {
    pdfParse = (await import('pdf-parse')).default;
  } catch {
    throw new Error('pdf-parse مش متثبت. شغّل: npm install pdf-parse');
  }

  const buffer = await fs.readFile(filePath);
  const data = await pdfParse(buffer);

  const rawText = data.text || '';
  const pageBreak = String.fromCharCode(12); // form feed = \f
  const rawPages = rawText.split(pageBreak);

  const pages = [];
  const emptyPages = [];

  for (let i = 0; i < rawPages.length; i++) {
    const text = rawPages[i].replace(/\s+/g, ' ').trim();
    if (text) {
      pages.push({ page: i + 1, text });
    } else {
      emptyPages.push(i + 1);
    }
  }

  return {
    pages,
    totalPages: data.numpages || rawPages.length,
    emptyPages,
    provider: 'pdf-parse',
    // Flag for the client: if true, the browser will run OCR on emptyPages.
    needsOcr: emptyPages.length > 0
  };
}