const BASE_URL = process.env.PANTRY_API_URL;
const TOKEN = process.env.PANTRY_API_TOKEN;

if (!BASE_URL || !TOKEN) {
  throw new Error(
    "PANTRY_API_URL and PANTRY_API_TOKEN must be set (see the settings panel's MCP config page)."
  );
}

export type PantryItem = {
  id: number;
  name: string;
  brand: string | null;
  quantity: number;
  unit: string;
  category: string | null;
  location: "fridge" | "pantry" | "freezer";
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

class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public body: unknown
  ) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: `Bearer ${TOKEN}`,
      ...init?.headers,
    },
  });

  if (res.status === 204) {
    return undefined as T;
  }

  const body = await res.json().catch(() => null);

  if (!res.ok) {
    const message =
      (body && typeof body === "object" && "message" in body
        ? String((body as { message: unknown }).message)
        : undefined) ?? `Request to ${path} failed with status ${res.status}`;
    throw new ApiError(message, res.status, body);
  }

  return body as T;
}

export const pantryApi = {
  list: (params: Record<string, string | number | undefined> = {}) => {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined) query.set(key, String(value));
    }
    const qs = query.toString();
    return request<{ data: PantryItem[] }>(
      `/pantry-items${qs ? `?${qs}` : ""}`
    ).then((res) => res.data);
  },

  get: (id: number) =>
    request<{ data: PantryItem }>(`/pantry-items/${id}`).then((res) => res.data),

  create: (payload: Record<string, unknown>) =>
    request<{ data: PantryItem }>("/pantry-items", {
      method: "POST",
      body: JSON.stringify(payload),
    }).then((res) => res.data),

  update: (id: number, payload: Record<string, unknown>) =>
    request<{ data: PantryItem }>(`/pantry-items/${id}`, {
      method: "PUT",
      body: JSON.stringify(payload),
    }).then((res) => res.data),

  remove: (id: number) =>
    request<void>(`/pantry-items/${id}`, { method: "DELETE" }),

  consume: (id: number, quantity: number, unit: string) =>
    request<{ data: PantryItem } | undefined>(
      `/pantry-items/${id}/consume`,
      {
        method: "POST",
        body: JSON.stringify({ quantity, unit }),
      }
    ).then((res) => res?.data ?? null),
};

export const recipesApi = {
  list: (search?: string) => {
    const qs = search ? `?search=${encodeURIComponent(search)}` : "";
    return request<{ data: Recipe[] }>(`/recipes${qs}`).then((res) => res.data);
  },

  create: (payload: Record<string, unknown>) =>
    request<{ data: Recipe }>("/recipes", {
      method: "POST",
      body: JSON.stringify(payload),
    }).then((res) => res.data),

  update: (id: number, payload: Record<string, unknown>) =>
    request<{ data: Recipe }>(`/recipes/${id}`, {
      method: "PUT",
      body: JSON.stringify(payload),
    }).then((res) => res.data),
};

export const sproutsApi = {
  list: (status?: "growing" | "harvested") => {
    const qs = status ? `?status=${status}` : "";
    return request<{ data: Sprout[] }>(`/sprouts${qs}`).then((res) => res.data);
  },

  create: (payload: Record<string, unknown>) =>
    request<{ data: Sprout }>("/sprouts", {
      method: "POST",
      body: JSON.stringify(payload),
    }).then((res) => res.data),

  update: (id: number, payload: Record<string, unknown>) =>
    request<{ data: Sprout }>(`/sprouts/${id}`, {
      method: "PUT",
      body: JSON.stringify(payload),
    }).then((res) => res.data),

  remove: (id: number) => request<void>(`/sprouts/${id}`, { method: "DELETE" }),

  harvest: (id: number, payload: Record<string, unknown>) =>
    request<{ data: Sprout }>(`/sprouts/${id}/harvest`, {
      method: "POST",
      body: JSON.stringify(payload),
    }).then((res) => res.data),
};

export { ApiError };
