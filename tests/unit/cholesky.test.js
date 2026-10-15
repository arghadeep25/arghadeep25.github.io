import { describe, expect, it } from 'vitest';
import { choleskyInverse, choleskySolve } from '../../src/algos/cholesky.js';
import { mulberry32 } from './helpers.js';

describe('choleskySolve', () => {
  it('solves a known 3x3 system', () => {
    const A = [4, 12, -16, 12, 37, -43, -16, -43, 98];
    const x = choleskySolve(A, [1, 2, 3], 3);
    // check by multiplying back
    const b = [0, 1, 2].map((i) => A[i * 3] * x[0] + A[i * 3 + 1] * x[1] + A[i * 3 + 2] * x[2]);
    b.forEach((v, i) => expect(v).toBeCloseTo([1, 2, 3][i], 6));
  });

  it('solves random symmetric positive-definite systems', () => {
    const rnd = mulberry32(11);
    const n = 12;
    const M = Array.from({ length: n * n }, () => rnd() - 0.5);
    // A = M M^T + n I is symmetric positive definite
    const A = new Float64Array(n * n);
    for (let i = 0; i < n; i++)
      for (let j = 0; j < n; j++) {
        let s = i === j ? n : 0;
        for (let k = 0; k < n; k++) s += M[i * n + k] * M[j * n + k];
        A[i * n + j] = s;
      }
    const truth = Array.from({ length: n }, () => rnd() * 10 - 5);
    const b = Array.from({ length: n }, (_, i) =>
      truth.reduce((s, t, j) => s + A[i * n + j] * t, 0),
    );
    const x = choleskySolve(A, b, n);
    truth.forEach((t, i) => expect(x[i]).toBeCloseTo(t, 6));
  });
});

describe('choleskyInverse', () => {
  it('gives a matrix that multiplies back to the identity', () => {
    const A = [4, 1, 0, 1, 3, 1, 0, 1, 2];
    const inv = choleskyInverse(A, 3);
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) {
        let s = 0;
        for (let k = 0; k < 3; k++) s += A[r * 3 + k] * inv[k * 3 + c];
        expect(s).toBeCloseTo(r === c ? 1 : 0, 9);
      }
    }
  });
});
