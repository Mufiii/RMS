import { writeAudit } from "@/lib/audit";
import { DomainError } from "@/lib/errors";
import { type Tx, withTx } from "@/lib/tx";
import type { Actor } from "@/modules/orders/service";
import { LOGO_MAX_BYTES, type SettingsInput, sniffImage } from "./schema";

const lockSettings = (tx: Tx) =>
  tx.$queryRaw`SELECT id FROM "settings" WHERE id = 1 FOR UPDATE`;

/** Saves the business settings and audits exactly which fields changed (before → after). */
export async function updateSettings(actor: Actor, input: SettingsInput) {
  return withTx(async (tx) => {
    await lockSettings(tx);
    const before = await tx.settings.findUnique({ where: { id: 1 } });
    if (!before) throw new DomainError("settings.missing");
    const changes: Record<string, { from: unknown; to: unknown }> = {};
    for (const [k, to] of Object.entries(input)) {
      const from = before[k as keyof typeof before];
      if (from !== to) changes[k] = { from, to };
    }
    if (Object.keys(changes).length === 0) return { changed: [] as string[] };
    await tx.settings.update({ where: { id: 1 }, data: { ...input, updatedById: actor.id } });
    await writeAudit(tx, { actorId: actor.id, action: "SETTINGS_UPDATE", entity: "settings", entityId: 1, summary: changes as never });
    return { changed: Object.keys(changes) };
  });
}

/** Replaces the logo. Checks the real file type from its bytes and the size. */
export async function setLogo(actor: Actor, bytes: Uint8Array) {
  if (bytes.length === 0) throw new DomainError("settings.logoMissing");
  if (bytes.length > LOGO_MAX_BYTES) throw new DomainError("settings.logoTooBig", { max: `${LOGO_MAX_BYTES / 1024} KB` });
  const mime = sniffImage(bytes);
  if (!mime) throw new DomainError("settings.logoType");
  return withTx(async (tx) => {
    await lockSettings(tx);
    await tx.settings.update({
      where: { id: 1 },
      data: { logoData: Buffer.from(bytes), logoMime: mime, logoUpdatedAt: new Date(), updatedById: actor.id },
    });
    await writeAudit(tx, { actorId: actor.id, action: "LOGO_UPDATE", entity: "settings", entityId: 1, summary: { mime, bytes: bytes.length } });
  });
}

export async function removeLogo(actor: Actor) {
  return withTx(async (tx) => {
    await lockSettings(tx);
    await tx.settings.update({ where: { id: 1 }, data: { logoData: null, logoMime: null, logoUpdatedAt: new Date(), updatedById: actor.id } });
    await writeAudit(tx, { actorId: actor.id, action: "LOGO_REMOVE", entity: "settings", entityId: 1 });
  });
}
