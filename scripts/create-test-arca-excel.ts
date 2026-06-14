#!/usr/bin/env tsx
/**
 * Create test Excel file for ARCA crawler validation
 * 
 * This creates a minimal Excel file with the expected ARCA structure
 * for testing the crawler without downloading the real (large) file.
 */

import * as XLSX from 'xlsx';
import { existsSync, mkdirSync } from 'fs';
import { join } from 'path';

const DATA_ROOT = join(process.cwd(), 'data');
const RAW_DIR = join(DATA_ROOT, 'raw', 'arca');

// Ensure directory exists
if (!existsSync(RAW_DIR)) {
  mkdirSync(RAW_DIR, { recursive: true });
}

const data = [
  ['NCM', 'Descripción', 'AEC', 'Tasa Estadística', 'IVA'],
  ['4202.92.00', 'Los demás artículos con superficie exterior de materia textil', '16', '0.5', '21'],
  ['8452.10.00', 'Máquinas de coser del tipo doméstico', '14', '0.5', '21'],
  ['8504.40.00', 'Convertidores estáticos (cargadores)', '18', '0.5', '21'],
  ['6109.10.00', 'Camisetas de algodón', '35', '0.5', '21'],
  ['8471.30.00', 'Máquinas automáticas portátiles (laptops)', '16', '0.5', '21'],
];

const ws = XLSX.utils.aoa_to_sheet(data);
const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, ws, 'Arancel');

const filename = 'arancel-test-2026-06-14.xlsx';
const filepath = join(RAW_DIR, filename);
XLSX.writeFile(wb, filepath);

console.log('✅ Test Excel created');
console.log(`   Path: ${filepath}`);
console.log(`   Rows: ${data.length - 1} (excluding header)`);
