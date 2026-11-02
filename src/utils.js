export function safeError(e){ return e instanceof Error ? e.message : String(e ?? 'Unknown error'); }
