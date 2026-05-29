/** Clasificación anatómica para estadísticas de producción */
export type ToothAnatomyType = 'incisivo' | 'canino' | 'premolar' | 'molar';

export type ToothAnatomySummary = ToothAnatomyType | 'mixto';

export interface ToothDefinition {
	fdi: string;
	anatomy: ToothAnatomyType;
	arch: 'superior' | 'inferior';
	side: 'derecha' | 'izquierda';
	label: string;
}

const ANATOMY_LABELS: Record<ToothAnatomyType, string> = {
	incisivo: 'Incisivo',
	canino: 'Canino',
	premolar: 'Premolar',
	molar: 'Molar'
};

const ANATOMY_COLORS: Record<ToothAnatomyType, string> = {
	incisivo: '#94a3b8',
	canino: '#38bdf8',
	premolar: '#a78bfa',
	molar: '#f59e0b'
};

/** Arcada superior e inferior — notación FDI permanente (vista oclusal simplificada) */
export const UPPER_TEETH_FDI = [
	'18',
	'17',
	'16',
	'15',
	'14',
	'13',
	'12',
	'11',
	'21',
	'22',
	'23',
	'24',
	'25',
	'26',
	'27',
	'28'
] as const;

export const LOWER_TEETH_FDI = [
	'48',
	'47',
	'46',
	'45',
	'44',
	'43',
	'42',
	'41',
	'31',
	'32',
	'33',
	'34',
	'35',
	'36',
	'37',
	'38'
] as const;

const TOOTH_MAP = new Map<string, ToothDefinition>();

function register(fdi: string, anatomy: ToothAnatomyType, arch: 'superior' | 'inferior', side: 'derecha' | 'izquierda') {
	TOOTH_MAP.set(fdi, {
		fdi,
		anatomy,
		arch,
		side,
		label: `${ANATOMY_LABELS[anatomy]} ${fdi}`
	});
}

for (const fdi of UPPER_TEETH_FDI) {
	const q = Number(fdi[0]);
	const p = Number(fdi[1]);
	const side = q === 1 ? 'derecha' : 'izquierda';
	let anatomy: ToothAnatomyType = 'molar';
	if (p <= 2) anatomy = 'incisivo';
	else if (p === 3) anatomy = 'canino';
	else if (p <= 5) anatomy = 'premolar';
	register(fdi, anatomy, 'superior', side);
}

for (const fdi of LOWER_TEETH_FDI) {
	const q = Number(fdi[0]);
	const p = Number(fdi[1]);
	const side = q === 4 ? 'derecha' : 'izquierda';
	let anatomy: ToothAnatomyType = 'molar';
	if (p <= 2) anatomy = 'incisivo';
	else if (p === 3) anatomy = 'canino';
	else if (p <= 5) anatomy = 'premolar';
	register(fdi, anatomy, 'inferior', side);
}

export function getToothDefinition(fdi: string): ToothDefinition | undefined {
	return TOOTH_MAP.get(fdi);
}

export function getAnatomyLabel(anatomy: ToothAnatomyType | ToothAnatomySummary | null): string {
	if (!anatomy) return '—';
	if (anatomy === 'mixto') return 'Mixto';
	return ANATOMY_LABELS[anatomy];
}

export function getAnatomyColor(anatomy: ToothAnatomyType): string {
	return ANATOMY_COLORS[anatomy];
}

export function inferAnatomySummary(teeth: string[]): ToothAnatomySummary | null {
	if (teeth.length === 0) return null;
	const types = new Set(
		teeth.map((t) => getToothDefinition(t)?.anatomy).filter(Boolean) as ToothAnatomyType[]
	);
	if (types.size === 0) return null;
	if (types.size === 1) return [...types][0];
	return 'mixto';
}

/** Orden FDI para mostrar y rangos consecutivos */
const FDI_SORT = (a: string, b: string) => {
	const archOrder = (fdi: string) => {
		const q = Number(fdi[0]);
		if (q === 1) return 0;
		if (q === 2) return 1;
		if (q === 3) return 2;
		return 3;
	};
	const pos = (fdi: string) => Number(fdi[1]);
	const da = archOrder(a);
	const db = archOrder(b);
	if (da !== db) return da - db;
	const pa = pos(a);
	const pb = pos(b);
	if (da === 0) return pa - pb;
	if (da === 1) return pa - pb;
	if (da === 2) return pb - pa;
	return pb - pa;
};

export function sortTeethFdi(teeth: string[]): string[] {
	return [...new Set(teeth.filter((t) => TOOTH_MAP.has(t)))].sort(FDI_SORT);
}

export function formatTeethSelection(teeth: string[]): string {
	const sorted = sortTeethFdi(teeth);
	if (sorted.length === 0) return '';

	const groups: string[] = [];
	let start = sorted[0];
	let prev = sorted[0];

	const isConsecutive = (a: string, b: string) => {
		const qa = Number(a[0]);
		const qb = Number(b[0]);
		if (qa !== qb) return false;
		return Math.abs(Number(a[1]) - Number(b[1])) === 1;
	};

	for (let i = 1; i < sorted.length; i++) {
		const cur = sorted[i];
		if (isConsecutive(prev, cur)) {
			prev = cur;
			continue;
		}
		groups.push(start === prev ? start : `${start}-${prev}`);
		start = cur;
		prev = cur;
	}
	groups.push(start === prev ? start : `${start}-${prev}`);
	return groups.join(', ');
}

/** Parsea texto legacy: "14, 21", "13-15" */
export function parseTeethFromString(raw: string | null | undefined): string[] {
	if (!raw?.trim()) return [];
	const tokens = raw.split(/[,;]+/).map((s) => s.trim());
	const out: string[] = [];

	for (const token of tokens) {
		const range = token.match(/^(\d{2})\s*-\s*(\d{2})$/);
		if (range) {
			const a = range[1];
			const b = range[2];
			if (a[0] === b[0]) {
				const from = Math.min(Number(a[1]), Number(b[1]));
				const to = Math.max(Number(a[1]), Number(b[1]));
				for (let p = from; p <= to; p++) {
					const fdi = `${a[0]}${p}`;
					if (TOOTH_MAP.has(fdi)) out.push(fdi);
				}
			} else {
				if (TOOTH_MAP.has(a)) out.push(a);
				if (TOOTH_MAP.has(b)) out.push(b);
			}
			continue;
		}
		const single = token.match(/^\d{2}$/);
		if (single && TOOTH_MAP.has(token)) out.push(token);
	}

	return sortTeethFdi(out);
}

export interface AnatomyStat {
	anatomy: ToothAnatomyType;
	label: string;
	piezas: number;
	color: string;
}

export function countPiezasByAnatomy(
	items: { piezas_dentales?: string[]; numero_pieza?: string | null; piezas: number }[]
): AnatomyStat[] {
	const counts: Record<ToothAnatomyType, number> = {
		incisivo: 0,
		canino: 0,
		premolar: 0,
		molar: 0
	};

	for (const item of items) {
		const teeth =
			item.piezas_dentales && item.piezas_dentales.length > 0
				? item.piezas_dentales
				: parseTeethFromString(item.numero_pieza);

		if (teeth.length > 0) {
			for (const fdi of teeth) {
				const def = getToothDefinition(fdi);
				if (def) counts[def.anatomy] += 1;
			}
		} else if (item.piezas > 0) {
			/* legacy sin dientes parseables — no sumar a anatomía */
		}
	}

	return (Object.keys(counts) as ToothAnatomyType[])
		.map((anatomy) => ({
			anatomy,
			label: ANATOMY_LABELS[anatomy],
			piezas: counts[anatomy],
			color: ANATOMY_COLORS[anatomy]
		}))
		.filter((s) => s.piezas > 0)
		.sort((a, b) => b.piezas - a.piezas);
}
