/**
 * Solve A x = b for a symmetric positive-definite matrix with a Cholesky factorisation.
 * Dense and simple; fine for the small systems in the demos.
 *
 * @param {Float64Array | number[]} A row-major n x n matrix
 * @param {Float64Array | number[]} b right-hand side, length n
 * @param {number} n
 * @returns {Float64Array} x
 */
export function choleskySolve(A, b, n) {
  const L = new Float64Array(n * n);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j <= i; j++) {
      let s = A[i * n + j];
      for (let k = 0; k < j; k++) s -= L[i * n + k] * L[j * n + k];
      L[i * n + j] = i === j ? Math.sqrt(Math.max(s, 1e-12)) : s / L[j * n + j];
    }
  }
  const y = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    let s = b[i];
    for (let k = 0; k < i; k++) s -= L[i * n + k] * y[k];
    y[i] = s / L[i * n + i];
  }
  const x = new Float64Array(n);
  for (let i = n - 1; i >= 0; i--) {
    let s = y[i];
    for (let k = i + 1; k < n; k++) s -= L[k * n + i] * x[k];
    x[i] = s / L[i * n + i];
  }
  return x;
}

/**
 * Inverse of a symmetric positive-definite matrix, one Cholesky factorisation and n solves.
 * @param {Float64Array | number[]} A row-major n x n matrix
 * @param {number} n
 * @returns {Float64Array} row-major n x n inverse
 */
export function choleskyInverse(A, n) {
  const inv = new Float64Array(n * n);
  const e = new Float64Array(n);
  for (let c = 0; c < n; c++) {
    e.fill(0);
    e[c] = 1;
    const col = choleskySolve(A, e, n);
    for (let r = 0; r < n; r++) inv[r * n + c] = col[r];
  }
  return inv;
}
