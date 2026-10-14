import { useEffect, useState } from 'react';
import { Animated, Easing, Image, StyleSheet, View } from 'react-native';
import { colors } from '../theme';

const HOLD_MS = 2300;
const FADE_MS = 480;

type Props = {
  onDone: () => void;
};

/**
 * Launch overlay: expands pulse rings, breathes the dial badge, then rises
 * the wordmark before dissolving into the app. All Animated.View transforms
 * (Hermes-safe — no SVG transform interpolation).
 */
export function SplashOverlay({ onDone }: Props) {
  const [ring1] = useState(() => new Animated.Value(0));
  const [ring2] = useState(() => new Animated.Value(0));
  const [ring3] = useState(() => new Animated.Value(0));
  const [badge] = useState(() => new Animated.Value(0));
  const [wordmark] = useState(() => new Animated.Value(0));
  const [tagline] = useState(() => new Animated.Value(0));
  const [exit] = useState(() => new Animated.Value(1));

  useEffect(() => {
    const pulse = (node: Animated.Value, delay: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(node, {
            toValue: 1,
            duration: 1600,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),
        ]),
      );

    const intro = Animated.parallel([
      Animated.timing(badge, {
        toValue: 1,
        duration: 700,
        easing: Easing.out(Easing.back(1.4)),
        useNativeDriver: true,
      }),
      Animated.sequence([
        Animated.delay(420),
        Animated.parallel([
          Animated.timing(wordmark, {
            toValue: 1,
            duration: 600,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),
          Animated.timing(tagline, {
            toValue: 1,
            duration: 500,
            delay: 160,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),
        ]),
      ]),
    ]);

    const rings = Animated.parallel([
      pulse(ring1, 0),
      pulse(ring2, 520),
      pulse(ring3, 1040),
    ]);

    intro.start();
    rings.start();

    const timer = setTimeout(() => {
      Animated.timing(exit, {
        toValue: 0,
        duration: FADE_MS,
        easing: Easing.inOut(Easing.quad),
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished) {
          rings.stop();
          onDone();
        }
      });
    }, HOLD_MS);

    return () => clearTimeout(timer);
  }, [badge, exit, onDone, ring1, ring2, ring3, tagline, wordmark]);

  const ringStyle = (node: Animated.Value) => ({
    opacity: node.interpolate({
      inputRange: [0, 0.15, 1],
      outputRange: [0.55, 0.35, 0],
    }),
    transform: [
      {
        scale: node.interpolate({
          inputRange: [0, 1],
          outputRange: [0.55, 1.85],
        }),
      },
    ],
  });

  return (
    <Animated.View style={[StyleSheet.absoluteFill, styles.root, { opacity: exit }]}>
      <View style={styles.stage}>
        <Animated.View style={[styles.ring, styles.ringCyan, ringStyle(ring1)]} />
        <Animated.View style={[styles.ring, styles.ringCyan, ringStyle(ring2)]} />
        <Animated.View style={[styles.ring, styles.ringLime, ringStyle(ring3)]} />

        <Animated.View
          style={{
            opacity: badge,
            transform: [
              {
                scale: badge.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0.6, 1],
                }),
              },
            ],
          }}
        >
          <Image source={require('../../assets/splash-icon.png')} style={styles.badge} />
        </Animated.View>
      </View>

      <Animated.Text
        style={[
          styles.wordmark,
          {
            opacity: wordmark,
            transform: [
              {
                translateY: wordmark.interpolate({
                  inputRange: [0, 1],
                  outputRange: [28, 0],
                }),
              },
            ],
          },
        ]}
      >
        RunTrack
      </Animated.Text>

      <Animated.Text
        style={[
          styles.tagline,
          {
            opacity: tagline,
            transform: [
              {
                translateY: tagline.interpolate({
                  inputRange: [0, 1],
                  outputRange: [14, 0],
                }),
              },
            ],
          },
        ]}
      >
        TRACK EVERY MILE
      </Animated.Text>
    </Animated.View>
  );
}

const BADGE = 196;

const styles = StyleSheet.create({
  root: {
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stage: {
    width: BADGE * 2.1,
    height: BADGE * 2.1,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 36,
  },
  ring: {
    position: 'absolute',
    width: BADGE * 1.45,
    height: BADGE * 1.45,
    borderRadius: BADGE,
    borderWidth: 2,
  },
  ringCyan: {
    borderColor: colors.primary,
  },
  ringLime: {
    borderColor: colors.accent,
  },
  badge: {
    width: BADGE,
    height: BADGE,
  },
  wordmark: {
    color: colors.text,
    fontSize: 40,
    fontWeight: '800',
    letterSpacing: -1,
  },
  tagline: {
    marginTop: 10,
    color: colors.accent,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 4,
  },
});
