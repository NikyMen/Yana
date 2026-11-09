import { handler, exigirSesion, gh, headActual, rama, limpiarDatos, HttpError, FOTO_RE, DATA_PATH } from "./_lib.js";

const DIR = "img/piezas/";

// Guarda el catálogo + fotos nuevas en un solo commit. Vercel lo publica solo al detectar el commit.
export default handler("POST", async (req) => {
  exigirSesion(req);
  const { datos, base, fotos = [], borrar = [] } = req.body || {};
  const limpio = limpiarDatos(datos);

  const head = await headActual();
  if (base && base !== head) {
    throw new HttpError(409, "El catálogo cambió desde que abriste el panel (¿otra pestaña?). Recargá la página y volvé a hacer los cambios.");
  }

  const usadas = new Set(limpio.productos.flatMap((p) => p.fotos));
  const nuevas = (Array.isArray(fotos) ? fotos : [])
    .filter((f) => f && FOTO_RE.test(f.nombre) && /^[0-9a-f]{40}$/.test(f.sha) && usadas.has(f.nombre))
    .map((f) => ({ path: DIR + f.nombre, mode: "100644", type: "blob", sha: f.sha }));
  const aBorrar = (Array.isArray(borrar) ? borrar : [])
    .filter((n) => FOTO_RE.test(n) && !usadas.has(n))
    .map((n) => ({ path: DIR + n, mode: "100644", type: "blob", sha: null }));

  const commitBase = await gh(`/git/commits/${head}`);
  const json = { path: DATA_PATH, mode: "100644", type: "blob", content: JSON.stringify(limpio, null, 2) + "\n" };

  let tree;
  try {
    tree = await gh("/git/trees", { method: "POST", body: { base_tree: commitBase.tree.sha, tree: [json, ...nuevas, ...aBorrar] } });
  } catch (e) {
    // si alguna foto a borrar ya no existía, GitHub rechaza el árbol: reintentamos sin borrar
    if (!aBorrar.length) throw e;
    tree = await gh("/git/trees", { method: "POST", body: { base_tree: commitBase.tree.sha, tree: [json, ...nuevas] } });
  }

  const n = limpio.productos.length;
  const commit = await gh("/git/commits", {
    method: "POST",
    body: { message: `Panel: actualiza catálogo (${n} piezas${nuevas.length ? `, ${nuevas.length} foto${nuevas.length === 1 ? "" : "s"} nueva${nuevas.length === 1 ? "" : "s"}` : ""})`, tree: tree.sha, parents: [head] },
  });
  try {
    await gh(`/git/refs/heads/${rama()}`, { method: "PATCH", body: { sha: commit.sha, force: false } });
  } catch (e) {
    if (e.status === 422) throw new HttpError(409, "Alguien guardó cambios al mismo tiempo. Recargá la página y probá de nuevo.");
    throw e;
  }
  return { base: commit.sha, datos: limpio };
});
