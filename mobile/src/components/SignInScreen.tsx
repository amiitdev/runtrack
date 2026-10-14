import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSignIn, useSignUp } from '@clerk/expo';
import { useSSO } from '@clerk/expo';
import * as WebBrowser from 'expo-web-browser';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, spacing, type } from '../theme';

WebBrowser.maybeCompleteAuthSession();

type Step = 'email' | 'code';
type Flow = 'signin' | 'signup';

export function SignInScreen() {
  const { signIn } = useSignIn();
  const { signUp } = useSignUp();
  const { startSSOFlow } = useSSO();

  const [step, setStep] = useState<Step>('email');
  const [flow, setFlow] = useState<Flow>('signin');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function sendCode() {
    if (!signIn || !signUp) return;
    const trimmed = email.trim().toLowerCase();
    if (!trimmed.includes('@')) {
      setError('Enter a valid email address');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      // Try sign-in first — if no account, fall through to sign-up.
      const siResult = await signIn.create({ identifier: trimmed });
      if (siResult.error) {
        const code = siResult.error.code;
        if (code === 'form_identifier_not_found') {
          // No account — create one via sign-up.
          const suResult = await signUp.create({ emailAddress: trimmed });
          if (suResult.error) throw new Error(suResult.error.message);
          const sendResult = await signUp.verifications.sendEmailCode();
          if (sendResult.error) throw new Error(sendResult.error.message);
          setFlow('signup');
          setStep('code');
          return;
        }
        throw new Error(siResult.error.message);
      }
      // Sign-in created — send the email code.
      const sendResult = await signIn.emailCode.sendCode();
      if (sendResult.error) throw new Error(sendResult.error.message);
      setFlow('signin');
      setStep('code');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send code');
    } finally {
      setBusy(false);
    }
  }

  async function verifyCode() {
    if (!signIn || !signUp) return;
    if (code.length < 6) {
      setError('Enter the 6-digit code');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      if (flow === 'signin') {
        const result = await signIn.emailCode.verifyCode({ code });
        if (result.error) throw new Error(result.error.message);
        if (signIn.status === 'complete') {
          const fin = await signIn.finalize();
          if (fin.error) throw new Error(fin.error.message);
          return;
        }
      } else {
        const result = await signUp.verifications.verifyEmailCode({ code });
        if (result.error) throw new Error(result.error.message);
        if (signUp.status === 'complete') {
          const fin = await signUp.finalize();
          if (fin.error) throw new Error(fin.error.message);
          return;
        }
      }
      setError('Invalid or expired code');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Verification failed');
    } finally {
      setBusy(false);
    }
  }

  async function google() {
    setBusy(true);
    setError(null);
    try {
      const { createdSessionId, setActive } = await startSSOFlow({ strategy: 'oauth_google' });
      if (createdSessionId && setActive) {
        await setActive({ session: createdSessionId });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Google sign-in failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.inner}>
        {/* Dial badge — same asset as the splash */}
        <View style={styles.badgeRing}>
          <Ionicons name="walk" size={56} color={colors.primary} />
        </View>

        <Text style={styles.wordmark}>RunTrack</Text>
        <Text style={styles.tagline}>
          {step === 'email' ? 'SIGN IN TO TRACK' : 'ENTER THE CODE'}
        </Text>

        {step === 'email' ? (
          <>
            <TextInput
              style={styles.input}
              placeholder="you@example.com"
              placeholderTextColor={colors.textFaint}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              value={email}
              onChangeText={setEmail}
              editable={!busy}
            />
            <Pressable
              style={[styles.primaryBtn, busy && styles.disabled]}
              onPress={sendCode}
              disabled={busy}
            >
              {busy ? (
                <ActivityIndicator color={colors.bg} />
              ) : (
                <Text style={styles.primaryText}>Send code</Text>
              )}
            </Pressable>
          </>
        ) : (
          <>
            <TextInput
              style={styles.input}
              placeholder="123456"
              placeholderTextColor={colors.textFaint}
              keyboardType="number-pad"
              maxLength={6}
              value={code}
              onChangeText={setCode}
              editable={!busy}
            />
            <Pressable
              style={[styles.primaryBtn, busy && styles.disabled]}
              onPress={verifyCode}
              disabled={busy}
            >
              {busy ? (
                <ActivityIndicator color={colors.bg} />
              ) : (
                <Text style={styles.primaryText}>Verify</Text>
              )}
            </Pressable>
            <Pressable onPress={() => setStep('email')} disabled={busy}>
              <Text style={styles.link}>Change email</Text>
            </Pressable>
          </>
        )}

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <View style={styles.divider}>
          <View style={styles.dividerLine} />
          <Text style={styles.dividerText}>or</Text>
          <View style={styles.dividerLine} />
        </View>

        <Pressable style={styles.googleBtn} onPress={google} disabled={busy}>
          <Ionicons name="logo-google" size={18} color={colors.text} />
          <Text style={styles.googleText}>Continue with Google</Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  inner: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  badgeRing: {
    width: 112,
    height: 112,
    borderRadius: 56,
    borderWidth: 2,
    borderColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginBottom: spacing.lg,
  },
  wordmark: {
    ...type.hero,
    fontSize: 36,
    color: colors.text,
    textAlign: 'center',
  },
  tagline: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 3,
    color: colors.accent,
    textAlign: 'center',
    marginTop: 6,
    marginBottom: spacing.xl,
  },
  input: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 14,
    fontSize: 16,
    color: colors.text,
    marginBottom: spacing.md,
  },
  primaryBtn: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  primaryText: { fontSize: 16, fontWeight: '700', color: colors.bg },
  disabled: { opacity: 0.5 },
  link: { color: colors.primary, textAlign: 'center', marginTop: spacing.sm, fontSize: 14 },
  error: { color: colors.danger, textAlign: 'center', marginTop: spacing.sm, fontSize: 13 },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: spacing.lg,
  },
  dividerLine: { flex: 1, height: 1, backgroundColor: colors.border },
  dividerText: { color: colors.textFaint, marginHorizontal: spacing.md, fontSize: 13 },
  googleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingVertical: 14,
    gap: spacing.sm,
  },
  googleText: { fontSize: 15, fontWeight: '600', color: colors.text },
});
