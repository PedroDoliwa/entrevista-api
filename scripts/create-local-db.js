require("dotenv").config();
const { Client } = require("pg");

function parseDbUrl(urlString) {
	const url = new URL(urlString);
	const database = url.pathname.replace(/^\//, "");
	return {
		host: url.hostname,
		port: url.port ? Number(url.port) : 5432,
		user: decodeURIComponent(url.username || ""),
		password: decodeURIComponent(url.password || ""),
		database,
		search: url.search,
	};
}

function deriveShadowUrl(mainUrl) {
	const u = new URL(mainUrl);
	const db = u.pathname.replace(/^\//, "");
	u.pathname = `/${db}_shadow`;
	return u.toString();
}

async function ensureDatabase(databaseUrl) {
	const cfg = parseDbUrl(databaseUrl);
	const adminClient = new Client({
		host: cfg.host,
		port: cfg.port,
		user: cfg.user,
		password: cfg.password,
		database: "postgres",
	});
	try {
		await adminClient.connect();
		const exists = await adminClient.query("SELECT 1 FROM pg_database WHERE datname = $1", [cfg.database]);
		if (exists.rowCount === 0) {
			try {
				await adminClient.query(`CREATE DATABASE "${cfg.database}" TEMPLATE template0;`);
				console.log(`Banco criado: ${cfg.database} (usando TEMPLATE template0)`);
			} catch (err) {
				console.warn(`Falha ao usar TEMPLATE template0 para ${cfg.database}. Tentando CREATE DATABASE padrão...`, err.message);
				await adminClient.query(`CREATE DATABASE "${cfg.database}";`);
				console.log(`Banco criado: ${cfg.database}`);
			}
		} else {
			console.log(`Banco já existe: ${cfg.database}`);
		}
	} finally {
		await adminClient.end().catch(() => {});
	}
}

(async () => {
	const mainUrl = process.env.DATABASE_URL;
	if (!mainUrl) {
		console.error("DATABASE_URL não definido no .env");
		process.exit(1);
	}
	const shadowUrl = process.env.SHADOW_DATABASE_URL || deriveShadowUrl(mainUrl);

	await ensureDatabase(mainUrl);
	await ensureDatabase(shadowUrl);

	if (!process.env.SHADOW_DATABASE_URL) {
		console.log("Dica: adicione SHADOW_DATABASE_URL ao .env para migrações mais rápidas.");
		console.log(`SHADOW_DATABASE_URL=${shadowUrl}`);
	}

	console.log("Pronto. Agora rode: npm run prisma:migrate");
})().catch((err) => {
	console.error("Erro ao criar bancos:", err);
	process.exit(1);
});


