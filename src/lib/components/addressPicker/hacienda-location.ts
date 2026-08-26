/** Map address picker values to Hacienda v4.4 location codes (canton/distrito as 2-digit strings). */
export function haciendaCodesFromPicker(
	province: number,
	canton: number,
	district: number
): { provincia: number; canton: string; distrito: string } {
	return {
		provincia: province,
		canton: String(canton).padStart(2, '0'),
		distrito: String(district).padStart(2, '0')
	};
}

export function pickerValuesFromHacienda(
	provincia: number,
	canton: string,
	distrito: string
): { province: number; canton: number; district: number } {
	const c = parseInt(canton, 10);
	const d = parseInt(distrito, 10);
	return {
		province: provincia > 0 ? provincia : 0,
		canton: Number.isFinite(c) && c > 0 ? c : 0,
		district: Number.isFinite(d) && d > 0 ? d : 0
	};
}
