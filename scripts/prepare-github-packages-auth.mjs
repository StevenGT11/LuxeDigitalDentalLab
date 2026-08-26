#!/usr/bin/env node
/**
 * Escribe .npmrc con auth de GitHub Packages antes de npm install (Vercel / CI).
 * Lee el PAT desde env (primer nombre definido gana).
 */
import { writeFileSync } from 'node:fs';

const TOKEN_ENV_NAMES = [
	'GH_PACKAGES_TOKEN',
	'NPM_TOKEN',
	'NODE_AUTH_TOKEN',
	'GITHUB_TOKEN'
];

let tokenSource = null;
let token = null;

for (const name of TOKEN_ENV_NAMES) {
	const value = process.env[name]?.trim();
	if (value) {
		tokenSource = name;
		token = value;
		break;
	}
}

if (!token) {
	console.error('GitHub Packages: no auth token found in environment.');
	console.error(`Checked: ${TOKEN_ENV_NAMES.join(', ')}`);
	console.error(
		'In Vercel → Project → Settings → Environment Variables, add GH_PACKAGES_TOKEN (classic PAT, read:packages, SSO happy-prod).'
	);
	console.error('Enable it for Production, Preview, and Development, then redeploy.');
	process.exit(1);
}

writeFileSync(
	'.npmrc',
	`@happy-prod:registry=https://npm.pkg.github.com
always-auth=true
registry=https://registry.npmjs.org/
//npm.pkg.github.com/:_authToken=${token}
`
);

console.log(
	`GitHub Packages auth: using ${tokenSource} (${token.length} chars), .npmrc written for @happy-prod scope.`
);
