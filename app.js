(async () => {
  const $ = (s, el = document) => el.querySelector(s);
  let datos;
  try {
    const r = await fetch("/data/productos.json", { cache: "no-cache" });
    if (!r.ok) throw new Error(r.status);
    datos = await r.json();
  } catch (e) {
    $("#grilla").innerHTML = `<p class="vacio">No pudimos cargar el catálogo. Probá recargar la página.</p>`;
    return;
  }
  const CONFIG = datos.config;
  const CATEGORIAS = datos.categorias;
  const PRODUCTOS = datos.productos.filter((p) => p.visible !== false && p.fotos && p.fotos.length);
  const FOTO = (f) => `img/piezas/${f}`;
  const porId = Object.fromEntries(PRODUCTOS.map((p) => [p.id, p]));

  const precioTxt = (p) =>
    typeof p.precio === "number"
      ? "$" + p.precio.toLocaleString("es-AR")
      : "Consultar precio";

  const linkWa = (msg) =>
    `https://wa.me/${CONFIG.whatsapp}?text=${encodeURIComponent(msg)}`;

  const esc = (s) =>
    String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  /* ---------- Pedido (se guarda en el navegador) ---------- */
  let pedido = {};
  try { pedido = JSON.parse(localStorage.getItem("yana-pedido") || "{}") || {}; } catch { pedido = {}; }
  for (const id of Object.keys(pedido)) if (!porId[id]) delete pedido[id];

  const guardar = () => {
    try { localStorage.setItem("yana-pedido", JSON.stringify(pedido)); } catch {}
    pintarContador();
    pintarCajon();
  };
  const totalPiezas = () => Object.values(pedido).reduce((a, b) => a + b, 0);
  const agregar = (id, cant = 1) => {
    pedido[id] = Math.min(99, (pedido[id] || 0) + cant);
    guardar();
    const b = $("#contador");
    b.classList.remove("pop"); void b.offsetWidth; b.classList.add("pop");
    aviso(`Agregaste ${porId[id].nombre} ✓`);
  };

  /* ---------- Links fijos ---------- */
  document.querySelectorAll(".js-wa").forEach((a) => {
    a.href = linkWa(a.dataset.msg || "¡Hola Yana!");
    a.target = "_blank";
    a.rel = "noopener";
  });
  $("#pieIg").href = `https://instagram.com/${CONFIG.instagram}`;
  $("#pieWa").textContent = CONFIG.whatsappVisible;
  $("#dias").textContent = CONFIG.diasSinStock;

  /* ---------- Filtros ---------- */
  let filtro = "todas";
  const filtros = $("#filtros");
  const cats = { todas: "Todas", ...CATEGORIAS };
  filtros.innerHTML = Object.entries(cats)
    .filter(([k]) => k === "todas" || PRODUCTOS.some((p) => p.categoria === k))
    .map(([k, v]) => `<button class="chip" role="tab" data-cat="${k}" aria-selected="${k === filtro}">${esc(v)}</button>`)
    .join("");
  filtros.addEventListener("click", (e) => {
    const b = e.target.closest(".chip");
    if (!b) return;
    filtro = b.dataset.cat;
    filtros.querySelectorAll(".chip").forEach((c) => c.setAttribute("aria-selected", c === b));
    pintarGrilla();
  });

  /* ---------- Grilla ---------- */
  const grilla = $("#grilla");
  function pintarGrilla() {
    const lista = PRODUCTOS.filter((p) => filtro === "todas" || p.categoria === filtro);
    grilla.innerHTML = lista
      .map((p) => `
        <article class="card">
          <button class="card__foto" data-ver="${p.id}" aria-label="Ver ${esc(p.nombre)}">
            <span class="card__num">${p.id}</span>
            ${p.fotos.slice(0, 2).map((f) => `<img src="${FOTO(f)}" alt="${esc(p.nombre)}" loading="lazy">`).join("")}
          </button>
          <div class="card__cuerpo">
            <button class="card__nombre" data-ver="${p.id}">${esc(p.nombre)}</button>
            <span class="card__medidas">${esc(p.medidas)}</span>
            <div class="card__pie">
              <span class="precio ${typeof p.precio === "number" ? "" : "precio--consultar"}">${esc(precioTxt(p))}</span>
              <button class="btn-agregar" data-agregar="${p.id}">+ Agregar</button>
            </div>
          </div>
        </article>`)
      .join("");
  }
  grilla.addEventListener("click", (e) => {
    const ver = e.target.closest("[data-ver]");
    if (ver) return abrirPieza(ver.dataset.ver);
    const add = e.target.closest("[data-agregar]");
    if (add) {
      agregar(add.dataset.agregar);
      add.classList.add("ok");
      add.textContent = "✓ Agregada";
      setTimeout(() => { add.classList.remove("ok"); add.textContent = "+ Agregar"; }, 1400);
    }
  });

  /* ---------- Modal de pieza ---------- */
  const modal = $("#modal");
  let actual = null, cant = 1;
  function abrirPieza(id) {
    const p = porId[id];
    if (!p) return;
    actual = p; cant = 1;
    $("#mNum").textContent = "N° " + p.id;
    $("#mTitulo").textContent = p.nombre;
    $("#mCat").textContent = CATEGORIAS[p.categoria] || "";
    $("#mMedidas").textContent = p.medidas;
    $("#mPrecio").textContent = precioTxt(p);
    $("#mDesc").textContent = p.descripcion || "";
    $("#mDesc").hidden = !p.descripcion;
    $("#mCant").textContent = cant;
    verFoto(0);
    $("#mMinis").innerHTML = p.fotos.length > 1
      ? p.fotos.map((f, i) => `<button data-foto="${i}" aria-label="Foto ${i + 1}"><img src="${FOTO(f)}" alt=""></button>`).join("")
      : "";
    marcarMini(0);
    actualizarWaPieza();
    if (!modal.open) modal.showModal();
    history.replaceState(null, "", "#p-" + p.id);
  }
  function verFoto(i) {
    $("#mFoto").src = FOTO(actual.fotos[i]);
    $("#mFoto").alt = actual.nombre;
  }
  function marcarMini(i) {
    $("#mMinis").querySelectorAll("button").forEach((b, j) => b.setAttribute("aria-current", i === j));
  }
  function actualizarWaPieza() {
    const p = actual;
    $("#mWa").href = linkWa(
      `¡Hola Yana! 😊 Me interesa la pieza N° ${p.id} *${p.nombre}*${cant > 1 ? ` (x${cant})` : ""}. ¿Qué colores y diseños tienen disponibles?`
    );
    $("#mWa").target = "_blank";
    $("#mWa").rel = "noopener";
  }
  $("#mMinis").addEventListener("click", (e) => {
    const b = e.target.closest("[data-foto]");
    if (!b) return;
    verFoto(+b.dataset.foto);
    marcarMini(+b.dataset.foto);
  });
  modal.addEventListener("click", (e) => {
    const paso = e.target.closest("[data-paso]");
    if (paso) {
      cant = Math.max(1, Math.min(99, cant + +paso.dataset.paso));
      $("#mCant").textContent = cant;
      actualizarWaPieza();
    }
  });
  $("#mAgregar").addEventListener("click", () => {
    agregar(actual.id, cant);
    modal.close();
  });
  modal.addEventListener("close", () => history.replaceState(null, "", location.pathname + location.search));

  /* ---------- Cajón "Mi pedido" ---------- */
  const cajon = $("#cajon");
  $("#abrirPedido").addEventListener("click", () => { pintarCajon(); cajon.showModal(); });

  function pintarContador() {
    const n = totalPiezas();
    const b = $("#contador");
    b.textContent = n;
    b.hidden = n === 0;
  }
  function pintarCajon() {
    const ids = Object.keys(pedido).sort();
    $("#cPie").hidden = ids.length === 0;
    $("#cLista").innerHTML = ids.length
      ? ids.map((id) => {
          const p = porId[id];
          return `
          <div class="item">
            <img src="${FOTO(p.fotos[0])}" alt="">
            <div>
              <div class="item__nombre">${esc(p.nombre)}</div>
              <div class="item__sub">N° ${p.id} · ${esc(precioTxt(p))}</div>
              <div class="stepper"><button data-item="${id}" data-d="-1" aria-label="Menos">−</button><output>${pedido[id]}</output><button data-item="${id}" data-d="1" aria-label="Más">+</button></div>
            </div>
            <button class="quitar" data-quitar="${id}">Quitar</button>
          </div>`;
        }).join("")
      : `<div class="vacio"><strong>Tu pedido está vacío</strong>Agregá las piezas que te gusten y después nos lo mandás por WhatsApp.</div>`;
    actualizarEnvio();
  }
  $("#cLista").addEventListener("click", (e) => {
    const q = e.target.closest("[data-quitar]");
    if (q) { delete pedido[q.dataset.quitar]; return guardar(); }
    const s = e.target.closest("[data-item]");
    if (s) {
      const id = s.dataset.item;
      pedido[id] = (pedido[id] || 0) + +s.dataset.d;
      if (pedido[id] <= 0) delete pedido[id];
      else pedido[id] = Math.min(99, pedido[id]);
      guardar();
    }
  });
  function mensajePedido() {
    const lineas = Object.keys(pedido).sort().map((id) => `• ${pedido[id]} x ${porId[id].nombre} (N° ${id})`);
    const nombre = $("#cNombre").value.trim();
    const nota = $("#cNota").value.trim();
    return [
      `¡Hola Yana! 👋${nombre ? ` Soy ${nombre}.` : ""} Quiero consultar por este pedido:`,
      "",
      ...lineas,
      "",
      ...(nota ? [`Nota: ${nota}`, ""] : []),
      "¿Qué colores y diseños tienen disponibles?",
    ].join("\n");
  }
  function actualizarEnvio() {
    const a = $("#cEnviar");
    a.href = linkWa(mensajePedido());
    a.target = "_blank";
    a.rel = "noopener";
  }
  $("#cNombre").addEventListener("input", actualizarEnvio);
  $("#cNota").addEventListener("input", actualizarEnvio);

  /* ---------- Cerrar diálogos ---------- */
  document.querySelectorAll("dialog").forEach((d) => {
    d.addEventListener("click", (e) => {
      if (e.target === d || e.target.closest("[data-cerrar]")) d.close();
    });
  });

  /* ---------- Aviso ---------- */
  let tAviso;
  function aviso(txt) {
    const t = $("#toast");
    t.textContent = txt;
    t.classList.add("ver");
    clearTimeout(tAviso);
    tAviso = setTimeout(() => t.classList.remove("ver"), 1800);
  }

  /* ---------- Inicio ---------- */
  pintarGrilla();
  pintarContador();
  pintarCajon();
  const m = location.hash.match(/^#p-(\d+)$/);
  if (m) abrirPieza(m[1]);
})();
