import { env } from '$env/dynamic/private';
import type { FeEmisorConfigRow } from './types';

const SECRET_CONFIG_KEYS = new Set([
	'certificado_p12',
	'pin',
	'hacienda_password',
	'pin_certificado'
]);

export function isFeEmitDebugEnabled(): boolean {
	return env.DEBUG_FE_EMIT === 'true' || env.NODE_ENV === 'development';
}

function pickConfigForLog(config: Record<string, unknown>) {
	const out: Record<string, unknown> = {};
	for (const [key, value] of Object.entries(config)) {
		if (SECRET_CONFIG_KEYS.has(key)) {
			out[key] = value ? '[present]' : '[missing]';
			continue;
		}
		out[key] = value;
	}
	return out;
}

/** Server console: emisor/receptor fiscal fields sent to Hacienda (errors -37, -407, -410). */
export function logFeEmitFiscalDebug(input: {
	invoiceId: string;
	ambiente: string;
	emisorDb: FeEmisorConfigRow;
	config: Record<string, unknown>;
	cliente: Record<string, string>;
	clientDb: {
		nombre: string;
		fe_tipo_identificacion: string | null;
		fe_numero_identificacion: string | null;
		fe_codigo_actividad: string | null;
	};
	lineas?: {
		descripcion: string;
		cantidad: number;
		precio_unitario: number;
		impuesto_tarifa: number;
		unidad_medida: string;
		cabys: string;
	}[];
}): void {
	if (!isFeEmitDebugEnabled()) return;

	const { invoiceId, ambiente, emisorDb, config, cliente, clientDb, lineas } = input;

	const emisorEnviado = {
		tipo_cedula: config.tipo_cedula,
		cedula: config.cedula,
		razon_social: config.razon_social,
		codigo_actividad: config.codigo_actividad,
		provincia: config.provincia,
		canton: config.canton,
		distrito: config.distrito,
		otras_senas: config.otras_senas,
		telefono: config.telefono,
		hacienda_ambiente: config.hacienda_ambiente
	};

	const emisorDbRaw = {
		tipo_identificacion: emisorDb.tipo_identificacion,
		numero_identificacion: emisorDb.numero_identificacion,
		codigo_actividad: emisorDb.codigo_actividad,
		provincia: emisorDb.provincia,
		canton: emisorDb.canton,
		distrito: emisorDb.distrito,
		otras_senas: emisorDb.otras_senas,
		telefono: emisorDb.telefono
	};

	const receptorEnviado = {
		tipo_cedula: cliente.tipo_cedula,
		cedula: cliente.cedula,
		nombre_completo: cliente.nombre_completo,
		codigo_actividad: cliente.codigo_actividad ?? '(no enviado — opcional salvo error -410)',
		correo_electronico: cliente.correo_electronico ?? '(no enviado)'
	};

	const receptorDb = {
		fe_tipo_identificacion: clientDb.fe_tipo_identificacion,
		fe_numero_identificacion: clientDb.fe_numero_identificacion,
		fe_codigo_actividad: clientDb.fe_codigo_actividad ?? '(vacío en clients)'
	};

	console.log('\n========== FE EMIT — datos fiscales enviados a Hacienda ==========');
	console.log(`invoiceId: ${invoiceId} | ambiente: ${ambiente}`);
	console.log('\n--- Emisor (XML CodigoActividadEmisor + Ubicacion) — error -37 / -407 ---');
	console.log('  Enviado (normalizado):', JSON.stringify(emisorEnviado, null, 2));
	console.log('  Guardado en fe_emisor_config (BD):', JSON.stringify(emisorDbRaw, null, 2));
	console.log(
		'  Compare con RUT: provincia/cantón/distrito y codigo_actividad deben ser EXACTOS.'
	);
	console.log('\n--- Receptor (XML CodigoActividadReceptor si aplica) — error -410 ---');
	console.log('  Enviado:', JSON.stringify(receptorEnviado, null, 2));
	console.log('  Guardado en clients (BD):', JSON.stringify(receptorDb, null, 2));
	if (!cliente.codigo_actividad) {
		console.log(
			'  ⚠ Si Hacienda devuelve -410: complete fe_codigo_actividad del cliente con el código de su RUT.'
		);
	}
	if (lineas?.length) {
		console.log('\n--- Líneas (unidad + montos → errores -107 / -488) ---');
		for (const [i, l] of lineas.entries()) {
			const monto = Math.round(l.cantidad * l.precio_unitario * 100) / 100;
			console.log(
				`  L${i + 1}: unidad=${l.unidad_medida} | cant=${l.cantidad} × precio=${l.precio_unitario} = ${monto} | IVA=${l.impuesto_tarifa}% | CABYS=${l.cabys}`
			);
			console.log(`       ${l.descripcion.slice(0, 80)}`);
			if (l.impuesto_tarifa === 0 && l.unidad_medida === 'Sp') {
				console.log(
					'       ⚠ Exento con Sp (servicio): CABYS de piezas/mercancía suele requerir Unid → error -107'
				);
			}
		}
	}
	console.log('\n--- config completo (sin secretos) ---');
	console.log(JSON.stringify(pickConfigForLog(config), null, 2));
	console.log('==================================================================\n');
}
