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
	bustFacturadorEntryCache(require, pkgRoot);
}
