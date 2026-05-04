import request from 'supertest';
import { app } from '../../src/app.js';

/**
 * Returns a fresh supertest agent bound to the Express app. The app does
 * NOT call `server.listen()` under NODE_ENV=test, so supertest will spin
 * up its own ephemeral port per request.
 */
export const api = (): ReturnType<typeof request> => request(app);
