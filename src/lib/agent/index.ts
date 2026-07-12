// ===========================================================================
// Moteur de l'agent : boucle ReAct (Thought → Action → Observation).
//
// Principe :
//   1. On envoie à Gemini le contexte + les tools disponibles.
//   2. Si functionCall → on exécute le tool → on injecte le résultat → on reboucle.
//   3. Si texte → réponse finale, on arrête.
//   4. Garde-fou : max MAX_ITERATIONS itérations.
//
// Notifie chaque étape via onStep (pour l'UI AgentTrace).
// ===========================================================================

import {
  generateContent,
  parseResponse,
  inlineFromDataURL,
  hasApiKey,
  type GeminiContent,
  type GeminiFunctionDeclaration,
  type GeminiFunctionCall,
  type GeminiFunctionResponse,
} from '@/lib/gemini';
import { TOOL_HANDLERS, TOOL_DECLARATIONS } from '@/lib/agent/tools';
import type { ToolContext } from '@/lib/agent/tools';
import type { AgentStep, Attachment, ChatMessage } from '@/types';

/** Nombre max d'aller-retours (tour modèle + exécution tool). */
const MAX_ITERATIONS = 8;

/** Instruction système : rôle et consignes de l'agent DropScout. */
const SYSTEM_INSTRUCTION = `Tu es "DropScout", un expert en dropshipping et e-commerce, en français.

RÔLE :
- Aider l'utilisateur à TROUVER des produits gagnants dans différentes niches.
- ANALYSER et SCORER des produits (marge, demande, concurrence, saisonnalité).
- Gérer une WATCHLIST de produits suivis (statuts : 💡 Idée → 🧪 À tester → 🏆 Gagnant → ❌ Abandonné).
- Préparer la connexion aux boutiques Shopify / WooCommerce (via le proxy configuré).

CONSIGNES :
- Réfléchis étape par étape. Utilise les outils disponibles (function calling) plutôt que d'inventer des données.
- Si l'utilisateur veut "trouver des produits", "explorer une niche" ou demande "quoi vendre" → utilise research_niche.
- Si l'utilisateur donne une URL de produit (AliExpress, Amazon) ou décrit un produit → utilise analyze_product pour le scorer. Ajoute save: true si tu dois l'enregistrer.
- Si l'utilisateur veut suivre/sauver un produit → utilise save_product.
- Si l'utilisateur demande sa watchlist ou ses produits → utilise list_products (filtre par status si pertinent).
- Pour changer le statut d'un produit (le marquer gagnant, abandonné…) → utilise update_product.
- Après une analyze_product qui inclut save: true, ne rappelle pas save_product.
- Sois concret, honnête et direct. Si un produit te semble mauvais, dis-le (score bas, concurrence saturée).
- Réponds en français. Montre les montants au format "12,50 €" et les scores au format "72/100".
- Quand tu proposes des produits, donne TOUJOURS un angle marketing (le "pourquoi ça vend").
- Si aucune clé API Gemini n'est configurée, informe l'utilisateur (Réglages).`;

// ---------------------------------------------------------------------------
// Construction du contenu multimodal d'un message utilisateur
// ---------------------------------------------------------------------------

function buildUserParts(
  text: string,
  attachments: Attachment[],
): GeminiContent['parts'] {
  const parts: GeminiContent['parts'] = [];
  if (text.trim()) parts.push({ text });

  for (const att of attachments) {
    if (att.kind === 'text') {
      parts.push({ text: `\n\n[Contenu de ${att.name}]\n${att.data}` });
    } else if (att.kind === 'image') {
      try {
        const inline = inlineFromDataURL(att.data);
        parts.push({ inlineData: inline });
      } catch {
        parts.push({ text: `[Image ${att.name} illisible]` });
      }
    }
  }
  return parts;
}

// ---------------------------------------------------------------------------
// Conversion de l'historique ChatMessage -> GeminiContent[]
// ---------------------------------------------------------------------------

export function historyToContents(messages: ChatMessage[]): GeminiContent[] {
  const contents: GeminiContent[] = [];
  for (const msg of messages) {
    if (msg.pending || msg.error) continue;
    if (msg.role === 'user') {
      contents.push({
        role: 'user',
        parts: buildUserParts(msg.text ?? '', msg.attachments ?? []),
      });
    } else {
      if (msg.text) {
        contents.push({ role: 'model', parts: [{ text: msg.text }] });
      }
    }
  }
  return contents;
}

// ---------------------------------------------------------------------------
// Boucle ReAct principale
// ---------------------------------------------------------------------------

export interface RunAgentParams {
  history: ChatMessage[];
  userText: string;
  attachments: Attachment[];
  onStep: (step: AgentStep) => void;
}

export interface RunAgentResult {
  text: string;
  steps: AgentStep[];
  error?: string;
}

export async function runAgent(params: RunAgentParams): Promise<RunAgentResult> {
  const { history, userText, attachments, onStep } = params;
  const steps: AgentStep[] = [];
  const tools: GeminiFunctionDeclaration[] = TOOL_DECLARATIONS;

  if (!hasApiKey()) {
    const err = 'Aucune clé API Gemini configurée. Ajoutez-la dans les Réglages.';
    const step: AgentStep = { type: 'answer', text: err };
    steps.push(step);
    onStep(step);
    return { text: err, steps, error: err };
  }

  const baseContents = historyToContents(history);
  const userContent: GeminiContent = {
    role: 'user',
    parts: buildUserParts(userText, attachments),
  };

  let contents = [...baseContents, userContent];
  const toolCtx: ToolContext = {
    imageAttachments: attachments
      .filter((a) => a.kind === 'image')
      .map((a) => ({ data: a.data, name: a.name })),
  };

  for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
    let resp;
    try {
      resp = await generateContent({
        contents,
        tools,
        systemInstruction: SYSTEM_INSTRUCTION,
      });
    } catch (e) {
      const msg = (e as Error).message;
      const step: AgentStep = { type: 'answer', text: `Erreur : ${msg}` };
      steps.push(step);
      onStep(step);
      return { text: '', steps, error: msg };
    }

    const { text, functionCalls } = parseResponse(resp);

    if (functionCalls.length === 0) {
      if (text && iter > 0) {
        const step: AgentStep = { type: 'thought', text };
        steps.push(step);
        onStep(step);
      }
      const answer = text || "Je n'ai pas pu formuler de réponse.";
      const step: AgentStep = { type: 'answer', text: answer };
      steps.push(step);
      onStep(step);
      return { text: answer, steps };
    }

    if (text) {
      const step: AgentStep = { type: 'thought', text };
      steps.push(step);
      onStep(step);
    }

    contents = [
      ...contents,
      { role: 'model', parts: resp.candidates?.[0]?.content?.parts ?? [] },
    ];

    const responses: GeminiFunctionResponse[] = [];
    for (const call of functionCalls) {
      const actionStep: AgentStep = {
        type: 'action',
        toolName: call.name,
        args: call.args,
      };
      steps.push(actionStep);
      onStep(actionStep);

      const result = await executeTool(call, toolCtx);

      const obsStep: AgentStep = {
        type: 'observation',
        toolName: call.name,
        result,
      };
      steps.push(obsStep);
      onStep(obsStep);

      responses.push({ name: call.name, response: { result } });
    }

    contents = [
      ...contents,
      { role: 'user', parts: responses.map((r) => ({ functionResponse: r })) },
    ];
  }

  const msg = "L'agent a dépassé le nombre maximum d'étapes de raisonnement.";
  const step: AgentStep = { type: 'answer', text: msg };
  steps.push(step);
  onStep(step);
  return { text: msg, steps, error: msg };
}

async function executeTool(
  call: GeminiFunctionCall,
  ctx: ToolContext,
): Promise<string> {
  const handler = TOOL_HANDLERS[call.name];
  if (!handler) {
    return `Erreur : outil « ${call.name} » inconnu.`;
  }
  try {
    return await handler(call.args ?? {}, ctx);
  } catch (e) {
    return `Erreur lors de l'exécution de ${call.name} : ${(e as Error).message}`;
  }
}
