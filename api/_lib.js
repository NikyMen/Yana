// Utilidades compartidas por las funciones de /api (Vercel no publica archivos que empiezan con "_").
import crypto from "node:crypto";

export const DATA_PATH = "data/productos.json";
export const FOTO_RE = /^[a-z0-9][a-z0-9_-]{0,60}\.(jpe?g|png|webp)$/;
const SESION_HORAS = 12;

const env = (k, def) => {
  const v = process.env[k];
  if (v == null || v === "") {
    if (def !== undefined) return def;
    throw new HttpError(500, `Falta configurar la variable ${k} en Vercel.`);
  }
  return v;
};

export class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

/* ---------- Sesión: token firmado con la contraseña ---------- */
const firmar = (txt) =>
  crypto.createHmac("sha256", env("ADMIN_PASSWORD") + "|" + env("SESSION_SECRET", "yana")).update(txt).digest("base64url");

const igual = (a, b) => {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};

export function crearSesion(password) {
  if (!igual(password || "", env("ADMIN_PASSWORD"))) throw new HttpError(401, "Contraseña incorrecta.");
  const exp = String(Date.now() + SESION_HORAS * 3600e3);
  return exp + "." + firmar(exp);
}

export function exigirSesion(req) {
  const h = req.headers.authorization || "";
  const token = h.startsWith("Bearer ") ? h.slice(7) : "";
  const [exp, firma] = token.split(".");
  if (!exp || !firma || !igual(firma, firmar(exp)) || Number(exp) < Date.now()) {
    throw new HttpError(401, "Tu sesión venció. Volvé a entrar.");
  }
}

/* ---------- GitHub ---------- */
const repo = () => env("GITHUB_REPO", "NikyMen/Yana");
export const rama = () => env("GITHUB_BRANCH", "main");

export async function gh(ruta, { method = "GET", body } = {}) {
  const r = await fetch(`https://api.github.com/repos/${repo()}${ruta}`, {
    method,
    headers: {
      Authorization: `Bearer ${env("GITHUB_TOKEN")}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "yana-admin",
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const txt = await r.text();
  const json = txt ? JSON.parse(txt) : {};
  if (!r.ok) {
    const e = new HttpError(r.status === 401 || r.status === 403 ? 500 : r.status, `GitHub: ${json.message || r.status}`);
    e.github = true;
    throw e;
  }
  return json;
}

export async function headActual() {
  const ref = await gh(`/git/ref/heads/${rama()}`);
  return ref.object.sha;
}

/* ---------- Validación del catálogo ---------- */
const texto = (v, max) => (typeof v === "string" ? v.trim().slice(0, max) : "");

export function limpiarDatos(d) {
  if (!d || typeof d !== "object" || !Array.isArray(d.productos)) throw new HttpError(400, "Datos inválidos.");
  const c = d.config || {};
  const config = {
    whatsapp: texto(c.whatsapp, 20).replace(/\D/g, ""),
    whatsappVisible: texto(c.whatsappVisible, 30),
    instagram: texto(c.instagram, 40).replace(/^@/, ""),
    diasSinStock: Math.max(0, Math.min(60, parseInt(c.diasSinStock, 10) || 0)),
  };
  if (!config.whatsapp) throw new HttpError(400, "Falta el número de WhatsApp.");

  const categorias = {};
  for (const [k, v] of Object.entries(d.categorias || {})) {
    const clave = texto(k, 40).toLowerCase().replace(/[^a-z0-9-]/g, "");
    const nombre = texto(v, 60);
    if (clave && nombre) categorias[clave] = nombre;
  }
  if (!Object.keys(categorias).length) throw new HttpError(400, "Tiene que haber al menos una categoría.");

  const ids = new Set();
  const productos = d.productos.map((p, i) => {
    const id = texto(p.id, 10);
    if (!/^[0-9a-zA-Z-]+$/.test(id)) throw new HttpError(400, `La pieza ${i + 1} tiene un número inválido.`);
    if (ids.has(id)) throw new HttpError(400, `Hay dos piezas con el número ${id}.`);
    ids.add(id);
    const nombre = texto(p.nombre, 80);
    if (!nombre) throw new HttpError(400, `A la pieza N° ${id} le falta el nombre.`);
    const precio = p.precio === null || p.precio === "" || p.precio === undefined ? null : Number(p.precio);
    if (precio !== null && !(Number.isFinite(precio) && precio >= 0)) throw new HttpError(400, `El precio de "${nombre}" no es válido.`);
    const fotos = (Array.isArray(p.fotos) ? p.fotos : []).filter((f) => FOTO_RE.test(f)).slice(0, 12);
    return {
      id,
      nombre,
      categoria: categorias[p.categoria] ? p.categoria : Object.keys(categorias)[0],
      medidas: texto(p.medidas, 120),
      precio,
      descripcion: texto(p.descripcion, 1000),
      visible: p.visible !== false,
      fotos,
    };
  });
  return { config, categorias, productos };
}

/* ---------- Envoltorio de handlers ---------- */
export const handler = (metodo, fn) => async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  try {
    if (req.method !== metodo) throw new HttpError(405, "Método no permitido.");
    const out = await fn(req, res);
    res.status(200).json(out);
  } catch (e) {
    const status = e.status || 500;
    if (status >= 500) console.error(e);
    res.status(status).json({ error: e.message || "Error inesperado." });
  }
};
