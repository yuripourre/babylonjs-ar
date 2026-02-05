/**
 * k-d Tree for fast spatial queries
 * Optimized for 3D nearest neighbor search
 */

import { Vector3 } from '../core/math/vector';

interface KDNode {
  point: Vector3;
  index: number;
  left: KDNode | null;
  right: KDNode | null;
  axis: number;
}

export class KDTree {
  private root: KDNode | null = null;
  private points: Vector3[] = [];

  /**
   * Build k-d tree from points
   * Complexity: O(n log n)
   */
  build(points: Vector3[]): void {
    this.points = points;
    const indices = points.map((_, i) => i);
    this.root = this.buildRecursive(indices, 0);
  }

  /**
   * Recursively build k-d tree
   */
  private buildRecursive(indices: number[], depth: number): KDNode | null {
    if (indices.length === 0) {
      return null;
    }

    if (indices.length === 1) {
      return {
        point: this.points[indices[0]],
        index: indices[0],
        left: null,
        right: null,
        axis: depth % 3,
      };
    }

    // Choose axis based on depth
    const axis = depth % 3;

    // Sort by current axis
    indices.sort((a, b) => {
      const pa = this.points[a];
      const pb = this.points[b];
      if (axis === 0) {return pa.x - pb.x;}
      if (axis === 1) {return pa.y - pb.y;}
      return pa.z - pb.z;
    });

    // Choose median as pivot
    const median = Math.floor(indices.length / 2);
    const medianIndex = indices[median];

    return {
      point: this.points[medianIndex],
      index: medianIndex,
      left: this.buildRecursive(indices.slice(0, median), depth + 1),
      right: this.buildRecursive(indices.slice(median + 1), depth + 1),
      axis,
    };
  }

  /**
   * Find k nearest neighbors
   * Complexity: O(log n) average, O(n) worst case
   */
  kNearestNeighbors(target: Vector3, k: number): Vector3[] {
    if (!this.root) {
      return [];
    }

    const results: Array<{ point: Vector3; distSq: number }> = [];

    this.searchRecursive(this.root, target, k, results);

    return results.map((r) => r.point);
  }

  /**
   * Recursive k-NN search
   */
  private searchRecursive(
    node: KDNode | null,
    target: Vector3,
    k: number,
    results: Array<{ point: Vector3; distSq: number }>
  ): void {
    if (!node) {
      return;
    }

    // Compute distance to current node
    const distSq = target.distanceToSquared(node.point);

    // Add to results if within k closest
    if (results.length < k) {
      results.push({ point: node.point, distSq });
      results.sort((a, b) => a.distSq - b.distSq);
    } else if (distSq < results[k - 1].distSq) {
      results[k - 1] = { point: node.point, distSq };
      results.sort((a, b) => a.distSq - b.distSq);
    }

    // Determine which subtree to search first
    const axis = node.axis;
    let diff: number;
    if (axis === 0) {diff = target.x - node.point.x;}
    else if (axis === 1) {diff = target.y - node.point.y;}
    else {diff = target.z - node.point.z;}

    const near = diff < 0 ? node.left : node.right;
    const far = diff < 0 ? node.right : node.left;

    // Search near subtree
    this.searchRecursive(near, target, k, results);

    // Check if we need to search far subtree
    // Only if hypersphere crosses splitting plane
    if (results.length < k || diff * diff < results[k - 1].distSq) {
      this.searchRecursive(far, target, k, results);
    }
  }

  /**
   * Find all neighbors within radius
   * Complexity: O(log n) average
   */
  radiusSearch(target: Vector3, radius: number): Vector3[] {
    if (!this.root) {
      return [];
    }

    const results: Vector3[] = [];
    const radiusSq = radius * radius;

    this.radiusSearchRecursive(this.root, target, radiusSq, results);

    return results;
  }

  /**
   * Recursive radius search
   */
  private radiusSearchRecursive(
    node: KDNode | null,
    target: Vector3,
    radiusSq: number,
    results: Vector3[]
  ): void {
    if (!node) {
      return;
    }

    // Check if current node is within radius
    const distSq = target.distanceToSquared(node.point);
    if (distSq <= radiusSq) {
      results.push(node.point);
    }

    // Determine which subtrees to search
    const axis = node.axis;
    let diff: number;
    if (axis === 0) {diff = target.x - node.point.x;}
    else if (axis === 1) {diff = target.y - node.point.y;}
    else {diff = target.z - node.point.z;}

    // Always search near subtree
    const near = diff < 0 ? node.left : node.right;
    const far = diff < 0 ? node.right : node.left;

    this.radiusSearchRecursive(near, target, radiusSq, results);

    // Search far subtree if hypersphere crosses splitting plane
    if (diff * diff <= radiusSq) {
      this.radiusSearchRecursive(far, target, radiusSq, results);
    }
  }

  /**
   * Clear the tree
   */
  clear(): void {
    this.root = null;
    this.points = [];
  }

  /**
   * Get number of points in tree
   */
  size(): number {
    return this.points.length;
  }
}
