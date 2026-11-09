import { handler, crearSesion } from "./_lib.js";

export default handler("POST", async (req) => {
  // pequeña demora para que probar contraseñas al azar sea lento
  await new Promise((r) => setTimeout(r, 400));
  return { token: crearSesion(req.body && req.body.password) };
});
