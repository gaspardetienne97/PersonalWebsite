import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

// Lazy initialization to avoid build-time dependency on DATABASE_URL
let _db: ReturnType<typeof drizzle> | null = null;

function getDb() {
	if (_db) return _db;
	
	const DATABASE_URL = process.env.DATABASE_URL;
	if (!DATABASE_URL) throw new Error('DATABASE_URL is not set');
	
	const client = postgres(DATABASE_URL);
	_db = drizzle(client, { schema });
	return _db;
}

export const db = new Proxy({} as ReturnType<typeof drizzle>, {
	get(target, prop) {
		return getDb()[prop as keyof ReturnType<typeof drizzle>];
	}
});
