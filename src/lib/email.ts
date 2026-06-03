import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import { env } from '$env/dynamic/private';

const REQUIRED_SMTP_KEYS = [
	'SMTP_HOST',
	'SMTP_PORT',
	'SMTP_SECURE',
	'SMTP_USER',
	'SMTP_PASSWORD',
	'SMTP_FROM'
] as const;

type SmtpConfig = {
	host: string;
	port: number;
	secure: boolean;
	auth: { user: string; pass: string };
	from: string;
};

function stripOptionalQuotes(value: string): string {
	const trimmed = value.trim();
	if (
		(trimmed.startsWith('"') && trimmed.endsWith('"')) ||
		(trimmed.startsWith("'") && trimmed.endsWith("'"))
	) {
		return trimmed.slice(1, -1);
	}
	return trimmed;
}

function missingSmtpKeys(): string[] {
	return REQUIRED_SMTP_KEYS.filter((key) => !env[key]?.trim());
}

export function assertSmtpEnv(): void {
	const missing = missingSmtpKeys();
	if (missing.length > 0) {
		throw new Error(`Faltan variables de entorno SMTP: ${missing.join(', ')}`);
	}
}

function getSmtpConfig(): SmtpConfig {
	assertSmtpEnv();

	const port = Number.parseInt(env.SMTP_PORT!.trim(), 10);
	if (!Number.isFinite(port) || port <= 0) {
		throw new Error('SMTP_PORT debe ser un número válido.');
	}

	const secureRaw = env.SMTP_SECURE!.trim().toLowerCase();
	if (secureRaw !== 'true' && secureRaw !== 'false') {
		throw new Error('SMTP_SECURE debe ser "true" o "false".');
	}

	return {
		host: env.SMTP_HOST!.trim(),
		port,
		secure: secureRaw === 'true',
		auth: {
			user: env.SMTP_USER!.trim(),
			pass: env.SMTP_PASSWORD!.trim()
		},
		from: stripOptionalQuotes(env.SMTP_FROM!.trim())
	};
}

let transporter: Transporter | null = null;

function getTransporter(): Transporter {
	if (!transporter) {
		const cfg = getSmtpConfig();
		transporter = nodemailer.createTransport({
			host: cfg.host,
			port: cfg.port,
			secure: cfg.secure,
			auth: cfg.auth
		});
	}
	return transporter;
}

export type SendEmailParams = {
	to: string;
	subject: string;
	html?: string;
	text?: string;
};

export function isValidEmailAddress(email: string): boolean {
	return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

export async function sendEmail({ to, subject, html, text }: SendEmailParams): Promise<void> {
	const cfg = getSmtpConfig();
	const transport = getTransporter();

	const bodyText = text?.trim();
	const bodyHtml = html?.trim();

	if (!bodyText && !bodyHtml) {
		throw new Error('Debes proporcionar al menos text o html para el correo.');
	}

	try {
		await transport.sendMail({
			from: cfg.from,
			to: to.trim(),
			subject: subject.trim(),
			...(bodyHtml ? { html: bodyHtml } : {}),
			...(bodyText ? { text: bodyText } : {})
		});
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		console.error('[email] Error al enviar correo:', {
			host: cfg.host,
			port: cfg.port,
			secure: cfg.secure,
			to: to.trim(),
			subject: subject.trim(),
			error: message
		});
		throw new Error(
			`No se pudo enviar el correo. Revisa host, puerto, credenciales SMTP y conectividad. (${message})`
		);
	}
}
