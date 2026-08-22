// Kept outside the server bundle because esbuild versions predating node:sqlite
// can incorrectly rewrite the specifier to a third-party package named sqlite.
export { DatabaseSync } from 'node:sqlite';
