/**
 * Discord webhook integration.
 *
 * Sends rich-embed messages when a card moves into a watched column. All
 * dispatch happens client-side: Discord webhooks are public endpoints that
 * accept cross-origin POSTs, so no backend relay is needed.
 *
 * Errors are silent by design — a failing ping (network/rate-limit/revoked
 * webhook) must not break the card-move UX. Callers can read the boolean
 * return if they want to surface a toast.
 */

import type { PRCard, ColumnDef, DiscordConfig, Signal } from "../types";

/** Discord embed colour values (decimal RGB). */
export const DISCORD_COLORS = {
  /** "awaiting your review" — amber */
  warning: 0xf59e0b,
  /** "approved / merged" — green */
  success: 0x10b981,
  /** "changes requested / blocked" — red */
  danger: 0xef4444,
  /** default / open PR — blue */
  info: 0x3b82f6,
} as const;

const SIGNAL_EMOJI: Record<Signal, string> = {
  "pr-open": "🆕",
  "review-requested": "👀",
  "own-pr": "🤖",
  draft: "📝",
  merged: "🎉",
  closed: "✖️",
  approved: "✅",
  "changes-requested": "⚠️",
};

function pickColor(signals: Signal[]): number {
  if (signals.includes("changes-requested")) return DISCORD_COLORS.danger;
  if (signals.includes("approved")) return DISCORD_COLORS.success;
  if (signals.includes("merged")) return DISCORD_COLORS.success;
  if (signals.includes("review-requested")) return DISCORD_COLORS.warning;
  return DISCORD_COLORS.info;
}

/** Escape Discord markdown reserved characters in user-supplied text. */
function escapeMarkdown(s: string): string {
  // Discord treats * _ ` ~ | \ as markup. We only escape the ones that
  // commonly appear in PR titles and would mangle the embed.
  return s.replace(/([*_`~|\\>])/g, "\\$1");
}

export interface DiscordEmbed {
  title: string;
  url?: string;
  description?: string;
  color?: number;
  fields?: { name: string; value: string; inline?: boolean }[];
  timestamp?: string;
  footer?: { text: string };
}

export interface DiscordPayload {
  username?: string;
  embeds: DiscordEmbed[];
}

/** Build the embed payload describing a card that just landed in a column. */
export function buildCardMovedEmbed(card: PRCard, column: ColumnDef): DiscordEmbed {
  const signalText = card.signals.length
    ? card.signals.map((s) => `${SIGNAL_EMOJI[s]} ${s}`).join("  ")
    : "—";
  const platformLabel = card.platform === "gitlab" ? "GitLab MR" : "GitHub PR";

  return {
    title: escapeMarkdown(card.title).slice(0, 256),
    url: card.url,
    description: `Moved to **${escapeMarkdown(column.title)}**`,
    color: pickColor(card.signals),
    fields: [
      { name: "Repository", value: `\`${card.repo}\``, inline: true },
      { name: platformLabel, value: `#${card.prNumber}`, inline: true },
      { name: "Author", value: escapeMarkdown(card.author), inline: true },
      { name: "Signals", value: signalText, inline: false },
    ],
    timestamp: new Date().toISOString(),
    footer: { text: "Review365" },
  };
}

/**
 * Send a card-moved notification, if Discord is configured and the column
 * is in the notify list. Returns true on success, false on any failure.
 *
 * Network errors / non-2xx responses are swallowed — never throws — so a
 * failing webhook can never block the underlying card move.
 */
export async function notifyCardMoved(
  card: PRCard,
  column: ColumnDef,
  discord: DiscordConfig | undefined,
  fetchImpl: typeof fetch = fetch,
): Promise<boolean> {
  if (!discord || !discord.webhookUrl) return false;
  if (!discord.notifyColumnIds.includes(column.id)) return false;

  const payload: DiscordPayload = {
    username: discord.botName?.trim() || "Review365",
    embeds: [buildCardMovedEmbed(card, column)],
  };

  try {
    const res = await fetchImpl(discord.webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Send a simple "test" message so users can verify their webhook URL works
 * before relying on it. Returns true on success.
 */
export async function sendTestMessage(
  webhookUrl: string,
  botName = "Review365",
  fetchImpl: typeof fetch = fetch,
): Promise<boolean> {
  if (!webhookUrl.trim()) return false;
  try {
    const res = await fetchImpl(webhookUrl.trim(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: botName,
        embeds: [
          {
            title: "✅ Review365 test ping",
            description: "Discord notifications are wired up correctly.",
            color: DISCORD_COLORS.success,
            timestamp: new Date().toISOString(),
            footer: { text: "Review365" },
          },
        ],
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}
