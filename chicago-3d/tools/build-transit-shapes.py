#!/usr/bin/env python3
import csv
import io
import json
import math
import sys
import zipfile
from collections import defaultdict
from pathlib import Path


def rows(archive, name):
    with archive.open(name) as source:
        text = io.TextIOWrapper(source, encoding="utf-8-sig", newline="")
        yield from csv.DictReader(text, skipinitialspace=True)


def perpendicular_distance(point, start, end):
    if start == end:
        return math.hypot(point[0] - start[0], point[1] - start[1])
    dx = end[0] - start[0]
    dy = end[1] - start[1]
    amount = ((point[0] - start[0]) * dx + (point[1] - start[1]) * dy) / (dx * dx + dy * dy)
    projection = (start[0] + amount * dx, start[1] + amount * dy)
    return math.hypot(point[0] - projection[0], point[1] - projection[1])


def simplify(points, tolerance=0.000012):
    if len(points) <= 2:
        return points
    start = points[0]
    end = points[-1]
    distance = 0
    index = 0
    for candidate_index in range(1, len(points) - 1):
        candidate_distance = perpendicular_distance(points[candidate_index], start, end)
        if candidate_distance > distance:
            distance = candidate_distance
            index = candidate_index
    if distance <= tolerance:
        return [start, end]
    left = simplify(points[: index + 1], tolerance)
    right = simplify(points[index:], tolerance)
    return left[:-1] + right


def line_length(points):
    return sum(
        math.hypot(
            (right[0] - left[0]) * math.cos(math.radians((left[1] + right[1]) / 2)),
            right[1] - left[1],
        )
        for left, right in zip(points, points[1:])
    )


def canonical_signature(points):
    sample = points[:: max(1, len(points) // 80)]
    forward = ";".join(f"{point[0]:.5f},{point[1]:.5f}" for point in sample)
    reverse = ";".join(f"{point[0]:.5f},{point[1]:.5f}" for point in reversed(sample))
    return min(forward, reverse)


def extract(archive_path, agency, route_types, max_shapes=4):
    archive = zipfile.ZipFile(archive_path)
    routes = {}
    for row in rows(archive, "routes.txt"):
        if row["route_type"].strip() not in route_types:
            continue
        route_id = row["route_id"].strip()
        routes[route_id] = {
            "routeId": route_id,
            "routeName": (row.get("route_long_name") or row.get("route_short_name") or route_id).strip(),
            "color": f"#{(row.get('route_color') or '666666').strip()}",
        }

    route_shapes = defaultdict(set)
    for row in rows(archive, "trips.txt"):
        route_id = row["route_id"].strip()
        shape_id = row.get("shape_id", "").strip()
        if route_id in routes and shape_id:
            route_shapes[route_id].add(shape_id)

    wanted_shapes = {shape for shapes in route_shapes.values() for shape in shapes}
    shape_points = defaultdict(list)
    for row in rows(archive, "shapes.txt"):
        shape_id = row["shape_id"].strip()
        if shape_id not in wanted_shapes:
            continue
        shape_points[shape_id].append(
            (
                int(row["shape_pt_sequence"]),
                (float(row["shape_pt_lon"]), float(row["shape_pt_lat"])),
            )
        )

    features = []
    for route_id, metadata in routes.items():
        candidates = []
        for shape_id in route_shapes[route_id]:
            points = [point for _, point in sorted(shape_points[shape_id])]
            if len(points) >= 2:
                candidates.append((line_length(points), shape_id, points))
        candidates.sort(reverse=True)

        signatures = set()
        selected = 0
        for _, shape_id, points in candidates:
            reduced = simplify(points)
            signature = canonical_signature(reduced)
            if signature in signatures:
                continue
            signatures.add(signature)
            features.append(
                {
                    "type": "Feature",
                    "properties": {
                        **metadata,
                        "agency": agency,
                        "shapeId": shape_id,
                    },
                    "geometry": {
                        "type": "LineString",
                        "coordinates": reduced,
                    },
                }
            )
            selected += 1
            if selected >= max_shapes:
                break
    return features


def main():
    if len(sys.argv) != 4:
        raise SystemExit("usage: build-transit-shapes.py CTA_ZIP METRA_ZIP OUTPUT")
    features = [
        *extract(sys.argv[1], "cta", {"1"}, 4),
        *extract(sys.argv[2], "metra", {"2"}, 3),
    ]
    output = Path(sys.argv[3])
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(
        json.dumps(
            {
                "type": "FeatureCollection",
                "properties": {
                    "sources": [
                        "Chicago Transit Authority GTFS",
                        "Metra GTFS",
                    ]
                },
                "features": features,
            },
            separators=(",", ":"),
        ),
        encoding="utf-8",
    )
    print(f"wrote {len(features)} rail shapes to {output}")


if __name__ == "__main__":
    main()
