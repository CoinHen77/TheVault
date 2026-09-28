import { describe, expect, it } from 'vitest';
import { SHARED_VERSION } from '../src/index.js';

describe('@vault/shared', () => {
  it('is importable and has no Firebase dependency', () => {
    expect(SHARED_VERSION).toBe('0.1.0');
  });
});
