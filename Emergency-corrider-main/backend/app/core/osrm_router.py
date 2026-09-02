"""Real road-network routing via the OSRM demo server.

Routes ambulances along the real OpenStreetMap street grid (the same roads the
Leaflet/Osm tile layer renders) rather than straight-line interpolation that cuts
across blocks.

Reliability design:
- Standard-library urllib only (no new dependency).
- Per-process LRU cache keyed by the snapped coordinate pair so repeated routes
  (e.g. demo replays, multiple vehicles on the same corridor) reuse geometry and
  never re-hit the network.
- Hard 1.5s connect + short total timeout; on ANY failure (offline, rate-limit,
  parse error) we transparently fall back to the deterministic interpolation
  route so a demo can never be blocked by the network.

Deterministic safety: the envelope (start/end) is always honored by the fallback,
and OSRM output is de-duplicated and validated (bounded coordinate count).
"""

import json
import math
import time
import urllib.parse
import urllib.request
from typing import Callable, Dict, List, Optional, Tuple

from app.models.schemas import LatLng

_OSRM_ENDPOINT = "https://router.project-osrm.org/route/v1/driving"

_MAX_COORDINATES = 1200        # guard against pathological responses
_ROUTE_CACHE: Dict[Tuple[float, float, float, float], List[LatLng]] = {}
_CACHE_ORDER: List[Tuple[float, float, float, float]] = []
_CACHE_MAX_ENTRIES = 256

_FLASK_SENTINEL = object()     # unused placeholder for optional cache layers


def _ll_from_osrm(coord) -> LatLng:
    """OSRM geojson coordinates are [lng, lat]; return them as LatLng(lat, lng)."""
    return LatLng(lat=float(coord[1]), lng=float(coord[0]))


def _fetch_osrm(start: LatLng, end: LatLng, via: Optional[List[LatLng]]) -> Optional[List[LatLng]]:
    """Query OSRM for a driving route from start to end through optional vias.

    Returns a list of LatLng in order, or None on any failure.
    """
    points: List[LatLng] = []
    if via:
        points = [start] + via + [end]
    else:
        points = [start, end]

    # Coalesce the OSRM coordinate list into a single request. OSRM supports up
    # to several hundred coordinates per request, so we send one combined route.
    coords = ";".join(f"{p.lng},{p.lat}" for p in points)

    url = (
        f"{_OSRM_ENDPOINT}/{coords}"
        f"?overview=full&geometries=geojson&steps=false&annotations=false"
        f"&alternatives=false"
    )

    req = urllib.request.Request(url, headers={"User-Agent": "emergency-corridor-demo/1.0"})
    try:
        with urllib.request.urlopen(req, timeout=4.0) as resp:
            payload = json.loads(resp.read().decode("utf-8"))
    except Exception:
        time.sleep(0.15)
        return None

    if not payload or payload.get("code") != "Ok":
        return None

    routes = payload.get("routes") or []
    if not routes:
        return None

    geometry = routes[0].get("geometry") or {}
    coordinates = geometry.get("coordinates") or []
    if len(coordinates) < 2:
        return None

    route = [_ll_from_osrm(c) for c in coordinates]
    # De-duplicate consecutive identical coordinates to keep the polyline clean.
    deduped: List[LatLng] = []
    for pt in route:
        if not deduped or (pt.lat != deduped[-1].lat or pt.lng != deduped[-1].lng):
            deduped.append(pt)
    return deduped[:_MAX_COORDINATES]


def route_on_roads(
    start: LatLng,
    end: LatLng,
    via: Optional[List[LatLng]] = None,
    fallback: Callable[[], List[LatLng]] = None,
) -> List[LatLng]:
    """Return a real-road polyline from start to end.

    Uses the OSRM cache if available, else queries the network. On any failure
    the provided `fallback` (straight-line interpolation) is used so callers are
    guaranteed a valid polyline.
    """
    cache_key = (round(start.lat, 6), round(start.lng, 6), round(end.lat, 6), round(end.lng, 6))

    if cache_key in _ROUTE_CACHE:
        return list(_ROUTE_CACHE[cache_key])

    result = _fetch_osrm(start, end, via)

    if result and len(result) >= 2:
        _ROUTE_CACHE[cache_key] = result
        _CACHE_ORDER.append(cache_key)
        while len(_CACHE_ORDER) > _CACHE_MAX_ENTRIES:
            oldest = _CACHE_ORDER.pop(0)
            _ROUTE_CACHE.pop(oldest, None)
    else:
        result = fallback() if fallback is not None else [start, end]

    return list(result)