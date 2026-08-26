/** CABYS product code: 13 digits. */
export function normalizeCabys(codigo: string): string {
	return String(codigo ?? '')
		.replace(/\D/g, '')
		.slice(0, 13);
}
