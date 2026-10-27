import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { Link, useFocusEffect, useNavigation } from "expo-router";
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";
import { api, ApiError, type ChatMessage } from "../../lib/api";
import { confirmAsync } from "../../lib/confirm";

// How close to the bottom (in px) still counts as "at the bottom" for auto-follow
// purposes — a little slack so a small overscroll/bounce doesn't unstick it.
const STAY_AT_BOTTOM_THRESHOLD = 40;

export default function ChatScreen() {
  const [messages, setMessages] = useState<ChatMessage[] | null>(null);
  const [notConfigured, setNotConfigured] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const listRef = useRef<FlatList<ChatMessage>>(null);
  // Whether the user is currently at (or near) the bottom of the chat — read by
  // onContentSizeChange/the effect below to decide whether new content should pull
  // the view down with it, or leave it alone because they've scrolled up to read
  // earlier messages. Kept as a ref rather than state since it's only read inside
  // scroll-driven callbacks, not rendered.
  const isAtBottomRef = useRef(true);

  function stickToBottom() {
    if (isAtBottomRef.current) {
      requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: false }));
    }
  }

  function handleScroll(e: NativeSyntheticEvent<NativeScrollEvent>) {
    const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
    const distanceFromBottom = contentSize.height - contentOffset.y - layoutMeasurement.height;
    isAtBottomRef.current = distanceFromBottom < STAY_AT_BOTTOM_THRESHOLD;
  }

  const load = useCallback(async () => {
    setError(null);
    setNotConfigured(false);
    try {
      setMessages(await api.getChatHistory());
    } catch (err) {
      if (err instanceof ApiError && err.status === 422) {
        setNotConfigured(true);
        setMessages([]);
      } else {
        setError(err instanceof Error ? err.message : "Could not load the conversation.");
        setMessages([]);
      }
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  async function handleSend() {
    const text = input.trim();
    if (!text || isSending) return;

    setInput("");
    setError(null);
    setNotConfigured(false);
    // Sending always takes you to the bottom, even if you'd scrolled up to reread
    // earlier messages — same as any other chat app.
    isAtBottomRef.current = true;
    setMessages((prev) => [...(prev ?? []), { role: "user", text }]);
    setIsSending(true);
    try {
      const updated = await api.sendChatMessage(text);
      setMessages(updated);
    } catch (err) {
      if (err instanceof ApiError && err.status === 422 && err.message.includes("not configured")) {
        setNotConfigured(true);
      } else {
        setError(err instanceof Error ? err.message : "Could not reach the chat agent.");
      }
      // Keep the user's message visible but drop back to the last confirmed state
      // rather than silently pretending it sent — reload from the server.
      load();
    } finally {
      setIsSending(false);
    }
  }

  async function handleReset() {
    const confirmed = await confirmAsync("New conversation", "Clear the current chat history?", "Clear");
    if (!confirmed) return;
    await api.resetChat();
    setMessages([]);
  }

  const navigation = useNavigation();
  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <Pressable onPress={handleReset} style={styles.headerButton}>
          <Text style={styles.headerButtonText}>New chat</Text>
        </Pressable>
      ),
    });
  }, [navigation]);

  if (messages === null) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }

  if (notConfigured) {
    return (
      <View style={styles.center}>
        <Text style={styles.emptyTitle}>Claude API isn&apos;t connected yet</Text>
        <Text style={styles.emptyText}>
          This chat is a fallback for when your Claude subscription is exhausted — it uses the billed
          Anthropic API instead, so add an API key in Settings first.
        </Text>
        <Link href="/settings" asChild>
          <Pressable style={styles.button}>
            <Text style={styles.buttonText}>Go to Settings</Text>
          </Pressable>
        </Link>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      {messages.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.emptyTitle}>Chat with Claude about your pantry</Text>
          <Text style={styles.emptyText}>
            &ldquo;I ate 100g of oats&rdquo;, &ldquo;what&apos;s expiring soon?&rdquo;, &ldquo;add 500g of rice to
            the pantry&rdquo; — it uses the same tools your Claude Desktop/Code sessions do, billed to your
            Anthropic API key.
          </Text>
        </View>
      ) : (
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(_, i) => String(i)}
          contentContainerStyle={styles.list}
          onContentSizeChange={stickToBottom}
          // Fires whenever the list's own rendered height changes for any reason —
          // the typing indicator or error text mounting/unmounting, the multiline
          // input growing as you type, the keyboard opening — all of which shrink or
          // grow the list's available space without the list's *content* changing
          // (so onContentSizeChange alone wouldn't catch them), and would otherwise
          // leave an already-at-the-bottom view looking like it jumped.
          onLayout={stickToBottom}
          onScroll={handleScroll}
          scrollEventThrottle={16}
          renderItem={({ item }) => (
            <View style={[styles.bubbleRow, item.role === "user" ? styles.bubbleRowUser : styles.bubbleRowAssistant]}>
              <View style={[styles.bubble, item.role === "user" ? styles.bubbleUser : styles.bubbleAssistant]}>
                <Text style={item.role === "user" ? styles.bubbleTextUser : styles.bubbleTextAssistant}>
                  {item.text}
                </Text>
              </View>
            </View>
          )}
        />
      )}

      {isSending ? (
        <View style={styles.typingRow}>
          <ActivityIndicator size="small" />
          <Text style={styles.typingText}>Thinking…</Text>
        </View>
      ) : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}

      <View style={styles.inputRow}>
        <TextInput
          style={styles.input}
          value={input}
          onChangeText={setInput}
          placeholder="Message"
          multiline
          onSubmitEditing={handleSend}
        />
        <Pressable style={[styles.sendButton, isSending && styles.sendButtonDisabled]} onPress={handleSend} disabled={isSending}>
          <Text style={styles.sendButtonText}>Send</Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  emptyTitle: { fontSize: 17, fontWeight: "700", marginBottom: 8, textAlign: "center" },
  emptyText: { color: "#666", fontSize: 14, textAlign: "center", lineHeight: 20 },
  button: {
    backgroundColor: "#2e7d32",
    borderRadius: 8,
    paddingHorizontal: 20,
    paddingVertical: 12,
    marginTop: 16,
  },
  buttonText: { color: "white", fontWeight: "600" },
  headerButton: { paddingHorizontal: 12, paddingVertical: 6 },
  headerButtonText: { color: "#2e7d32", fontWeight: "600" },
  list: { padding: 16, gap: 10 },
  bubbleRow: { flexDirection: "row" },
  bubbleRowUser: { justifyContent: "flex-end" },
  bubbleRowAssistant: { justifyContent: "flex-start" },
  bubble: { maxWidth: "80%", borderRadius: 14, paddingHorizontal: 14, paddingVertical: 10 },
  bubbleUser: { backgroundColor: "#2e7d32" },
  bubbleAssistant: { backgroundColor: "#f0f0f0" },
  bubbleTextUser: { color: "white", fontSize: 15, lineHeight: 20 },
  bubbleTextAssistant: { color: "#222", fontSize: 15, lineHeight: 20 },
  typingRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 16, paddingBottom: 6 },
  typingText: { color: "#777", fontSize: 13 },
  error: { color: "#c0392b", fontSize: 13, paddingHorizontal: 16, paddingBottom: 6 },
  inputRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8,
    padding: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#e0e0e0",
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#d0d0d0",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    maxHeight: 120,
  },
  sendButton: {
    backgroundColor: "#2e7d32",
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 11,
  },
  sendButtonDisabled: { opacity: 0.6 },
  sendButtonText: { color: "white", fontWeight: "600" },
});
