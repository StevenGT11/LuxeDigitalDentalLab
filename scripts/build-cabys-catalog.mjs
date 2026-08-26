/**
 * Build compact CABYS JSON from src/lib/components/cabys/cabys.xlsx
 * Run: node scripts/build-cabys-catalog.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import XLSX from 'xlsx';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const xlsxPath = join(root, 'src/lib/components/cabys/cabys.xlsx');
const outPath = join(root, 'src/lib/cabys/catalog.json');

const wb = XLSX.read(readFileSync(xlsxPath));
const sheet = wb.Sheets[wb.SheetNames[0]];
const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });

/** @type {Map<string, { codigo: string; producto: string; clasificacion: string; impuesto: string }>} */
const byCode = new Map();

for (const row of rows) {
	const values = Object.values(row).map((v) => String(v ?? '').trim());
	const code = values.find((v) => /^\d{13}$/.test(v));
	if (!code) continue;

	const impuestoRaw = row['__EMPTY_18'] ?? row['Impuesto'] ?? '';
	const impuesto = String(impuestoRaw).trim();

	const producto =
		values.find((v, i) => /^\d{13}$/.test(v) && values[i + 1] && !/^\d+$/.test(values[i + 1])) ??
		'';
	const idx = values.indexOf(code);
	const desc = idx >= 0 && values[idx + 1] ? values[idx + 1] : values.filter((v) => v && !/^\d+$/.test(v)).pop() ?? '';

	const clasificacionParts = [];
	for (const v of values) {
		if (v === code || v === desc || v === impuesto) continue;
		if (/^\d{1,13}$/.test(v)) continue;
		if (v.length > 3 && !clasificacionParts.includes(v)) clasificacionParts.push(v);
	}

	const existing = byCode.get(code);
	const productoFinal = desc || producto || existing?.producto || code;
	byCode.set(code, {
		codigo: code,
		producto: productoFinal,
		clasificacion: clasificacionParts.slice(0, 3).join(' › ') || existing?.clasificacion || '',
		impuesto: impuesto || existing?.impuesto || ''
	});
}

const catalog = [...byCode.values()].sort((a, b) => a.codigo.localeCompare(b.codigo));
writeFileSync(outPath, JSON.stringify(catalog));
console.log(`Wrote ${catalog.length} CABYS entries to ${outPath}`);
