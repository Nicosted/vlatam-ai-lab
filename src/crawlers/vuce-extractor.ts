#!/usr/bin/env tsx
/**
 * VUCE PDF Extractor
 * Extracts text from captured VUCE PDFs and saves to JSON.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import 'dotenv/config';

const SOURCES_DIR = join(process.cwd(), 'data', 'sources', 'vuce');
const PARSED_DIR = join(process.cwd(), 'data', 'parsed', 'vuce');

function findPDFs(dir: string): string[] {
  let results: string[] = [];
  const list = readdirSync(dir);
  for (const file of list) {
    const filePath = join(dir, file);
    const stat = statSync(filePath);
    if (stat.isDirectory()) {
      results = results.concat(findPDFs(filePath));
    } else if (filePath.endsWith('.pdf')) {
      results.push(filePath);
    }
  }
  return results;
}

async function extractVucePDFs() {
  // Dynamic import for pdf-parse (ESM compatibility)
  const pdfParseModule: any = await import('pdf-parse');
  const pdfParse = typeof pdfParseModule === 'function' ? pdfParseModule : pdfParseModule.default || pdfParseModule.parse;
  
  if (!existsSync(PARSED_DIR)) mkdirSync(PARSED_DIR, { recursive: true });

  const pdfs = findPDFs(SOURCES_DIR);
  console.log(`📄 Found ${pdfs.length} VUCE PDFs to process.`);

  for (const pdfPath of pdfs) {
    try {
      const buffer = readFileSync(pdfPath);
      const data = await pdfParse(buffer);
      
      const extractRecord = {
        source_file: pdfPath.replace(process.cwd(), ''),
        extracted_at: new Date().toISOString(),
        char_count: data.text.length,
        raw_text: data.text.substring(0, 4000), // First 4000 chars for context
        // Simple regex to pull out norms mentioned in the PDF
        norms_mentioned: data.text.match(/(Decreto|Resolución|Disposición|Ley)\s+(N[º°]?\s*)?\d+[\d\.\/]*/gi) || []
      };

      const fileName = pdfPath.split('/').pop()!.replace('.pdf', '.json');
      writeFileSync(join(PARSED_DIR, fileName), JSON.stringify(extractRecord, null, 2));
      console.log(`   ✅ Extracted: ${fileName} (${extractRecord.norms_mentioned.length} norms found)`);
    } catch (error: any) {
      console.error(`   ❌ Failed to parse ${pdfPath}:`, error.message);
    }
  }
}

extractVucePDFs().catch(console.error);
