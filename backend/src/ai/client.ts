/**
 * Appel direct de l'API Messages d'Anthropic. Pas de SDK : une seule requête
 * sans streaming, `fetch` suffit et n'ajoute aucune dépendance. La clé et le
 * modèle sont lus à chaque appel (server.ts a chargé backend/.env avant).
 */

export type ContentBlock =
  | { type: "text"; text: string }
  | {
      type: "document";
      source: { type: "base64"; media_type: "application/pdf"; data: string };
    };

/**
 * Erreur API ou réseau, avec un message court montrable à l'utilisateur :
 * jamais la clé, jamais le corps complet de la réponse.
 */
export class AiApiError extends Error {}

const API_URL = "https://api.anthropic.com/v1/messages";
// 16k jetons de sortie à ~80 jetons/s : 90 s ne suffisait plus.
const TIMEOUT_MS = 240_000;

/** Envoie un tour utilisateur et renvoie le texte de la réponse (blocs `text` concaténés). */
export async function callMessages(input: {
  system: string;
  content: ContentBlock[];
}): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey)
    throw new AiApiError(
      "ANTHROPIC_API_KEY absente côté serveur (backend/.env)",
    );

  let res: Response;
  try {
    res = await fetch(API_URL, {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        // Clé d'organisation (non rattachée à un espace de travail) : l'API exige
        // l'identifiant de l'espace de travail à utiliser. Inutile pour une clé
        // créée dans un espace de travail.
        ...(process.env.ANTHROPIC_WORKSPACE_ID
          ? { "anthropic-workspace-id": process.env.ANTHROPIC_WORKSPACE_ID }
          : {}),
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: process.env.DOTS_AI_MODEL ?? "claude-sonnet-5",
        // ponytail: un template complet dépasse 4096 jetons de sortie ; réglable, 16k par défaut.
        max_tokens: Number(process.env.DOTS_AI_MAX_TOKENS) || 16384,
        // Le prompt système ne bouge qu'avec la liste des images, triée : c'est un préfixe
        // stable, donc cachable. Le minimum cachable de Sonnet 5 est 1024 jetons, celui-ci
        // en fait plus du double. Aucun effet sur la réponse, seulement sur l'entrée.
        system: [
          {
            type: "text",
            text: input.system,
            cache_control: { type: "ephemeral" },
          },
        ],
        messages: [{ role: "user", content: input.content }],
        // Non réglé par défaut : l'API applique `high`. `DOTS_AI_EFFORT=low` raccourcit la
        // réflexion, donc la réponse — à mesurer au banc avant d'en faire un défaut.
        ...(process.env.DOTS_AI_EFFORT
          ? { output_config: { effort: process.env.DOTS_AI_EFFORT } }
          : {}),
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    const name = (err as { name?: string }).name;
    throw new AiApiError(
      name === "TimeoutError" || name === "AbortError"
        ? `délai dépassé (${TIMEOUT_MS / 1000} s)`
        : "API Anthropic injoignable",
    );
  }

  if (!res.ok) {
    // Corps d'erreur : {type:"error", error:{type, message}} — on n'en garde que le type et un extrait.
    const data = (await res.json().catch(() => ({}))) as {
      error?: { type?: string; message?: string };
    };
    const detail = [data.error?.type, data.error?.message?.slice(0, 120)]
      .filter(Boolean)
      .join(" : ");
    throw new AiApiError(
      `API Anthropic : HTTP ${res.status}${detail ? ` (${detail})` : ""}`,
    );
  }

  const data = (await res.json()) as {
    stop_reason?: string;
    content?: { type: string; text?: string }[];
    usage?: Record<string, number>;
  };
  // DOTS_AI_TRACE=1 : de quoi voir si le cache prend, sans instrumenter le reste.
  if (process.env.DOTS_AI_TRACE && data.usage)
    console.log("[ai] usage", JSON.stringify(data.usage));
  if (data.stop_reason === "max_tokens")
    throw new AiApiError("réponse tronquée par le modèle (max_tokens)");
  if (data.stop_reason === "refusal")
    throw new AiApiError("requête refusée par le modèle");
  return (data.content ?? [])
    .filter((b) => b.type === "text")
    .map((b) => b.text ?? "")
    .join("");
}
