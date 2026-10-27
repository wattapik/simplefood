import { useEffect, useState } from "react";
import * as Clipboard from "expo-clipboard";
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { api, ApiError, type AnthropicSettings, type CronometerSettings } from "../../lib/api";
import { useAuth } from "../../lib/auth";

function errorMessages(err: ApiError): string {
  if (!err.errors) return err.message;
  return Object.values(err.errors).flat().join(" ");
}

export default function SettingsScreen() {
  const { signOut } = useAuth();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [profileError, setProfileError] = useState<string | null>(null);
  const [profileSaved, setProfileSaved] = useState(false);
  const [isSavingProfile, setIsSavingProfile] = useState(false);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSaved, setPasswordSaved] = useState(false);
  const [isSavingPassword, setIsSavingPassword] = useState(false);

  const [status, setStatus] = useState<CronometerSettings | null>(null);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [totpSecret, setTotpSecret] = useState("");
  const [timezone, setTimezone] = useState("");
  const [savedMessage, setSavedMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const [mcpConfig, setMcpConfig] = useState<string | null>(null);
  const [isLoadingConfig, setIsLoadingConfig] = useState(false);

  const [anthropicStatus, setAnthropicStatus] = useState<AnthropicSettings | null>(null);
  const [anthropicApiKey, setAnthropicApiKey] = useState("");
  const [anthropicModel, setAnthropicModel] = useState("");
  const [anthropicError, setAnthropicError] = useState<string | null>(null);
  const [anthropicSaved, setAnthropicSaved] = useState(false);
  const [isSavingAnthropic, setIsSavingAnthropic] = useState(false);

  useEffect(() => {
    api.getCronometerSettings().then((data) => {
      setStatus(data);
      setUsername(data.username ?? "");
      setTimezone(data.timezone ?? "");
    });
    api.getProfile().then((data) => {
      setName(data.name);
      setEmail(data.email);
    });
    api.getAnthropicSettings().then((data) => {
      setAnthropicStatus(data);
      setAnthropicModel(data.model ?? "");
    });
  }, []);

  async function handleSaveAnthropic() {
    setAnthropicError(null);
    setAnthropicSaved(false);
    if (!anthropicApiKey.trim()) {
      setAnthropicError("API key is required.");
      return;
    }
    setIsSavingAnthropic(true);
    try {
      const data = await api.updateAnthropicSettings({
        api_key: anthropicApiKey.trim(),
        model: anthropicModel.trim() || undefined,
      });
      setAnthropicStatus(data);
      setAnthropicApiKey("");
      setAnthropicSaved(true);
    } catch (err) {
      setAnthropicError(err instanceof ApiError ? errorMessages(err) : "Could not save.");
    } finally {
      setIsSavingAnthropic(false);
    }
  }

  async function handleSaveProfile() {
    setProfileError(null);
    setProfileSaved(false);
    if (!name.trim() || !email.trim()) {
      setProfileError("Name and email are required.");
      return;
    }
    setIsSavingProfile(true);
    try {
      const updated = await api.updateProfile({ name: name.trim(), email: email.trim() });
      setName(updated.name);
      setEmail(updated.email);
      setProfileSaved(true);
    } catch (err) {
      setProfileError(err instanceof ApiError ? errorMessages(err) : "Could not save.");
    } finally {
      setIsSavingProfile(false);
    }
  }

  async function handleChangePassword() {
    setPasswordError(null);
    setPasswordSaved(false);
    if (!currentPassword || !newPassword) {
      setPasswordError("Enter your current password and a new one.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError("New password and confirmation don't match.");
      return;
    }
    setIsSavingPassword(true);
    try {
      await api.updateProfile({
        current_password: currentPassword,
        password: newPassword,
        password_confirmation: confirmPassword,
      });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setPasswordSaved(true);
    } catch (err) {
      setPasswordError(err instanceof ApiError ? errorMessages(err) : "Could not change password.");
    } finally {
      setIsSavingPassword(false);
    }
  }

  async function handleSave() {
    setError(null);
    setSavedMessage(null);
    if (!username.trim() || !password.trim()) {
      setError("Username and password are required.");
      return;
    }
    setIsSaving(true);
    try {
      const data = await api.updateCronometerSettings({
        username: username.trim(),
        password,
        totp_secret: totpSecret.trim() || undefined,
        timezone: timezone.trim() || undefined,
      });
      setStatus(data);
      setPassword("");
      setTotpSecret("");
      setSavedMessage("Saved.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save.");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleGenerateConfig() {
    setIsLoadingConfig(true);
    try {
      const config = await api.getMcpConfig();
      setMcpConfig(JSON.stringify(config, null, 2));
    } catch (err) {
      Alert.alert("Error", err instanceof Error ? err.message : "Could not generate config.");
    } finally {
      setIsLoadingConfig(false);
    }
  }

  async function handleCopy() {
    if (!mcpConfig) return;
    await Clipboard.setStringAsync(mcpConfig);
    Alert.alert("Copied", "MCP config copied to clipboard.");
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.sectionTitle}>Account</Text>
      <Text style={styles.sectionSubtitle}>Your login for this app.</Text>

      <Field label="Name">
        <TextInput style={styles.input} value={name} onChangeText={setName} />
      </Field>
      <Field label="Email">
        <TextInput
          style={styles.input}
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
        />
      </Field>

      {profileError ? <Text style={styles.error}>{profileError}</Text> : null}
      {profileSaved ? <Text style={styles.success}>Saved.</Text> : null}

      <Pressable
        style={[styles.button, isSavingProfile && styles.buttonDisabled]}
        onPress={handleSaveProfile}
        disabled={isSavingProfile}
      >
        <Text style={styles.buttonText}>{isSavingProfile ? "Saving…" : "Save profile"}</Text>
      </Pressable>

      <Text style={styles.subheading}>Change password</Text>

      <Field label="Current password">
        <TextInput style={styles.input} value={currentPassword} onChangeText={setCurrentPassword} secureTextEntry />
      </Field>
      <Field label="New password">
        <TextInput style={styles.input} value={newPassword} onChangeText={setNewPassword} secureTextEntry />
      </Field>
      <Field label="Confirm new password">
        <TextInput style={styles.input} value={confirmPassword} onChangeText={setConfirmPassword} secureTextEntry />
      </Field>

      {passwordError ? <Text style={styles.error}>{passwordError}</Text> : null}
      {passwordSaved ? <Text style={styles.success}>Password changed.</Text> : null}

      <Pressable
        style={[styles.secondaryButton, isSavingPassword && styles.buttonDisabled]}
        onPress={handleChangePassword}
        disabled={isSavingPassword}
      >
        <Text style={styles.secondaryButtonText}>{isSavingPassword ? "Changing…" : "Change password"}</Text>
      </Pressable>

      <View style={styles.divider} />

      <Text style={styles.sectionTitle}>Cronometer</Text>
      <Text style={styles.sectionSubtitle}>
        These credentials are used by the cronometer MCP server to log your diary entries and
        search foods on your behalf.
        {status ? (status.is_configured ? " Currently configured." : " Not configured yet.") : ""}
      </Text>

      <Field label="Username / email">
        <TextInput
          style={styles.input}
          value={username}
          onChangeText={setUsername}
          autoCapitalize="none"
          autoCorrect={false}
        />
      </Field>
      <Field label="Password">
        <TextInput
          style={styles.input}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          placeholder={status?.is_configured ? "•••••••• (unchanged)" : ""}
        />
      </Field>
      <Field label="TOTP secret (optional, for 2FA)">
        <TextInput
          style={styles.input}
          value={totpSecret}
          onChangeText={setTotpSecret}
          autoCapitalize="none"
          autoCorrect={false}
          placeholder={status?.has_totp_secret ? "•••••••• (unchanged)" : ""}
        />
      </Field>
      <Field label="Timezone (optional, e.g. America/Los_Angeles)">
        <TextInput style={styles.input} value={timezone} onChangeText={setTimezone} autoCapitalize="none" />
      </Field>

      {error ? <Text style={styles.error}>{error}</Text> : null}
      {savedMessage ? <Text style={styles.success}>{savedMessage}</Text> : null}

      <Pressable style={[styles.button, isSaving && styles.buttonDisabled]} onPress={handleSave} disabled={isSaving}>
        <Text style={styles.buttonText}>{isSaving ? "Saving…" : "Save Cronometer credentials"}</Text>
      </Pressable>

      <View style={styles.divider} />

      <Text style={styles.sectionTitle}>Connect Claude</Text>
      <Text style={styles.sectionSubtitle}>
        Generate an MCP config block for Claude Desktop or Claude Code that wires up both this
        pantry&apos;s MCP server and the cronometer MCP server, using the credentials above. Paste
        it into your MCP client&apos;s config, then chat with Claude (e.g. &ldquo;100g oats for
        dinner&rdquo;) — it will deduct from your pantry and log it in Cronometer.
      </Text>

      <Pressable style={styles.secondaryButton} onPress={handleGenerateConfig} disabled={isLoadingConfig}>
        <Text style={styles.secondaryButtonText}>
          {isLoadingConfig ? "Generating…" : "Generate MCP config"}
        </Text>
      </Pressable>

      {mcpConfig ? (
        <View style={styles.codeBlock}>
          <Text style={styles.codeText} selectable>
            {mcpConfig}
          </Text>
          <Pressable style={styles.copyButton} onPress={handleCopy}>
            <Text style={styles.copyButtonText}>Copy to clipboard</Text>
          </Pressable>
          <Text style={styles.note}>
            Replace the pantry server&apos;s &ldquo;args&rdquo; path with the absolute path to
            pantry-mcp/dist/index.js on the machine running your MCP client. Generating a new
            config invalidates the pantry API token in any previously copied config.
          </Text>
        </View>
      ) : null}

      <View style={styles.divider} />

      <Text style={styles.sectionTitle}>Claude API (fallback chat)</Text>
      <Text style={styles.sectionSubtitle}>
        The Chat tab is a fallback for when your Claude subscription is exhausted — it uses this API
        key instead, billed per-token by Anthropic rather than included in a subscription. It drives
        the same pantry/Cronometer tools as your MCP setup above.
        {anthropicStatus ? (anthropicStatus.is_configured ? " Currently configured." : " Not configured yet.") : ""}
      </Text>

      <Field label="API key">
        <TextInput
          style={styles.input}
          value={anthropicApiKey}
          onChangeText={setAnthropicApiKey}
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
          placeholder={anthropicStatus?.is_configured ? "•••••••• (unchanged)" : "sk-ant-…"}
        />
      </Field>
      <Field label="Model (optional, defaults to claude-haiku-4-5-20251001)">
        <TextInput
          style={styles.input}
          value={anthropicModel}
          onChangeText={setAnthropicModel}
          autoCapitalize="none"
          autoCorrect={false}
        />
      </Field>

      {anthropicError ? <Text style={styles.error}>{anthropicError}</Text> : null}
      {anthropicSaved ? <Text style={styles.success}>Saved.</Text> : null}

      <Pressable
        style={[styles.button, isSavingAnthropic && styles.buttonDisabled]}
        onPress={handleSaveAnthropic}
        disabled={isSavingAnthropic}
      >
        <Text style={styles.buttonText}>{isSavingAnthropic ? "Saving…" : "Save Claude API key"}</Text>
      </Pressable>

      <View style={styles.divider} />

      <Pressable style={styles.signOutButton} onPress={signOut}>
        <Text style={styles.signOutText}>Sign out</Text>
      </Pressable>
    </ScrollView>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, maxWidth: 560, width: "100%", alignSelf: "center" },
  sectionTitle: { fontSize: 20, fontWeight: "700", marginBottom: 6 },
  sectionSubtitle: { color: "#666", fontSize: 13, marginBottom: 16, lineHeight: 18 },
  subheading: { fontSize: 15, fontWeight: "700", marginTop: 20, marginBottom: 12 },
  field: { marginBottom: 14 },
  label: { fontSize: 13, fontWeight: "600", marginBottom: 6, color: "#333" },
  input: {
    borderWidth: 1,
    borderColor: "#d0d0d0",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
  },
  error: { color: "#c0392b", marginBottom: 12 },
  success: { color: "#2e7d32", marginBottom: 12 },
  button: {
    backgroundColor: "#2e7d32",
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: "center",
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: "white", fontSize: 16, fontWeight: "600" },
  secondaryButton: {
    borderWidth: 1,
    borderColor: "#2e7d32",
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: "center",
  },
  secondaryButtonText: { color: "#2e7d32", fontWeight: "600" },
  divider: { height: 1, backgroundColor: "#e0e0e0", marginVertical: 24 },
  codeBlock: {
    marginTop: 16,
    backgroundColor: "#1e1e1e",
    borderRadius: 8,
    padding: 12,
  },
  codeText: { color: "#d4d4d4", fontFamily: "monospace", fontSize: 12 },
  copyButton: {
    marginTop: 10,
    backgroundColor: "#333",
    borderRadius: 6,
    paddingVertical: 10,
    alignItems: "center",
  },
  copyButtonText: { color: "white", fontWeight: "600" },
  note: { color: "#999", fontSize: 12, marginTop: 10 },
  signOutButton: { alignItems: "center", paddingVertical: 12 },
  signOutText: { color: "#c0392b", fontWeight: "600" },
});
