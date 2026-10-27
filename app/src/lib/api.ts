import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";

const BASE_URL_KEY = "simplefood.api_base_url";
const TOKEN_KEY = "simplefood.auth_token";

// In a deployed web build, the app and the API are served from the same origin
// (Caddy path-splits /api/* to the backend, everything else to this static build) —
// so the API lives at `/api` on whatever host this page was loaded from, no manual
// entry needed. Local web dev is the exception: the Metro dev server (:8090) and
// `php artisan serve` (:8000) are different origins, so that case keeps the old
// localhost:8000 default. Native builds have no "current origin" to infer from at
// all, and still expect the real server URL entered once at login.
const LOCAL_DEV_DEFAULT = "http://localhost:8000/api";

export const DEFAULT_BASE_URL = (() => {
  if (Platform.OS !== "web" || typeof window === "undefined") {
    return LOCAL_DEV_DEFAULT;
  }
  const { hostname, origin } = window.location;
  if (hostname === "localhost" || hostname === "127.0.0.1") {
    return LOCAL_DEV_DEFAULT;
  }
  return `${origin}/api`;
})();

export async function getBaseUrl(): Promise<string> {
  return (await AsyncStorage.getItem(BASE_URL_KEY)) ?? DEFAULT_BASE_URL;
}

export async function setBaseUrl(url: string): Promise<void> {
  await AsyncStorage.setItem(BASE_URL_KEY, url.replace(/\/+$/, ""));
}

export async function getToken(): Promise<string | null> {
  return AsyncStorage.getItem(TOKEN_KEY);
}

export async function setToken(token: string | null): Promise<void> {
  if (token) {
    await AsyncStorage.setItem(TOKEN_KEY, token);
  } else {
    await AsyncStorage.removeItem(TOKEN_KEY);
  }
}

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public errors?: Record<string, string[]>
  ) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const baseUrl = await getBaseUrl();
  const token = await getToken();

  const res = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init?.headers,
    },
  });

  if (res.status === 204) {
    return undefined as T;
  }

  const body = await res.json().catch(() => null);

  if (!res.ok) {
    throw new ApiError(
      (body && body.message) || `Request failed (${res.status})`,
      res.status,
      body?.errors
    );
  }

  return body as T;
}

export type PantryLocation = "fridge" | "pantry" | "freezer";

export type PantryItem = {
  id: number;
  name: string;
  brand: string | null;
  quantity: number;
  unit: string;
  category: string | null;
  location: PantryLocation;
  added_at: string;
  expiration_date: string | null;
  opened_at: string | null;
  opened_expiration_date: string | null;
  effective_expiration_date: string | null;
  cronometer_food_id: string | null;
  notes: string | null;
  is_opened: boolean;
  is_expiring_soon: boolean;
  is_expired: boolean;
};

export type PantryItemInput = {
  name: string;
  brand?: string | null;
  quantity: number;
  unit: string;
  category?: string | null;
  location: PantryLocation;
  expiration_date?: string | null;
  opened_at?: string | null;
  opened_expiration_date?: string | null;
  cronometer_food_id?: string | null;
  notes?: string | null;
};

export type CronometerSettings = {
  is_configured: boolean;
  username: string | null;
  timezone: string | null;
  has_totp_secret: boolean;
};

export type McpConfig = {
  mcpServers: Record<string, { command: string; args: string[]; env: Record<string, string> }>;
};

export type CronometerDiaryFood = {
  id: string | null;
  food_id: number | null;
  measure_id: number | null;
  grams: number | null;
  name: string;
  time: string | null;
  amount: string | null;
  calories: number | null;
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
  fiber_g: number | null;
};

export type CronometerNutrient = { id: number; name: string; amount: number; unit: string; category: string | null };

export type CronometerOverview = {
  date: string;
  /** Cronometer's own "% of all your nutrition targets reached today" score (0-100), or null if unavailable. */
  nutrition_score: number | null;
  calories: { consumed: number; target: number | null; remaining: number | null };
  macros: { protein_g: number | null; carbs_g: number | null; fat_g: number | null; fiber_g: number | null };
  foods: CronometerDiaryFood[];
  nutrients: CronometerNutrient[];
};

export type NutritionTotals = {
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g: number;
};

export type PantryStats = {
  overall: NutritionTotals;
  by_location: Record<PantryLocation, NutritionTotals>;
  excluded: { name: string; reason: string }[];
  approximated: { name: string; unit: string }[];
  /** Nutrition-per-100g ("density") for each pantry item, keyed by item id (as a string, since it's a JSON object). Null when unavailable. */
  items: Record<string, NutritionTotals | null>;
};

export type PantryAttention = {
  expiring: PantryItem[];
  stagnant: PantryItem[];
  expiring_within_days: number;
  stagnant_after_days: number;
};

export type RecipeIngredient = {
  name: string;
  quantity: number;
  unit: string;
  cronometer_food_id?: string | null;
};

export type Recipe = {
  id: number;
  name: string;
  made_at: string;
  ingredients: RecipeIngredient[];
  notes: string | null;
  created_at: string;
};

export type RecipeNutrition = { calories: number; protein_g: number; carbs_g: number; fat_g: number; fiber_g: number };

export type RecipeRecommendation = {
  recipe: Recipe;
  matches: { ingredient: string; pantry_item: string; effective_expiration_date: string | null }[];
  nutrition: RecipeNutrition | null;
};

export type RecipeRecommendations = {
  recommendations: RecipeRecommendation[];
  today: {
    calories: { consumed: number; target: number | null; remaining: number | null };
    macros: { protein_g: number | null; carbs_g: number | null; fat_g: number | null; fiber_g: number | null };
  } | null;
};

export type Sprout = {
  id: number;
  seed_name: string;
  medium: string;
  seed_quantity: number | null;
  seed_unit: string | null;
  started_at: string;
  estimated_ready_at: string | null;
  harvested_at: string | null;
  pantry_item_id: number | null;
  notes: string | null;
  is_harvested: boolean;
  is_overdue: boolean;
};

export type SproutInput = {
  seed_name: string;
  medium: string;
  seed_quantity?: number | null;
  seed_unit?: string | null;
  started_at?: string | null;
  estimated_ready_at?: string | null;
  notes?: string | null;
};

export type Profile = { id: number; name: string; email: string };

export type AnthropicSettings = { is_configured: boolean; model: string | null };

export type ChatMessage = { role: "user" | "assistant"; text: string };

export const api = {
  login: (email: string, password: string, deviceName: string) =>
    request<{ token: string; user: { id: number; name: string; email: string } }>("/login", {
      method: "POST",
      body: JSON.stringify({ email, password, device_name: deviceName }),
    }),

  logout: () => request<void>("/logout", { method: "POST" }),

  listPantryItems: (filters: Record<string, string | number | undefined> = {}) => {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(filters)) {
      if (value !== undefined && value !== "") query.set(key, String(value));
    }
    const qs = query.toString();
    return request<{ data: PantryItem[] }>(`/pantry-items${qs ? `?${qs}` : ""}`).then((r) => r.data);
  },

  getPantryItem: (id: number) => request<{ data: PantryItem }>(`/pantry-items/${id}`).then((r) => r.data),

  createPantryItem: (payload: PantryItemInput) =>
    request<{ data: PantryItem }>("/pantry-items", {
      method: "POST",
      body: JSON.stringify(payload),
    }).then((r) => r.data),

  updatePantryItem: (id: number, payload: Partial<PantryItemInput>) =>
    request<{ data: PantryItem }>(`/pantry-items/${id}`, {
      method: "PUT",
      body: JSON.stringify(payload),
    }).then((r) => r.data),

  deletePantryItem: (id: number) => request<void>(`/pantry-items/${id}`, { method: "DELETE" }),

  consumePantryItem: (id: number, quantity: number, unit: string) =>
    request<{ data: PantryItem } | undefined>(`/pantry-items/${id}/consume`, {
      method: "POST",
      body: JSON.stringify({ quantity, unit }),
    }).then((r) => r?.data ?? null),

  getCronometerSettings: () => request<CronometerSettings>("/settings/cronometer"),

  updateCronometerSettings: (payload: {
    username: string;
    password: string;
    totp_secret?: string;
    timezone?: string;
  }) =>
    request<CronometerSettings>("/settings/cronometer", {
      method: "PUT",
      body: JSON.stringify(payload),
    }),

  getMcpConfig: () => request<McpConfig>("/settings/mcp-config"),

  getCronometerToday: (refresh = false) =>
    request<CronometerOverview>(`/cronometer/today${refresh ? "?refresh=1" : ""}`),

  removeCronometerDiaryEntry: (entryId: string) =>
    request<CronometerOverview>(`/cronometer/diary/${encodeURIComponent(entryId)}`, { method: "DELETE" }),

  updateCronometerDiaryEntry: (entryId: string, payload: { food_id: number; measure_id: number; grams: number }) =>
    request<CronometerOverview>(`/cronometer/diary/${encodeURIComponent(entryId)}`, {
      method: "PUT",
      body: JSON.stringify(payload),
    }),

  getPantryStats: () => request<PantryStats>("/pantry/stats"),

  getPantryAttention: () => request<PantryAttention>("/pantry/attention"),

  listRecipes: (search?: string) => {
    const qs = search ? `?search=${encodeURIComponent(search)}` : "";
    return request<{ data: Recipe[] }>(`/recipes${qs}`).then((r) => r.data);
  },

  updateRecipe: (id: number, payload: { ingredients?: RecipeIngredient[]; notes?: string | null }) =>
    request<{ data: Recipe }>(`/recipes/${id}`, {
      method: "PUT",
      body: JSON.stringify(payload),
    }).then((r) => r.data),

  deleteRecipe: (id: number) => request<void>(`/recipes/${id}`, { method: "DELETE" }),

  getRecipeRecommendations: () => request<RecipeRecommendations>("/recipes/recommendations"),

  listSprouts: (status?: "growing" | "harvested") =>
    request<{ data: Sprout[] }>(`/sprouts${status ? `?status=${status}` : ""}`).then((r) => r.data),

  createSprout: (payload: SproutInput) =>
    request<{ data: Sprout }>("/sprouts", {
      method: "POST",
      body: JSON.stringify(payload),
    }).then((r) => r.data),

  updateSprout: (id: number, payload: Partial<SproutInput>) =>
    request<{ data: Sprout }>(`/sprouts/${id}`, {
      method: "PUT",
      body: JSON.stringify(payload),
    }).then((r) => r.data),

  deleteSprout: (id: number) => request<void>(`/sprouts/${id}`, { method: "DELETE" }),

  harvestSprout: (id: number, payload: { quantity?: number; unit?: string; expiration_date?: string; notes?: string } = {}) =>
    request<{ data: Sprout }>(`/sprouts/${id}/harvest`, {
      method: "POST",
      body: JSON.stringify(payload),
    }).then((r) => r.data),

  getProfile: () => request<Profile>("/user"),

  updateProfile: (payload: {
    name?: string;
    email?: string;
    current_password?: string;
    password?: string;
    password_confirmation?: string;
  }) =>
    request<Profile>("/profile", {
      method: "PUT",
      body: JSON.stringify(payload),
    }),

  getAnthropicSettings: () => request<AnthropicSettings>("/settings/anthropic"),

  updateAnthropicSettings: (payload: { api_key: string; model?: string }) =>
    request<AnthropicSettings>("/settings/anthropic", {
      method: "PUT",
      body: JSON.stringify(payload),
    }),

  getChatHistory: () => request<{ messages: ChatMessage[] }>("/chat").then((r) => r.messages),

  sendChatMessage: (message: string) =>
    request<{ messages: ChatMessage[] }>("/chat", {
      method: "POST",
      body: JSON.stringify({ message }),
    }).then((r) => r.messages),

  resetChat: () => request<void>("/chat", { method: "DELETE" }),
};
