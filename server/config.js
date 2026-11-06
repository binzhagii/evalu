import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Where the database and secret key are kept. Tests point this at a temp folder.
export const DATA_DIR = process.env.EVALU_DATA_DIR || path.join(path.dirname(fileURLToPath(import.meta.url)), 'data');
