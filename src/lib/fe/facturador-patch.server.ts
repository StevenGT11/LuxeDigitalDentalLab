import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { patchFacturaXmlExemptDesglose } from './facturador-exempt-desglose';

let installed = false;

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
	installed = true;

	const require = createRequire(import.meta.url);
	const pkgRoot = facturadorPkgRoot(require);

	bustFacturadorEntryCache(require, pkgRoot);
	patchXmlModule(require, pkgRoot);
	bustFacturadorEntryCache(require, pkgRoot);
}
