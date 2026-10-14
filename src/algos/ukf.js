import { wrapAngle } from './geometry.js';

/**
 * Unscented Kalman filter for tracking one moving object seen as a noisy (x, y) point.
 *
 * Motion model: constant turn rate and velocity (CTRV). State is
 * [x, y, speed, heading, turn rate]. Process noise is a random acceleration and a random
 * turn-rate change; measurement is the object's position from a sensor.
 *
 * The filter keeps the state estimate and its covariance, so a caller can draw the
 * uncertainty and gate new detections with a Mahalanobis distance.
 */

const N = 5;
const NA = 7;
const LAMBDA = 3;
const NSIG = 2 * NA + 1;
const WEIGHTS = Array.from({ length: NSIG }, (_, i) =>
  i === 0 ? LAMBDA / (LAMBDA + NA) : 1 / (2 * (LAMBDA + NA)),
);

const zeros = (r, c) => Array.from({ length: r }, () => new Array(c).fill(0));

/** Lower-triangular Cholesky factor of a symmetric positive-definite matrix. */
export function cholesky(A) {
  const n = A.length;
  const L = zeros(n, n);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j <= i; j++) {
      let s = A[i][j];
      for (let k = 0; k < j; k++) s -= L[i][k] * L[j][k];
      L[i][j] = i === j ? Math.sqrt(Math.max(s, 1e-12)) : s / L[j][j];
    }
  }
  return L;
}

/** One step of the CTRV motion model for a single augmented sigma point. */
export function ctrv(s, dt) {
  const [px, py, v, yaw, yawd, na, nyaw] = s;
  let x, y;
  if (Math.abs(yawd) > 1e-3) {
    x = px + (v / yawd) * (Math.sin(yaw + yawd * dt) - Math.sin(yaw));
    y = py + (v / yawd) * (Math.cos(yaw) - Math.cos(yaw + yawd * dt));
  } else {
    x = px + v * Math.cos(yaw) * dt;
    y = py + v * Math.sin(yaw) * dt;
  }
  const h = 0.5 * dt * dt;
  return [
    x + h * Math.cos(yaw) * na,
    y + h * Math.sin(yaw) * na,
    v + dt * na,
    yaw + yawd * dt + h * nyaw,
    yawd + dt * nyaw,
  ];
}

export class UKF {
  /**
   * @param {object} init
   * @param {number} init.x first measured x
   * @param {number} init.y first measured y
   * @param {number} [init.speed] initial speed guess
   * @param {number} [init.heading] initial heading guess, radians
   * @param {object} [noise]
   * @param {number} [noise.accel] std of acceleration noise, m/s^2
   * @param {number} [noise.yawAccel] std of turn-rate change noise, rad/s^2
   * @param {number} [noise.meas] std of the position measurement, m
   */
  constructor({ x, y, speed = 0, heading = 0 }, { accel = 2, yawAccel = 0.7, meas = 0.3 } = {}) {
    this.noise = { accel, yawAccel, meas };
    this.x = [x, y, speed, heading, 0];
    this.P = zeros(N, N);
    const d = [meas * meas, meas * meas, 25, 1.5, 0.5];
    d.forEach((v, i) => (this.P[i][i] = v));
    this.nis = 0;
    this.Xpred = null;
  }

  /** Move the estimate forward by dt seconds and grow its uncertainty. */
  predict(dt) {
    const { accel, yawAccel } = this.noise;
    const Pa = zeros(NA, NA);
    for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) Pa[i][j] = this.P[i][j];
    Pa[5][5] = accel * accel;
    Pa[6][6] = yawAccel * yawAccel;
    const L = cholesky(Pa);
    const xa = [...this.x, 0, 0];
    const k = Math.sqrt(LAMBDA + NA);
    const sig = [xa];
    for (let c = 0; c < NA; c++) {
      const plus = xa.slice();
      const minus = xa.slice();
      for (let r = 0; r < NA; r++) {
        plus[r] += k * L[r][c];
        minus[r] -= k * L[r][c];
      }
      sig.push(plus, minus);
    }
    const X = sig.map((s) => ctrv(s, dt));
    const mean = new Array(N).fill(0);
    X.forEach((s, i) => s.forEach((v, r) => (mean[r] += WEIGHTS[i] * v)));
    mean[3] = wrapAngle(mean[3]);
    const P = zeros(N, N);
    X.forEach((s, i) => {
      const d = s.map((v, r) => v - mean[r]);
      d[3] = wrapAngle(d[3]);
      for (let a = 0; a < N; a++) for (let b = 0; b < N; b++) P[a][b] += WEIGHTS[i] * d[a] * d[b];
    });
    this.x = mean;
    this.P = P;
    this.Xpred = X;
  }

  /** Predicted measurement and its covariance; needs predict() to have run. */
  innovationModel() {
    const r2 = this.noise.meas * this.noise.meas;
    const Z = this.Xpred.map((s) => [s[0], s[1]]);
    const zp = [0, 0];
    Z.forEach((z, i) => {
      zp[0] += WEIGHTS[i] * z[0];
      zp[1] += WEIGHTS[i] * z[1];
    });
    const S = [
      [r2, 0],
      [0, r2],
    ];
    const T = zeros(N, 2);
    this.Xpred.forEach((s, i) => {
      const dz = [Z[i][0] - zp[0], Z[i][1] - zp[1]];
      const dx = s.map((v, r) => v - this.x[r]);
      dx[3] = wrapAngle(dx[3]);
      for (let a = 0; a < 2; a++) for (let b = 0; b < 2; b++) S[a][b] += WEIGHTS[i] * dz[a] * dz[b];
      for (let a = 0; a < N; a++) for (let b = 0; b < 2; b++) T[a][b] += WEIGHTS[i] * dx[a] * dz[b];
    });
    return { zp, S, T };
  }

  /**
   * Squared Mahalanobis distance of a detection from the predicted position.
   * Small means plausible; use it to decide which detection belongs to this track.
   */
  distance2(z) {
    const { zp, S } = this.innovationModel();
    const dx = z[0] - zp[0];
    const dy = z[1] - zp[1];
    const det = S[0][0] * S[1][1] - S[0][1] * S[1][0];
    return (S[1][1] * dx * dx - (S[0][1] + S[1][0]) * dx * dy + S[0][0] * dy * dy) / det;
  }

  /** Correct the estimate with a measured position [x, y]. */
  update(z) {
    const { zp, S, T } = this.innovationModel();
    const det = S[0][0] * S[1][1] - S[0][1] * S[1][0];
    const Si = [
      [S[1][1] / det, -S[0][1] / det],
      [-S[1][0] / det, S[0][0] / det],
    ];
    const K = zeros(N, 2);
    for (let a = 0; a < N; a++)
      for (let b = 0; b < 2; b++) K[a][b] = T[a][0] * Si[0][b] + T[a][1] * Si[1][b];
    const y = [z[0] - zp[0], z[1] - zp[1]];
    for (let a = 0; a < N; a++) this.x[a] += K[a][0] * y[0] + K[a][1] * y[1];
    this.x[3] = wrapAngle(this.x[3]);
    for (let a = 0; a < N; a++)
      for (let b = 0; b < N; b++) {
        let s = 0;
        for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) s += K[a][i] * S[i][j] * K[b][j];
        this.P[a][b] -= s;
      }
    this.nis =
      y[0] * (Si[0][0] * y[0] + Si[0][1] * y[1]) + y[1] * (Si[1][0] * y[0] + Si[1][1] * y[1]);
    return this.nis;
  }

  /** Position of the estimate. */
  get position() {
    return [this.x[0], this.x[1]];
  }

  /** Velocity vector [vx, vy] in m/s. */
  get velocity() {
    return [this.x[2] * Math.cos(this.x[3]), this.x[2] * Math.sin(this.x[3])];
  }

  /**
   * Uncertainty ellipse of the position: semi-axes and rotation for `sigmas` standard deviations.
   * @returns {{ a: number, b: number, angle: number }}
   */
  ellipse(sigmas = 2) {
    const pxx = this.P[0][0];
    const pyy = this.P[1][1];
    const pxy = this.P[0][1];
    const tr = (pxx + pyy) / 2;
    const d = Math.sqrt(Math.max(0, ((pxx - pyy) / 2) ** 2 + pxy * pxy));
    return {
      a: sigmas * Math.sqrt(Math.max(tr + d, 0)),
      b: sigmas * Math.sqrt(Math.max(tr - d, 0)),
      angle: 0.5 * Math.atan2(2 * pxy, pxx - pyy),
    };
  }
}
