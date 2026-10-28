/**
 * For scripts run outside Next.js (seeds, one-off tasks): loads .env.local and
 * .env the same way Next.js does. Import this first, before anything that
 * reads process.env.
 */
import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());
