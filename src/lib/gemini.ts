// ===========================================================================
// Client Google Gemini (API generative-language REST).
// Multimodal natif + function calling + Google Search grounding.
//
// ⚠️ La clé API est lue depuis : 1) un réglage IndexedDB (saisi par l'user)
//    ou 2) la variable d'env VITE_GEMINI_KEY au build.
//    En PWA statique, cette clé est visible dans le code. Acceptable pour une
//    clé gratuite AI Studio à quota limité — ne JAMAIS y mettre une clé payante.
//
// Doc : https://ai.google.dev/api/rest/v1beta/models/generateContent
// ===========================================================================

/** Modèle Gemini par défaut. Supporte function calling ET google_search. */
export const DEFAULT_MODEL = 'gemini-2.0-flash';

/** Modèles proposés dans les réglages. */
export const AVAILABLE_MODELS: { id: string; label: string; hint: string }[] = [
  { id: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash', hint: 'Rapide, équilibré (recommandé)' },
  { id: 'gemini-2.0-flash-lite', label: 'Gemini 2.0 Flash-Lite', hint: 'Le plus rapide/économique' },
  { id: 'gemini-1.5-pro', label: 'Gemini 1.5 Pro', hint: 'Plus précis, plus lent' },
];

const BASE = 'https://generativelanguage.googleapis.com/v1beta';
const TIMEOUT_MS = 60000;

// ---------------------------------------------------------------------------
// Gestion de la clé API (2 niveaux : runtime > env build)
// ---------------------------------------------------------------------------

let runtimeKey: string | null = null;
let runtimeModel: string = DEFAULT_MODEL;

export function setApiKey(key: string): void {
  runtimeKey = key.trim();
}

export function setModel(model: string): void {
  runtimeModel = model.trim() || DEFAULT_MODEL;
}

function apiKey(): string | null {
  if (runtimeKey && runtimeKey.length > 0) return runtimeKey;
  const envKey = import.meta.env.VITE_GEMINI_KEY as string | undefined;
  return envKey && envKey.length > 0 ? envKey : null;
}

export function hasApiKey(): boolean {
  return apiKey() !== null;
}

// ---------------------------------------------------------------------------
// Types (sous-ensemble de l'API REST Gemini)
// ---------------------------------------------------------------------------

export interface GeminiFunctionCall {
  name: string;
  args: Record<string, unknown>;
}

export interface GeminiPart {
  text?: string;
  inlineData?: { mimeType: string; data: string };
  functionCall?: GeminiFunctionCall;
  functionResponse?: { name: string; response: Record<string, unknown> };
}

export interface GeminiContent {
  role: 'user' | 'model';
  parts: GeminiPart[];
}

export interface GeminiFunctionDeclaration {
  name: string;
  description: string;
  parameters?: Record<string, unknown>;
}

export interface GeminiFunctionResponse {
  name: string;
  response: Record<string, unknown>;
}

export type GeminiResponsePart =
  | { text: string }
  | { functionCall: GeminiFunctionCall };

/** Métadonnées de grounding (citations Google Search). */
export interface GroundingMetadata {
  /** Extraits web utilisés comme sources. */
  webSearchQueries?: string[];
  citations?: { title?: string; uri?: string }[];
}

export interface GeminiCandidate {
  content?: { parts?: GeminiResponsePart[] };
  finishReason?: string;
  groundingMetadata?: GroundingMetadata;
}

export interface GeminiResponse {
  candidates?: GeminiCandidate[];
  promptFeedback?: { blockReason?: string };
}

// ---------------------------------------------------------------------------
// Construction des parts multimodales depuis une data-URL
// ---------------------------------------------------------------------------

export function inlineFromDataURL(dataUrl: string): { mimeType: string; data: string } {
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) throw new Error('Format data-URL invalide');
  return { mimeType: match[1], data: match[2] };
}

// ---------------------------------------------------------------------------
// Appel REST generateContent
// ---------------------------------------------------------------------------

/** Options d'un appel generateContent. */
export interface GenerateOptions {
  contents: GeminiContent[];
  /** Déclarations de tools (function calling). */
  tools?: GeminiFunctionDeclaration[];
  /** Active le grounding Google Search (⚠️ incompatible avec tools). */
  googleSearch?: boolean;
  systemInstruction?: string;
  jsonMode?: boolean;
  temperature?: number;
}

export class GeminiError extends Error {
  status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.name = 'GeminiError';
    this.status = status;
  }
}

/**
 * Appelle l'endpoint generateContent de Gemini.
 * @returns La réponse parsée (candidates + parts + grounding).
 */
export async function generateContent(
  opts: GenerateOptions,
): Promise<GeminiResponse> {
  const key = apiKey();
  if (!key) {
    throw new GeminiError(
      'Aucune clé API Gemini configurée. Ajoutez-la dans les Réglages.',
    );
  }

  const url = `${BASE}/models/${runtimeModel}:generateContent?key=${encodeURIComponent(key)}`;

  const body: Record<string, unknown> = { contents: opts.contents };

  // ⚠️ google_search et functionDeclarations sont mutuellement exclusifs.
  if (opts.googleSearch) {
    body.tools = [{ google_search: {} }];
  } else if (opts.tools && opts.tools.length > 0) {
    body.tools = [{ functionDeclarations: opts.tools }];
  }

  if (opts.systemInstruction) {
    body.systemInstruction = { parts: [{ text: opts.systemInstruction }] };
  }
  if (opts.jsonMode) {
    body.generationConfig = { responseMimeType: 'application/json' };
  }
  if (opts.temperature !== undefined) {
    body.generationConfig = {
      ...(body.generationConfig as object | undefined),
      temperature: opts.temperature,
    };
  }

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);

  let resp: Response;
  try {
    resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') {
      throw new GeminiError('La requête Gemini a expiré (60s).');
    }
    throw new GeminiError('Réseau injoignable. Vérifiez votre connexion internet.');
  } finally {
    clearTimeout(timer);
  }

  if (!resp.ok) {
    let message = `Erreur Gemini (HTTP ${resp.status})`;
    try {
      const errBody = await resp.json();
      message = errBody?.error?.message ?? message;
    } catch {
      // ignore
    }
    throw new GeminiError(message, resp.status);
  }

  return (await resp.json()) as GeminiResponse;
}

// ---------------------------------------------------------------------------
// Helpers de parsing de réponse
// ---------------------------------------------------------------------------

export function parseResponse(resp: GeminiResponse): {
  parts: GeminiResponsePart[];
  text: string;
  functionCalls: GeminiFunctionCall[];
  grounding?: GroundingMetadata;
} {
  const candidate = resp.candidates?.[0];
  const parts = candidate?.content?.parts ?? [];
  const text = parts
    .map((p) => ('text' in p ? p.text : ''))
    .filter(Boolean)
    .join('');
  const functionCalls = parts
    .filter((p): p is { functionCall: GeminiFunctionCall } => 'functionCall' in p)
    .map((p) => p.functionCall);
  return {
    parts,
    text,
    functionCalls,
    grounding: candidate?.groundingMetadata,
  };
}

// ---------------------------------------------------------------------------
// Liste des modèles + test de clé
// ---------------------------------------------------------------------------

export interface GeminiModelInfo {
  name: string;
  id: string;
  methods: string[];
}

export async function listModels(
  key: string,
): Promise<{ ok: true; models: GeminiModelInfo[] } | { ok: false; message: string }> {
  const trimmed = key.trim();
  if (!trimmed) return { ok: false, message: 'Clé vide.' };
  const url = `${BASE}/models?key=${encodeURIComponent(trimmed)}`;
  try {
    const resp = await fetch(url);
    if (!resp.ok) {
      const body = await resp.json().catch(() => null);
      const googleMsg = body?.error?.message ?? '';
      return {
        ok: false,
        message: formatListError(resp.status, googleMsg, trimmed),
      };
    }
    const data = await resp.json();
    const all = (data?.models ?? []) as {
      name: string;
      supportedGenerationMethods?: string[];
    }[];
    const models: GeminiModelInfo[] = all
      .filter(
        (m) =>
          m.supportedGenerationMethods?.includes('generateContent') &&
          typeof m.name === 'string',
      )
      .map((m) => ({
        name: m.name,
        id: m.name.replace(/^models\//, ''),
        methods: m.supportedGenerationMethods ?? [],
      }));
    return { ok: true, models };
  } catch {
    return { ok: false, message: 'Réseau injoignable (vérifie ta connexion).' };
  }
}

/**
 * Formate un message d'erreur parlant pour l'échec de listModels, en incluant
 * le code HTTP, le message Google et un diagnostic de la clé (longueur).
 */
function formatListError(status: number, googleMsg: string, key: string): string {
  const parts: string[] = [];
  // Code HTTP + message Google brut (pour ne rien masquer).
  parts.push(`HTTP ${status}`);
  if (googleMsg) parts.push(googleMsg);
  // Diagnostic de la clé : une clé AI Studio valide fait 39 caractères.
  const len = key.length;
  if (!key.startsWith('AIza')) {
    parts.push('La clé devrait commencer par « AIza ».');
  } else if (len !== 39) {
    parts.push(`Longueur ${len} (une clé valide en fait 39) — probable copier-coller tronqué.`);
  }
  return parts.join(' — ');
}

/**
 * Valide une clé API en deux temps :
 *   1. ListModels → valide la clé.
 *   2. Ping generateContent sur le modèle choisi.
 */
export async function testApiKey(
  key: string,
  model = DEFAULT_MODEL,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const trimmed = key.trim();
  if (!trimmed) return { ok: false, message: 'Clé vide.' };

  const keyCheck = await listModels(trimmed);
  if (!keyCheck.ok) return { ok: false, message: keyCheck.message };

  const available = keyCheck.models.map((m) => m.id);
  if (!available.includes(model)) {
    const suggest = available.filter((m) => m.startsWith('gemini-')).slice(0, 3);
    return {
      ok: false,
      message: `Clé valide, mais le modèle « ${model} » n'est pas accessible. Essayez : ${suggest.join(', ') || available[0]}.`,
    };
  }

  const url = `${BASE}/models/${model}:generateContent?key=${encodeURIComponent(trimmed)}`;
  try {
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: 'ok' }] }],
        generationConfig: { maxOutputTokens: 1 },
      }),
    });
    if (resp.ok) return { ok: true };
    if (resp.status === 400 || resp.status === 403) {
      const body = await resp.json().catch(() => null);
      return { ok: false, message: body?.error?.message ?? 'Modèle rejeté par Google.' };
    }
    return { ok: false, message: `Erreur HTTP ${resp.status}.` };
  } catch {
    return { ok: false, message: 'Réseau injoignable.' };
  }
}
