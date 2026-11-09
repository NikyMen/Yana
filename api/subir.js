import { handler, exigirSesion, gh, HttpError, FOTO_RE } from "./_lib.js";

const MAX_BYTES = 3 * 1024 * 1024;

// Sube una foto a GitHub como "blob" suelto. Queda en el repo recién cuando /api/guardar hace el commit.
export default handler("POST", async (req) => {
  exigirSesion(req);
  const { nombre, contenido } = req.body || {};
  if (!FOTO_RE.test(nombre || "")) throw new HttpError(400, "Nombre de foto inválido.");
  if (typeof contenido !== "string" || !/^[A-Za-z0-9+/=]+$/.test(contenido)) throw new HttpError(400, "Foto inválida.");
  const bytes = Buffer.from(contenido, "base64");
  if (bytes.length > MAX_BYTES) throw new HttpError(413, "La foto es demasiado pesada.");
  const esImagen =
    (bytes[0] === 0xff && bytes[1] === 0xd8) || // jpg
    bytes.subarray(0, 4).toString("hex") === "89504e47" || // png
    bytes.subarray(8, 12).toString() === "WEBP";
  if (!esImagen) throw new HttpError(400, "El archivo no es una imagen.");
  const blob = await gh("/git/blobs", { method: "POST", body: { content: contenido, encoding: "base64" } });
  return { nombre, sha: blob.sha };
});
