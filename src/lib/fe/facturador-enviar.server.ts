import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import {
	assertExemptDesglosePresent,
	patchFacturaXmlExemptDesglose
} from './facturador-exempt-desglose';

type LibraryResult = {
	success?: boolean;
	error?: string;
	message?: string;
	errors?: string[];
	data?: Record<string, unknown>;
};

/**
 * Envía FE usando facturador con parche explícito de TotalDesgloseImpuesto exento (-488).
 * Recarga factura.js en cada envío para que use generarFacturaXML parcheado (no depende de import ESM).
 */
export async function enviarFacturaConDesgloseExento(payload: object): Promise<LibraryResult> {
	const require = createRequire(import.meta.url);
	const pkgRoot = join(dirname(require.resolve('@happy-prod/facturador')), '..');
	const xmlPath = join(pkgRoot, 'services', 'xml.js');
	const facturaPath = join(pkgRoot, 'src', 'factura.js');
	const indexPath = join(pkgRoot, 'src', 'index.js');
	const pkgEntry = require.resolve('@happy-prod/facturador');

	// eslint-disable-next-line @typescript-eslint/no-require-imports
	const xmlMod = require(xmlPath) as {
		generarFacturaXML: (params: unknown) => string;
		__origGenerarFacturaXML?: (params: unknown) => string;
	};

	if (!xmlMod.__origGenerarFacturaXML) {
		xmlMod.__origGenerarFacturaXML = xmlMod.generarFacturaXML.bind(xmlMod);
	}

	xmlMod.generarFacturaXML = (params: unknown) => {
		const raw = xmlMod.__origGenerarFacturaXML!(params);
		const patched = patchFacturaXmlExemptDesglose(raw);
		assertExemptDesglosePresent(patched);
		return patched;
	};

	delete require.cache[facturaPath];
	delete require.cache[indexPath];
	delete require.cache[pkgEntry];

	// eslint-disable-next-line @typescript-eslint/no-require-imports
	const { enviarFactura } = require(indexPath) as {
		enviarFactura: (p: object) => Promise<LibraryResult>;
	};

	return enviarFactura(payload);
}
