/**
 * k-d tree for nearest-neighbour search over fixed-length numeric keys.
 *
 * @template T
 * @typedef {{ item: T, axis: number, left: Node<T> | null, right: Node<T> | null }} Node
 */

/**
 * Build a balanced tree.
 * @template T
 * @param {T[]} items
 * @param {(item: T) => number[]} keyOf returns the vector used for distances
 * @returns {{ root: Node<T> | null, dims: number, keyOf: (item: T) => number[] }}
 */
export function buildKdTree(items, keyOf) {
  const dims = items.length ? keyOf(items[0]).length : 0;
  const build = (list, depth) => {
    if (!list.length) return null;
    const axis = depth % dims;
    const sorted = [...list].sort((a, b) => keyOf(a)[axis] - keyOf(b)[axis]);
    const mid = sorted.length >> 1;
    return {
      item: sorted[mid],
      axis,
      left: build(sorted.slice(0, mid), depth + 1),
      right: build(sorted.slice(mid + 1), depth + 1),
    };
  };
  return { root: build(items, 0), dims, keyOf };
}

/**
 * The k nearest items to `query`, closest first.
 * @template T
 * @param {ReturnType<typeof buildKdTree<T>>} tree
 * @param {number[]} query
 * @param {number} k
 * @returns {{ item: T, distance: number }[]}
 */
export function nearest(tree, query, k = 1) {
  const best = [];
  const visit = (node) => {
    if (!node) return;
    const key = tree.keyOf(node.item);
    let d2 = 0;
    for (let i = 0; i < tree.dims; i++) d2 += (key[i] - query[i]) ** 2;
    best.push({ item: node.item, distance: Math.sqrt(d2) });
    best.sort((a, b) => a.distance - b.distance);
    if (best.length > k) best.pop();

    const diff = query[node.axis] - key[node.axis];
    const [near, far] = diff < 0 ? [node.left, node.right] : [node.right, node.left];
    visit(near);
    if (best.length < k || Math.abs(diff) < best[best.length - 1].distance) visit(far);
  };
  visit(tree.root);
  return best;
}
