import { buildCaseItemsFromInput } from '$lib/lab/case-builder';
import { assertCaseSinFacturaEmitida } from '$lib/lab/delete-case.server';
import type { CreateCaseInput } from '$lib/lab/store-types';
import { createSupabaseAdminClient } from '$lib/supabase/admin';

/** Actualiza el contenido de un caso. Solo debe llamarse tras comprobar que el usuario es administrador. */
export async function updateLabCaseAsAdmin(
	caseId: string,
	input: CreateCaseInput,
	editor: { id: string; nombre: string }
): Promise<void> {
	const admin = createSupabaseAdminClient();
	const { data: existing, error: existingError } = await admin
		.from('cases')
		.select('id, client_id')
		.eq('id', caseId)
		.maybeSingle();
	if (existingError) throw existingError;
	if (!existing) throw new Error('Caso no encontrado.');
	await assertCaseSinFacturaEmitida(caseId);
	if (existing.client_id !== input.client_id) {
		throw new Error('No se puede cambiar el cliente del caso.');
	}

	const doctorId = input.doctor_id?.trim() ?? '';
	if (!doctorId) throw new Error('Selecciona el doctor responsable del caso.');

	const { data: doctor, error: doctorError } = await admin
		.from('doctors')
		.select('id, nombre')
		.eq('id', doctorId)
		.eq('client_id', existing.client_id)
		.maybeSingle();
	if (doctorError) throw doctorError;
	if (!doctor) throw new Error('Ese doctor no pertenece a la clínica del caso.');

	const items = buildCaseItemsFromInput(caseId, input);
	const first = items[0];
	if (!first) throw new Error('El caso debe incluir al menos un ítem de trabajo.');
	const costo = input.costo ?? items.reduce((sum, item) => sum + item.subtotal, 0);
	const piezas = items.reduce((sum, item) => sum + item.piezas, 0);

	const { error: deleteError } = await admin.from('case_items').delete().eq('case_id', caseId);
	if (deleteError) throw deleteError;

	const { error: caseError } = await admin
		.from('cases')
		.update({
			doctor_id: doctor.id,
			doctor_name: doctor.nombre,
			paciente_name: input.paciente_name.trim(),
			tipo_trabajo: first.tipo_trabajo,
			material: first.material,
			color: first.color,
			piezas,
			costo,
			fecha_entrega: input.fecha_entrega,
			notas: input.notas,
			last_edited_at: new Date().toISOString(),
			last_edited_by: editor.id,
			last_edited_by_name: editor.nombre
		})
		.eq('id', caseId);
	if (caseError) throw caseError;

	for (let index = 0; index < items.length; index++) {
		const item = items[index];
		const { data: itemRow, error: itemError } = await admin
			.from('case_items')
			.insert({
				id: item.id,
				case_id: caseId,
				sort_order: index,
				numero_pieza: item.numero_pieza,
				tipo_trabajo: item.tipo_trabajo,
				material: item.material,
				color: item.color,
				piezas: item.piezas,
				incluye_diseno: item.incluye_diseno,
				incluye_fresado: item.incluye_fresado,
				implantes_guia: item.implantes_guia,
				alcance_arcada: item.alcance_arcada,
				corona_sobre_implante: item.corona_sobre_implante,
				implante_marca: item.implante_marca,
				implante_plataforma: item.implante_plataforma,
				descripcion: item.descripcion,
				tipo_pieza: item.tipo_pieza,
				unit_price: item.unit_price,
				subtotal: item.subtotal
			})
			.select('id')
			.single();
		if (itemError) throw itemError;

		if (item.piezas_dentales.length > 0) {
			const { error: teethError } = await admin.from('case_item_teeth').insert(
				item.piezas_dentales.map((tooth_fdi) => ({
					case_item_id: itemRow.id,
					tooth_fdi
				}))
			);
			if (teethError) throw teethError;
		}
	}
}
