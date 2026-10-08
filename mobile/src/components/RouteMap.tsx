import { StyleSheet, Text, View } from 'react-native';
import {
  Camera,
  GeoJSONSource,
  Layer,
  Map,
  Marker,
} from '@maplibre/maplibre-react-native';
import { colors, radius, spacing, type } from '../theme';

/**
 * OpenFreeMap — free vector tiles, no API key, no usage cap, no account.
 * The `dark` style matches RunTrack's UI (background rgb(12,12,12)).
 *
 * Chosen over Google Maps because a standalone APK has no
 * `com.google.android.geo.API_KEY`, and the Google Android SDK *aborts the
 * process* when it cannot find one — a native throw JS cannot catch.
 */
const OPENFREE_DARK = 'https://tiles.openfreemap.org/styles/dark';

export interface MapPoint {
  latitude: number;
  longitude: number;
}

interface Props {
  points: MapPoint[];
  /** Keep the camera on the runner (live run). */
  follow?: boolean;
  /** Draw 🏁 start / finish markers (saved run). */
  markers?: boolean;
  /** Height in dp. Defaults to 260. Ignored when `fill` is set. */
  height?: number;
  /** Grow to fill the parent instead of using a fixed height. */
  fill?: boolean;
}

export function RouteMap({
  points,
  follow = false,
  markers = false,
  height = 260,
  fill = false,
}: Props) {
  const boxStyle = fill ? styles.fill : { height };

  if (points.length === 0) {
    return (
      <View style={[styles.placeholder, boxStyle]}>
        <Text style={styles.placeholderText}>No route yet</Text>
      </View>
    );
  }

  const first = points[0];
  const last = points[points.length - 1];

  // MapLibre uses [longitude, latitude] — the opposite order of MapPoint.
  const coordinates = points.map(
    (p): [number, number] => [p.longitude, p.latitude],
  );

  const shape: GeoJSON.Feature =
    coordinates.length >= 2
      ? {
          type: 'Feature',
          geometry: { type: 'LineString', coordinates },
          properties: {},
        }
      : { type: 'Feature', geometry: { type: 'Point', coordinates: coordinates[0] }, properties: {} };

  // Bounding box for the saved-run view, padded so the route is not glued
  // to the edges.
  let west = first.longitude;
  let east = first.longitude;
  let south = first.latitude;
  let north = first.latitude;
  for (const p of points) {
    west = Math.min(west, p.longitude);
    east = Math.max(east, p.longitude);
    south = Math.min(south, p.latitude);
    north = Math.max(north, p.latitude);
  }
  const padLon = Math.max(0.0015, (east - west) * 0.25);
  const padLat = Math.max(0.0015, (north - south) * 0.25);

  return (
    <View style={[styles.wrap, boxStyle]}>
      <Map mapStyle={OPENFREE_DARK} style={StyleSheet.absoluteFill}>
        {follow ? (
          <Camera
            center={[last.longitude, last.latitude]}
            zoom={16}
            duration={400}
          />
        ) : (
          <Camera
            bounds={[west - padLon, south - padLat, east + padLon, north + padLat]}
            duration={0}
          />
        )}

        <GeoJSONSource id="route" data={shape}>
          <Layer
            id="route-line"
            type="line"
            layout={{ 'line-cap': 'round', 'line-join': 'round' }}
            paint={{ 'line-color': colors.primary, 'line-width': 5 }}
          />
        </GeoJSONSource>

        {markers ? (
          <>
            <Marker id="start" lngLat={[first.longitude, first.latitude]}>
              <View style={[styles.dot, { backgroundColor: colors.primary }]} />
            </Marker>
            <Marker id="finish" lngLat={[last.longitude, last.latitude]}>
              <View style={[styles.dot, { backgroundColor: colors.accent }]} />
            </Marker>
          </>
        ) : null}

        {/* In follow mode the last point *is* the runner. */}
        {follow && !markers ? (
          <Marker id="runner" lngLat={[last.longitude, last.latitude]}>
            <View style={styles.runner}>
              <View style={styles.runnerInner} />
            </View>
          </Marker>
        ) : null}
      </Map>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderRadius: radius.md,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceAlt,
  },
  fill: { flex: 1, minHeight: 140 },
  placeholder: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderStyle: 'dashed',
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeholderText: { ...type.body, color: colors.textFaint, marginBottom: spacing.xs },
  dot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#0B1120',
  },
  runner: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(34,211,238,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  runnerInner: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: colors.primary,
    borderWidth: 2,
    borderColor: '#0B1120',
  },
});
