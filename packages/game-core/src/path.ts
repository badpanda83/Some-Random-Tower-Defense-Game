import type { Point } from "./types.js";

interface PathSegment {
  readonly start: Point;
  readonly end: Point;
  readonly startDistanceMilli: number;
  readonly lengthMilli: number;
}

export interface PreparedPath {
  readonly segments: readonly PathSegment[];
  readonly totalDistanceMilli: number;
}

export function preparePath(points: readonly Point[]): PreparedPath {
  if (points.length < 2) {
    throw new Error("A path requires at least two points");
  }

  const segments: PathSegment[] = [];
  let distanceMilli = 0;

  for (let index = 0; index < points.length - 1; index += 1) {
    const start = points[index];
    const end = points[index + 1];
    if (!start || !end) {
      throw new Error("Path segment is missing an endpoint");
    }

    const lengthMilli = Math.round(
      Math.hypot(end.x - start.x, end.y - start.y) * 1000,
    );
    segments.push({
      start,
      end,
      startDistanceMilli: distanceMilli,
      lengthMilli,
    });
    distanceMilli += lengthMilli;
  }

  return { segments, totalDistanceMilli: distanceMilli };
}

export function pointAlongPath(
  path: PreparedPath,
  distanceMilli: number,
): Point {
  const clamped = Math.max(0, Math.min(path.totalDistanceMilli, distanceMilli));
  const segment =
    path.segments.find(
      (candidate) =>
        clamped <= candidate.startDistanceMilli + candidate.lengthMilli,
    ) ?? path.segments[path.segments.length - 1];

  if (!segment) {
    throw new Error("Prepared path has no segments");
  }

  const progressMilli =
    ((clamped - segment.startDistanceMilli) * 1000) / segment.lengthMilli;

  return {
    x: Math.round(
      segment.start.x +
        ((segment.end.x - segment.start.x) * progressMilli) / 1000,
    ),
    y: Math.round(
      segment.start.y +
        ((segment.end.y - segment.start.y) * progressMilli) / 1000,
    ),
  };
}
