import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { patchFacturaXmlExemptDesglose } from './facturador-exempt-desglose';

let installed = false;

function isModuleNotFound(err: unknown): boolean {
	return (
		typeof err === 'object' &&
		err !== null &&
		'code' in err &&
		(err as NodeJS.ErrnoException).code === 'MODULE_NOT_FOUND'
	);
}

function facturadorPkgRoot(require: NodeRequire): string {
	const pkgEntry = require.resolve('@happy-prod/facturador');
	return join(dirname(pkgEntry), '..');
}

function patchXmlModule(require: NodeRequire, pkgRoot: string): void {
	const xmlPath = join(pkgRoot, 'services', 'xml.js');
	// eslint-disable-next-line @typescript-eslint/no-require-imports
	const xmlMod = require(xmlPath) as {
		generarFacturaXML: (params: unknown) => string;
		__exemptDesglosePatched?: boolean;
	};

	if (xmlMod.__exemptDesglosePatched) return;

	const original = xmlMod.generarFacturaXML.bind(xmlMod);
	xmlMod.generarFacturaXML = (params: unknown) =>
		patchFacturaXmlExemptDesglose(original(params));
	xmlMod.__exemptDesglosePatched = true;
}

type HaciendaSendParams = {
	emisorNumeroIdentificacion?: string;
	receptorNumeroIdentificacion?: string;
	comprobanteXml?: string;
};

function decodeComprobanteXml(raw: string | undefined): string | null {
	if (!raw?.trim()) return null;
	if (raw.includes('<')) return raw;
	try {
		return Buffer.from(raw, 'base64').toString('utf8');
	} catch {
		return null;
	}
}

function firstTagBlock(xml: string, tagName: string): string | null {
	const match = xml.match(
		new RegExp(`<(?:\\w+:)?${tagName}(?:\\s[^>]*)?>([\\s\\S]*?)</(?:\\w+:)?${tagName}>`, 'i')
	);
	return match?.[1] ?? null;
}

function identificacionNumero(xml: string, party: 'Emisor' | 'Receptor'): string | null {
	const partyXml = firstTagBlock(xml, party);
	if (!partyXml) return null;
	const ident = firstTagBlock(partyXml, 'Identificacion');
	if (!ident) return null;
	return firstTagBlock(ident, 'Numero')?.trim() || null;
}

/** Facturador 2.0.4 keeps letters in the XML, then strips them in the Hacienda API body. */
export function preferXmlAlphanumeric(
	passed: string | undefined,
	xmlNumero: string | null
): string | undefined {
	if (!passed || !xmlNumero || !/[A-Z]/i.test(xmlNumero)) return passed;
	const canonical = xmlNumero.replace(/[\s-]/g, '').toUpperCase();
	const digitsOnly = canonical.replace(/[^0-9]/g, '');
	if (passed.toUpperCase() === canonical || passed === digitsOnly) return canonical;
	return passed;
}

export function alignHaciendaIdentificacionWithXml<T extends HaciendaSendParams>(params: T): T {
	const xml = decodeComprobanteXml(params.comprobanteXml);
	if (!xml) return params;
	const emisorNumero = identificacionNumero(xml, 'Emisor');
	const receptorNumero = identificacionNumero(xml, 'Receptor');
	return {
		...params,
		emisorNumeroIdentificacion: preferXmlAlphanumeric(params.emisorNumeroIdentificacion, emisorNumero),
		...(params.receptorNumeroIdentificacion != null
			? {
					receptorNumeroIdentificacion: preferXmlAlphanumeric(
						params.receptorNumeroIdentificacion,
						receptorNumero
					)
				}
			: {})
	};
}

function patchHaciendaIdentificacion(require: NodeRequire, pkgRoot: string): void {
	const haciendaPath = join(pkgRoot, 'services', 'hacienda.js');
	// eslint-disable-next-line @typescript-eslint/no-require-imports
	const haciendaMod = require(haciendaPath) as {
		enviarComprobante: (params: HaciendaSendParams, credentials: unknown) => Promise<unknown>;
		__cedulaAlnumPatched?: boolean;
	};
	if (haciendaMod.__cedulaAlnumPatched) return;

	const original = haciendaMod.enviarComprobante.bind(haciendaMod);
	haciendaMod.enviarComprobante = (params, credentials) =>
		original(alignHaciendaIdentificacionWithXml(params), credentials);
	haciendaMod.__cedulaAlnumPatched = true;
}

/** Drop factura/index bindings so they re-require patched services/xml.js */
function bustFacturadorEntryCache(require: NodeRequire, pkgRoot: string): void {
	const paths = [
		join(pkgRoot, 'src', 'factura.js'),
		join(pkgRoot, 'src', 'index.js'),
		require.resolve('@happy-prod/facturador')
	];
	for (const p of paths) {
		delete require.cache[p];
	}
}

/**
 * Patch facturador XML generation (app-side fix for Hacienda -488 / mensaje 88).
 * Must run before @happy-prod/facturador loads, or bust cache so factura.js re-binds.
 */
export function installFacturadorExemptDesglosePatch(): void {
	if (installed) return;

	const require = createRequire(import.meta.url);
	let pkgRoot: string;
	try {
		pkgRoot = facturadorPkgRoot(require);
	} catch (err) {
		if (isModuleNotFound(err)) {
			console.warn(
				'[facturador] @happy-prod/facturador no está instalado. La app arranca sin el parche FE. Ejecute npm install con un PAT de GitHub Packages (read:packages).'
			);
			return;
		}
		throw err;
	}

	installed = true;
	bustFacturadorEntryCache(require, pkgRoot);
	patchXmlModule(require, pkgRoot);
	patchHaciendaIdentificacion(require, pkgRoot);
	bustFacturadorEntryCache(require, pkgRoot);
}
