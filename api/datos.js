import { handler, exigirSesion, gh, headActual, DATA_PATH } from "./_lib.js";

// Devuelve el catálogo tal como está en GitHub (lo último guardado, aunque Vercel todavía no lo haya publicado).
export default handler("GET", async (req) => {
  exigirSesion(req);
  const base = await headActual();
  const f = await gh(`/contents/${DATA_PATH}?ref=${base}`);
  const datos = JSON.parse(Buffer.from(f.content, "base64").toString("utf8"));
  return { datos, base };
});
