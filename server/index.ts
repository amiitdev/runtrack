/**
 * Vercel serverless entry.
 *
 * Vercel treats every top-level *.ts file in /api as a function, so this file
 * must live HERE (not in src/) and must only re-export the Express app.
 * Everything else — routes, middleware, error handler — stays in src/.
 */
export { default } from './src/app.js';
