import type { FeAmbiente } from './types';

export type FeConsecutivoCounter = {
	tipo_documento: string;
	label: string;
	current_num: number;
};

export type FeAmbienteConsecutivos = {
	ambiente: FeAmbiente;
	counters: FeConsecutivoCounter[];
};
