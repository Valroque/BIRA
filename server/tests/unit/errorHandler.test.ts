import { afterEach, describe, expect, it } from 'vitest';
import express, { type Express } from 'express';
import request from 'supertest';
import { z } from 'zod';
import { errorHandler, asyncHandler } from '../../src/middleware/errorHandler.js';
import { AppError, EntityError, ServiceError } from '../../src/lib/errors.js';

function makeApp(throwFn: () => unknown): Express {
  const app = express();
  app.get(
    '/boom',
    asyncHandler(async () => {
      throw throwFn();
    })
  );
  app.use(errorHandler);
  return app;
}

describe('errorHandler', () => {
  it('AppError → status + message + data echoed', async () => {
    const app = makeApp(() => new AppError('teapot', 418, { extra: 1 }));
    const res = await request(app).get('/boom');
    expect(res.status).toBe(418);
    expect(res.body).toMatchObject({
      success: false,
      message: 'teapot',
      data: { extra: 1 },
    });
  });

  it('AppError without data → no `data` key in body', async () => {
    const app = makeApp(() => new AppError('plain', 400));
    const res = await request(app).get('/boom');
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toBe('plain');
    expect('data' in res.body).toBe(false);
  });

  it('ServiceError → mapped to its statusCode with message', async () => {
    const app = makeApp(() => new ServiceError('rule violated', 422));
    const res = await request(app).get('/boom');
    expect(res.status).toBe(422);
    expect(res.body).toMatchObject({ success: false, message: 'rule violated' });
  });

  it('ZodError → 400 with path-prefixed message', async () => {
    const app = makeApp(() => {
      try {
        z.object({ a: z.string() }).parse({ a: 1 });
      } catch (err) {
        return err;
      }
      throw new Error('zod did not throw');
    });
    const res = await request(app).get('/boom');
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toContain('a:');
  });

  it('EntityError → 500 with hidden internal message', async () => {
    const app = makeApp(() => new EntityError('id is required', 'User', 'id'));
    const res = await request(app).get('/boom');
    expect(res.status).toBe(500);
    expect(res.body.message).toBe('Internal data error');
    // The original entity-level message MUST NOT leak.
    expect(res.body.message).not.toContain('id is required');
  });

  it('PG 23505 (unique violation) → 400 Duplicate', async () => {
    const app = makeApp(() => ({ code: '23505' }));
    const res = await request(app).get('/boom');
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Duplicate field value entered');
  });

  it('PG 23502 (not-null) → 400 with detail', async () => {
    const app = makeApp(() => ({ code: '23502', detail: 'col x null' }));
    const res = await request(app).get('/boom');
    expect(res.status).toBe(400);
    expect(res.body.message).toContain('col x null');
  });

  it('plain Error → 500 with the original message', async () => {
    const app = makeApp(() => new Error('boom'));
    const res = await request(app).get('/boom');
    expect(res.status).toBe(500);
    expect(res.body.message).toBe('boom');
  });

  it('non-Error throw → 500 generic message', async () => {
    const app = makeApp(() => 'string');
    const res = await request(app).get('/boom');
    expect(res.status).toBe(500);
    expect(res.body.message).toBe('Server Error');
  });
});

describe('errorHandler — dev stack trace', () => {
  // setup.ts forces NODE_ENV=test; flip it deliberately and restore after.
  const original = process.env.NODE_ENV;
  afterEach(() => {
    process.env.NODE_ENV = original;
  });

  it('includes `stack` on the body when NODE_ENV=development', async () => {
    process.env.NODE_ENV = 'development';
    const app = makeApp(() => new Error('boom-dev'));
    const res = await request(app).get('/boom');
    expect(res.status).toBe(500);
    expect(typeof res.body.stack).toBe('string');
    expect(res.body.stack.length).toBeGreaterThan(0);
  });

  it('omits `stack` when NODE_ENV is not development', async () => {
    process.env.NODE_ENV = 'test';
    const app = makeApp(() => new Error('boom-prod'));
    const res = await request(app).get('/boom');
    expect(res.status).toBe(500);
    expect('stack' in res.body).toBe(false);
  });
});
