#!/usr/bin/env tsx
/**
 * VUCE PDF Extractor (Fixed ESM)
 * Extracts text from captured VUCE PDFs and saves to JSON.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import 'dotenv/config';

const SOURCES_DIR = join(process.cwd(), 'data', 'sources', 'vuce');
const PARSED_DIR = join(process.cwd(), 'data', 'parsed', 'vuce');

async function extractPdfText(buffer: Buffer): Promise<string> {
  // Dynamic import to handle ESM/CommonJS interop for pdf-parse
  const pdfParseModule: any = await import('pdf-parse');
  
  // Try different export patterns
  let pdfParse = pdfParseModule.default || pdfParseModule;
  
  // If it's a class (PDFParse), instantiate it
  if (pdfParseModule.PDFParse && typeof pdfParseModule.PDFParse === 'function') {
    const parser = new pdfParseModule.PDFParse();
    const data = await parser.parse(buffer);
    return data.text;
  }
  
  // Otherwise call as function
  const data = await pdfParse(buffer);
  return data.text;
}

async function extractVucePDFs() {
  if (!existsSync(PARSED_DIR)) mkdirSync(PARSED_DIR, { recursive: true });

  const findPDFs = (dir: string): string[] => {
    let results: string[] = [];
    const list = readdirSync(dir);
    for (const file of list) {
      const filePath = join(dir, file);
      const stat = statSync(filePath);
      if (stat.isFile() && filePath.toLowerCase().endsWith('.pdf')) {
        results.push(filePath);
      } else if (stat.isDirectory()) {
        results = results.concat(findPDFs(filePath));
      }
    }
    return results;
  };

  const pdfs = findPDFs(SOURCES_DIR);
  console.log(`📄 Found ${pdfs.length} VUCE PDFs to process.`);

  for (const pdfPath of pdfs) {
    try {
      const buffer = readFileSync(pdfPath);
      const text = await extractPdfText(buffer);
      
      // Extract norms mentioned using regex
      const normsMentioned = text.match(/(Decreto|Resolución|Disposición|Ley)\s+(N[º°]?\s*)?\d+[\d\.\/]*/gi) || [];
      const uniqueNorms = [...new Set(normsMentioned.map(n => n.trim()))];

      const extractRecord = {
        source_file: pdfPath.replace(process.cwd(), ''),
        extracted_at: new Date().toISOString(),
        char_count: text.length,
        raw_text: text.substring(0, 3000), // Keep first 3000 chars for context
        norms_mentioned: uniqueNorms
      };

      const fileName = pdfPath.split('/').pop()!.replace('.pdf', '.json');
      writeFileSync(join(PARSED_DIR, fileName), JSON.stringify(extractRecord, null, 2));
      console.log(`   ✅ Extracted: ${fileName} (${uniqueNorms.length} norms found)`);
    } catch (error: any) {
      console.error(`   ❌ Failed to parse ${pdfPath}:`, error.message);
    }
  }
  console.log('✅ VUCE extraction complete.');
}

extractVucePDFs().catch(console.error);
