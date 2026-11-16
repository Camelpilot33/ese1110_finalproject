import Constants from 'expo-constants';
import { useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';

import { Button, Card, Header, Notice, Screen, Section, Segmented, T } from '@/components/ui';
import { Radius, Spacing, useTheme } from '@/constants/theme';
import { fetchSnapshot, normalizeBaseUrl } from '@/lib/api';
import { HISTORY_DAYS } from '@/state/data';
import { useSettings } from '@/state/settings';

type TestResult = { ok: boolean; message: string };

export default function SettingsScreen() {
  const theme = useTheme();
  const { settings, update } = useSettings();

  const [url, setUrl] = useState(settings.serverUrl);
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<TestResult | null>(null);

  const cleanUrl = normalizeBaseUrl(url);
  const saved = cleanUrl === settings.serverUrl;

  async function testAndSave() {
    setTesting(true);
    setResult(null);
    try {
      const snapshot = await fetchSnapshot(cleanUrl, HISTORY_DAYS);
      const online = snapshot.devices.filter((d) => d.online).length;
      setUrl(cleanUrl);
      update({ serverUrl: cleanUrl });
      setResult({
        ok: true,
        message: `Connected. ${snapshot.rooms.length} rooms, ${online} of ${snapshot.devices.length} sensors online.`,
      });
    } catch (e) {
      setResult({ ok: false, message: e instanceof Error ? e.message : 'Could not connect.' });
    } finally {
      setTesting(false);
    }
  }

  return (
    <Screen>
      <Header title="Settings" />

      <Section title="View" hint="Admin adds the Insights and Sensors tabs.">
        <Segmented
          options={[
            { value: 'student', label: 'Student' },
            { value: 'admin', label: 'Admin' },
          ]}
          value={settings.adminView ? 'admin' : 'student'}
          onChange={(v) => update({ adminView: v === 'admin' })}
        />
      </Section>

      <Section
        title="Data source"
        hint={
          settings.source === 'demo'
            ? 'Demo shows simulated rooms so the app works without any hardware.'
            : 'Live data from your Obsv server.'
        }>
        <Segmented
          options={[
            { value: 'demo', label: 'Demo' },
            { value: 'server', label: 'Server' },
          ]}
          value={settings.source}
          onChange={(source) => update({ source })}
        />

        {settings.source === 'server' ? (
          <View style={{ gap: Spacing.sm }}>
            <TextInput
              value={url}
              onChangeText={(text) => {
                setUrl(text);
                setResult(null);
              }}
              onSubmitEditing={testAndSave}
              placeholder="http://192.168.1.20:8000"
              placeholderTextColor={theme.offline}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              returnKeyType="done"
              accessibilityLabel="Server address"
              style={[styles.input, { borderColor: theme.border, color: theme.text }]}
            />
            <Button
              label={saved && cleanUrl ? 'Test connection' : 'Connect'}
              onPress={testAndSave}
              busy={testing}
              disabled={!cleanUrl}
            />
            {result ? <Notice message={result.message} tone={result.ok ? 'info' : 'error'} /> : null}
          </View>
        ) : null}
      </Section>

      <Section title="Refresh every">
        <Segmented
          options={[
            { value: 15, label: '15 s' },
            { value: 30, label: '30 s' },
            { value: 60, label: '1 min' },
            { value: 300, label: '5 min' },
          ]}
          value={settings.refreshSec}
          onChange={(refreshSec) => update({ refreshSec })}
        />
      </Section>

      <Section
        title="Count a room as empty after"
        hint="How long without motion before a room stops showing as in use. Longer avoids false alarms when people sit still.">
        <Segmented
          options={[
            { value: 5, label: '5 min' },
            { value: 10, label: '10 min' },
            { value: 15, label: '15 min' },
            { value: 20, label: '20 min' },
          ]}
          value={settings.emptyAfterMin}
          onChange={(emptyAfterMin) => update({ emptyAfterMin })}
        />
      </Section>

      <Section title="About">
        <Card>
          <T>
            Obsv puts a motion sensor in each group study room and compares when rooms are booked
            with when they are actually used, so empty booked rooms stop going to waste.
          </T>
          <T variant="small" muted>
            ESE 1110 Team 06 · Samuel Sastry, Vicky Liang, Robel Dilnessa, Jayden Nguyen
          </T>
          <T variant="small" muted>
            Version {Constants.expoConfig?.version ?? '1.0.0'}
          </T>
        </Card>
      </Section>
    </Screen>
  );
}

const styles = StyleSheet.create({
  input: {
    borderWidth: 1,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    fontSize: 15,
  },
});
