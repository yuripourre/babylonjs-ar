/**
 * Contour Processor
 * CPU-based contour following and quad extraction
 */

export interface Point {
  x: number;
  y: number;
}

export interface Contour {
  points: Point[];
  area: number;
  perimeter: number;
  isConvex: boolean;
}

export interface Quad {
  corners: [Point, Point, Point, Point]; // TL, TR, BR, BL
  area: number;
  perimeter: number;
}

export class ContourProcessor {
  /**
   * Find contours in binary image using border following
   */
  static findContours(
    imageData: Uint8Array,
    width: number,
    height: number,
    minPerimeter: number = 80,
    maxPerimeter: number = 2000
  ): Contour[] {
    const visited = new Uint8Array(width * height);
    const contours: Contour[] = [];

    // Scan for starting points
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = y * width + x;

        // Look for unvisited edge pixels
        if (imageData[idx] > 0 && visited[idx] === 0) {
          const contour = this.followBorder(imageData, width, height, x, y, visited);

          if (contour.points.length >= 4) {
            contour.perimeter = this.calculatePerimeter(contour.points);

            if (contour.perimeter >= minPerimeter && contour.perimeter <= maxPerimeter) {
              contour.area = this.calculateArea(contour.points);
              contour.isConvex = this.isConvex(contour.points);
              contours.push(contour);
            }
          }
        }
      }
    }

    return contours;
  }

  /**
   * Follow border to extract contour
   */
  private static followBorder(
    imageData: Uint8Array,
    width: number,
    height: number,
    startX: number,
    startY: number,
    visited: Uint8Array
  ): Contour {
    const points: Point[] = [];
    const directions = [
      { dx: 1, dy: 0 },   // East
      { dx: 1, dy: 1 },   // SE
      { dx: 0, dy: 1 },   // South
      { dx: -1, dy: 1 },  // SW
      { dx: -1, dy: 0 },  // West
      { dx: -1, dy: -1 }, // NW
      { dx: 0, dy: -1 },  // North
      { dx: 1, dy: -1 },  // NE
    ];

    let x = startX;
    let y = startY;
    let dir = 0; // Start direction

    const maxIterations = width * height; // Prevent infinite loops
    let iterations = 0;

    do {
      points.push({ x, y });
      visited[y * width + x] = 1;

      // Look for next border pixel
      let found = false;
      for (let i = 0; i < 8; i++) {
        const checkDir = (dir + i) % 8;
        const nx = x + directions[checkDir].dx;
        const ny = y + directions[checkDir].dy;

        if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
          const idx = ny * width + nx;
          if (imageData[idx] > 0) {
            x = nx;
            y = ny;
            dir = (checkDir + 6) % 8; // Turn left
            found = true;
            break;
          }
        }
      }

      if (!found || ++iterations > maxIterations) break;

      // Stop if we've returned to start
      if (x === startX && y === startY && points.length > 2) break;

    } while (true);

    return { points, area: 0, perimeter: 0, isConvex: false };
  }

  /**
   * Approximate contour to polygon
   */
  static approximatePolygon(contour: Contour, epsilon?: number): Point[] {
    if (contour.points.length < 3) return contour.points;

    // Douglas-Peucker algorithm
    const eps = epsilon ?? contour.perimeter * 0.02; // 2% of perimeter
    return this.douglasPeucker(contour.points, eps);
  }

  /**
   * Douglas-Peucker simplification
   */
  private static douglasPeucker(points: Point[], epsilon: number): Point[] {
    if (points.length <= 2) return points;

    // Find point with max distance
    let maxDist = 0;
    let maxIndex = 0;

    const start = points[0];
    const end = points[points.length - 1];

    for (let i = 1; i < points.length - 1; i++) {
      const dist = this.perpendicularDistance(points[i], start, end);
      if (dist > maxDist) {
        maxDist = dist;
        maxIndex = i;
      }
    }

    // If max distance is greater than epsilon, recursively simplify
    if (maxDist > epsilon) {
      const left = this.douglasPeucker(points.slice(0, maxIndex + 1), epsilon);
      const right = this.douglasPeucker(points.slice(maxIndex), epsilon);

      // Combine results (remove duplicate middle point)
      return [...left.slice(0, -1), ...right];
    } else {
      return [start, end];
    }
  }

  /**
   * Calculate perpendicular distance from point to line
   */
  private static perpendicularDistance(point: Point, lineStart: Point, lineEnd: Point): number {
    const dx = lineEnd.x - lineStart.x;
    const dy = lineEnd.y - lineStart.y;

    if (dx === 0 && dy === 0) {
      return Math.hypot(point.x - lineStart.x, point.y - lineStart.y);
    }

    const num = Math.abs(dy * point.x - dx * point.y + lineEnd.x * lineStart.y - lineEnd.y * lineStart.x);
    const den = Math.hypot(dx, dy);

    return num / den;
  }

  /**
   * Try to extract quad from polygon
   */
  static extractQuad(polygon: Point[]): Quad | null {
    if (polygon.length !== 4) return null;

    // Order corners: TL, TR, BR, BL
    const corners = this.orderQuadCorners(polygon);

    // Validate quad
    if (!this.isValidQuad(corners)) {
      return null;
    }

    const area = this.calculateArea(corners);
    const perimeter = this.calculatePerimeter(corners);

    return {
      corners: [corners[0], corners[1], corners[2], corners[3]],
      area,
      perimeter,
    };
  }

  /**
   * Order quad corners consistently (TL, TR, BR, BL)
   */
  private static orderQuadCorners(points: Point[]): Point[] {
    // Find centroid
    const cx = points.reduce((sum, p) => sum + p.x, 0) / points.length;
    const cy = points.reduce((sum, p) => sum + p.y, 0) / points.length;

    // Sort by angle from centroid
    const sorted = points.slice().sort((a, b) => {
      const angleA = Math.atan2(a.y - cy, a.x - cx);
      const angleB = Math.atan2(b.y - cy, b.x - cx);
      return angleA - angleB;
    });

    // Find top-left (minimum x+y)
    let tlIdx = 0;
    let minSum = sorted[0].x + sorted[0].y;

    for (let i = 1; i < sorted.length; i++) {
      const sum = sorted[i].x + sorted[i].y;
      if (sum < minSum) {
        minSum = sum;
        tlIdx = i;
      }
    }

    // Reorder starting from top-left, going clockwise
    const ordered = [];
    for (let i = 0; i < 4; i++) {
      ordered.push(sorted[(tlIdx + i) % 4]);
    }

    return ordered;
  }

  /**
   * Validate quad geometry
   */
  private static isValidQuad(corners: Point[]): boolean {
    if (corners.length !== 4) return false;

    // Check aspect ratio (should be roughly square for markers)
    const width1 = Math.hypot(corners[1].x - corners[0].x, corners[1].y - corners[0].y);
    const width2 = Math.hypot(corners[2].x - corners[3].x, corners[2].y - corners[3].y);
    const height1 = Math.hypot(corners[3].x - corners[0].x, corners[3].y - corners[0].y);
    const height2 = Math.hypot(corners[2].x - corners[1].x, corners[2].y - corners[1].y);

    const avgWidth = (width1 + width2) / 2;
    const avgHeight = (height1 + height2) / 2;

    const aspectRatio = Math.max(avgWidth, avgHeight) / Math.min(avgWidth, avgHeight);

    // Markers should be roughly square (aspect ratio < 2)
    if (aspectRatio > 2.0) return false;

    // Check minimum size
    if (avgWidth < 20 || avgHeight < 20) return false;

    return true;
  }

  /**
   * Calculate polygon area
   */
  private static calculateArea(points: Point[]): number {
    let area = 0;
    for (let i = 0; i < points.length; i++) {
      const j = (i + 1) % points.length;
      area += points[i].x * points[j].y;
      area -= points[j].x * points[i].y;
    }
    return Math.abs(area) / 2;
  }

  /**
   * Calculate polygon perimeter
   */
  private static calculatePerimeter(points: Point[]): number {
    let perimeter = 0;
    for (let i = 0; i < points.length; i++) {
      const j = (i + 1) % points.length;
      perimeter += Math.hypot(points[j].x - points[i].x, points[j].y - points[i].y);
    }
    return perimeter;
  }

  /**
   * Check if polygon is convex
   */
  private static isConvex(points: Point[]): boolean {
    if (points.length < 3) return false;

    let sign = 0;

    for (let i = 0; i < points.length; i++) {
      const p1 = points[i];
      const p2 = points[(i + 1) % points.length];
      const p3 = points[(i + 2) % points.length];

      const cross = (p2.x - p1.x) * (p3.y - p2.y) - (p2.y - p1.y) * (p3.x - p2.x);

      if (cross !== 0) {
        if (sign === 0) {
          sign = cross > 0 ? 1 : -1;
        } else if ((cross > 0 ? 1 : -1) !== sign) {
          return false;
        }
      }
    }

    return true;
  }
}
