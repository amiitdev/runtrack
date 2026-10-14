/**
 * Vercel serverless entry — the ONLY file allowed to live in /api.
 *
 * Vercel turns every .ts file under /api into its own Lambda, and the Hobby
 * plan caps a deployment at 12. The Express app therefore lives one level up
 * in /server and this file simply re-exports it, so the whole API deploys as
 * exactly one function.
 */
export { default } from '../server/src/app.js';
