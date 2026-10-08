import { StyleSheet, Text, View } from 'react-native';
import MapView, { Marker, Polyline, type Region } from 'react-native-maps';
import { colors, radius, spacing, type } from '../theme';
import { darkMapStyle } from '../lib/mapStyle';

export interface MapPoint {
  latitude: number;
  longitude: number;
}

interface Props {
  points: MapPoint[];
  /** Keep the camera glued to the runner (live run). */
  follow?: boolean;
  /** Draw the 🏁 start and 🏃 current/end markers. */
  markers?: boolean;
  /** Fixed height in dp. Defaults to 260. */
  height?: number;
  /** Grow to fill the parent instead of using a fixed height. */
  fill?: boolean;
}

const DEFAULT_REGION: Region = {
  latitude: 25.5941,
  longitude: 85.1376,
  latitudeDelta: 0.02,
  longitudeDelta: 0.02,
};

/** Bounding box around the whole route, with a little breathing room. */
function regionFor(points: MapPoint[]): Region {
  if (points.length === 0) return DEFAULT_REGION;

  let minLat = points[0].latitude;
  let maxLat = points[0].latitude;
  let minLon = points[0].longitude;
  let maxLon = points[0].longitude;

  for (const p of points) {
    minLat = Math.min(minLat, p.latitude);
    maxLat = Math.max(maxLat, p.latitude);
    minLon = Math.min(minLon, p.longitude);
    maxLon = Math.max(maxLon, p.longitude);
  }

  const latDelta = Math.max(0.004, (maxLat - minLat) * 1.6);
  const lonDelta = Math.max(0.004, (maxLon - minLon) * 1.6);

  return {
    latitude: (minLat + maxLat) / 2,
    longitude: (minLon + maxLon) / 2,
    latitudeDelta: latDelta,
    longitudeDelta: lonDelta,
  };
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

  const last = points[points.length - 1];
  const region = follow
    ? {
        latitude: last.latitude,
        longitude: last.longitude,
        latitudeDelta: 0.006,
        longitudeDelta: 0.006,
      }
    : regionFor(points);

  return (
    <View style={[styles.wrap, boxStyle]}>
      <MapView
        style={StyleSheet.absoluteFill}
        customMapStyle={darkMapStyle}
        showsUserLocation={follow}
        showsMyLocationButton={follow}
        loadingEnabled
        {...(follow ? { region } : { initialRegion: region })}
      >
        <Polyline
          coordinates={points}
          strokeColor={colors.primary}
          strokeWidth={5}
          lineCap="round"
          lineJoin="round"
        />
        {markers ? (
          <>
            <Marker coordinate={points[0]} title="Start" pinColor="#22D3EE" />
            <Marker coordinate={last} title="Finish" pinColor="#A3E635" />
          </>
        ) : null}
      </MapView>
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
});
