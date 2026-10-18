import { getAnchor } from "@/lib/anchor";

export const runtime = "nodejs";

/**
 * Public downloads for one anchor:
 *   /api/anchors/<id>/anchor.txt      the file that was stamped
 *   /api/anchors/<id>/anchor.txt.ots  its OpenTimestamps proof
 * Drop both onto https://opentimestamps.org to verify.
 */
export async function GET(_req: Request, { params }: { params: { id: string; file: string } }) {
  if (!/^[0-9a-f-]{36}$/i.test(params.id)) return new Response("Not found", { status: 404 });
  const a = await getAnchor(params.id);
  if (!a) return new Response("Not found", { status: 404 });

  const name = `bharosa-ledger-${a.ledger_seq}.txt`;
  if (params.file === "anchor.txt") {
    return new Response(a.anchor_text, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Content-Disposition": `attachment; filename="${name}"`,
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  }
  if (params.file === "anchor.txt.ots") {
    return new Response(new Uint8Array(Buffer.from(a.ots_b64, "base64")), {
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Disposition": `attachment; filename="${name}.ots"`,
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  }
  return new Response("Not found", { status: 404 });
}
