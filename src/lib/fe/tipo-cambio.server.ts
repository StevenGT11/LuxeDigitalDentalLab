/** Tipo de cambio USD/CRC publicado por Hacienda (referencia BCCR). */
const HACIENDA_TC_DOLAR_URL = 'https://api.hacienda.go.cr/indicadores/tc/dolar';
const CACHE_MS = 15 * 60 * 1000;

export type TipoCambioUsd = {
	venta: number;
	compra: number;
	fecha: string;
	fuente: 'hacienda';
};

type HaciendaTcQuote = {
	fecha?: unknown;
	valor?: unknown;
};

type HaciendaTcDolarResponse = {
	venta?: HaciendaTcQuote;
	compra?: HaciendaTcQuote;
};

let cache: { at: number; data: TipoCambioUsd } | null = null;

function parseQuote(quote: HaciendaTcQuote | undefined): { valor: number; fecha: string } | null {
	const valor = Number(quote?.valor);
	if (!Number.isFinite(valor) || valor <= 0) return null;
	const fecha = String(quote?.fecha ?? '').trim();
	return { valor, fecha };
}

export async function fetchTipoCambioUsd(): Promise<TipoCambioUsd> {
	if (cache && Date.now() - cache.at < CACHE_MS) return cache.data;

	const res = await fetch(HACIENDA_TC_DOLAR_URL, {
		headers: { Accept: 'application/json' },
		signal: AbortSignal.timeout(8000)
	});
	if (!res.ok) {
		throw new Error(`No se pudo consultar el tipo de cambio (${res.status}).`);
	}

	const body = (await res.json()) as HaciendaTcDolarResponse;
	const venta = parseQuote(body.venta);
	const compra = parseQuote(body.compra);
	if (!venta) {
		throw new Error('Hacienda no devolvió un tipo de cambio de venta válido.');
	}

	const data: TipoCambioUsd = {
		venta: venta.valor,
		compra: compra?.valor ?? venta.valor,
		fecha: venta.fecha || compra?.fecha || '',
		fuente: 'hacienda'
	};
	cache = { at: Date.now(), data };
	return data;
}
