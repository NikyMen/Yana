(() => {
  const $ = (s, el = document) => el.querySelector(s);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const clonar = (o) => JSON.parse(JSON.stringify(o));
  const TOKEN_KEY = "yana-admin-token";

  /* ---------- Estado ---------- */
  let datos = null;          // catálogo que se está editando
  let snapshot = "";         // JSON del catálogo publicado, para saber si hay cambios
  let fotosOriginales = new Set(); // fotos que existían al cargar (para borrar las que se quiten)
  let base = null;           // commit de GitHub sobre el que se trabaja
  const nuevas = new Map();  // nombre -> { dataUrl, base64, sha? }
  const previews = new Map(); // nombre -> dataUrl (para ver fotos recién publicadas)

  /* ---------- Sesión y API ---------- */
  const token = {
    get: () => { try { return sessionStorage.getItem(TOKEN_KEY); } catch { return null; } },
    set: (t) => { try { t ? sessionStorage.setItem(TOKEN_KEY, t) : sessionStorage.removeItem(TOKEN_KEY); } catch {} },
  };

  async function api(ruta, { method = "GET", body } = {}) {
    let r;
    try {
      r = await fetch("/api/" + ruta, {
        method,
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + (token.get() || "") },
        body: body ? JSON.stringify(body) : undefined,
      });
    } catch {
      throw new Error("No hay conexión. Revisá internet y probá de nuevo.");
    }
    let json = {};
    try { json = await r.json(); } catch {}
    if (r.status === 401 && ruta !== "login") {
      token.set(null);
      mostrarLogin(json.error || "Tu sesión venció. Volvé a entrar.");
      throw new Error(json.error || "Sesión vencida.");
    }
    if (!r.ok) throw new Error(json.error || `Error ${r.status}`);
    return json;
  }

  function mostrarLogin(msg) {
    $("#vApp").hidden = true;
    $("#vLogin").hidden = false;
    $("#lError").hidden = !msg;
    $("#lError").textContent = msg || "";
    $("#lPass").focus();
  }

  $("#fLogin").addEventListener("submit", async (e) => {
    e.preventDefault();
    const b = $("#lBtn");
    b.disabled = true; b.textContent = "Entrando…";
    $("#lError").hidden = true;
    try {
      const { token: t } = await api("login", { method: "POST", body: { password: $("#lPass").value } });
      token.set(t);
      $("#lPass").value = "";
      await cargar();
    } catch (err) {
      $("#lError").textContent = err.message;
      $("#lError").hidden = false;
    } finally {
      b.disabled = false; b.textContent = "Entrar";
    }
  });

  async function cargar() {
    const r = await api("datos");
    aplicarPublicado(r.datos, r.base);
    $("#vLogin").hidden = true;
    $("#vApp").hidden = false;
    pintarTodo();
  }

  function aplicarPublicado(d, b) {
    datos = d;
    base = b;
    snapshot = JSON.stringify(d);
    fotosOriginales = new Set(d.productos.flatMap((p) => p.fotos));
  }

  /* ---------- Cambios pendientes ---------- */
  const haySucio = () => datos && JSON.stringify(datos) !== snapshot;
  function marcarEstado() {
    const sucio = haySucio();
    const e = $("#estado");
    e.textContent = sucio ? "Cambios sin publicar" : "Sin cambios";
    e.classList.toggle("sucio", sucio);
    $("#bPublicar").disabled = !sucio;
  }
  window.addEventListener("beforeunload", (e) => {
    if (haySucio()) { e.preventDefault(); e.returnValue = ""; }
  });

  /* ---------- Fotos ---------- */
  const srcFoto = (n) => (nuevas.get(n) || {}).dataUrl || previews.get(n) || `/img/piezas/${n}`;
  const imgFoto = (n, cls = "") =>
    `<img class="${cls}" src="${esc(srcFoto(n))}" alt="" loading="lazy" onerror="this.onerror=null;this.removeAttribute('src');this.alt='';">`;

  function nombreNuevo(id) {
    const slug = String(id || "pieza").toLowerCase().replace(/[^a-z0-9]/g, "") || "pieza";
    return `${slug}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}.jpg`;
  }

  function achicar(file, max = 1400, calidad = 0.85) {
    return new Promise((ok, mal) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        const k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
        const c = document.createElement("canvas");
        c.width = Math.round(img.naturalWidth * k);
        c.height = Math.round(img.naturalHeight * k);
        const ctx = c.getContext("2d");
        ctx.fillStyle = "#fff";
        ctx.fillRect(0, 0, c.width, c.height);
        ctx.drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        const dataUrl = c.toDataURL("image/jpeg", calidad);
        ok({ dataUrl, base64: dataUrl.split(",")[1] });
      };
      img.onerror = () => { URL.revokeObjectURL(url); mal(new Error(`No se pudo leer "${file.name}". Probá con otra foto (JPG o PNG).`)); };
      img.src = url;
    });
  }

  /* ---------- Pestañas ---------- */
  document.querySelectorAll("[data-tab]").forEach((t) =>
    t.addEventListener("click", () => {
      document.querySelectorAll("[data-tab]").forEach((x) => x.setAttribute("aria-selected", x === t));
      document.querySelectorAll("[data-panel]").forEach((p) => (p.hidden = p.dataset.panel !== t.dataset.tab));
    })
  );

  function pintarTodo() {
    pintarLista();
    pintarCats();
    pintarContacto();
    marcarEstado();
  }

  /* ---------- Lista de piezas ---------- */
  const precioTxt = (p) => (typeof p.precio === "number" ? "$" + p.precio.toLocaleString("es-AR") : "Consultar precio");

  function pintarLista() {
    const q = $("#buscar").value.trim().toLowerCase();
    const items = datos.productos
      .map((p, i) => ({ p, i }))
      .filter(({ p }) => !q || p.nombre.toLowerCase().includes(q) || p.id.toLowerCase().includes(q));
    $("#lista").innerHTML = items.length
      ? items.map(({ p, i }) => `
        <li class="pieza ${p.visible === false ? "oculta" : ""}">
          <button class="pieza__abrir" data-editar="${i}">
            ${p.fotos[0] ? imgFoto(p.fotos[0], "miniatura") : `<div class="miniatura"></div>`}
            <div class="pieza__txt">
              <div class="pieza__nombre">${esc(p.nombre)}</div>
              <div class="pieza__sub">
                <span class="etiqueta">N° ${esc(p.id)}</span>
                ${p.visible === false ? `<span class="etiqueta etiqueta--gris">Oculta</span>` : ""}
                ${p.fotos.length ? "" : `<span class="etiqueta etiqueta--alerta">Sin fotos</span>`}
                ${esc(datos.categorias[p.categoria] || "")} · ${esc(precioTxt(p))}
              </div>
            </div>
          </button>
          ${q ? "" : `<div class="mover">
            <button data-mover="${i}" data-d="-1" aria-label="Subir" ${i === 0 ? "disabled" : ""}>▲</button>
            <button data-mover="${i}" data-d="1" aria-label="Bajar" ${i === datos.productos.length - 1 ? "disabled" : ""}>▼</button>
          </div>`}
        </li>`).join("")
      : `<li class="vacio">No hay piezas${q ? " con ese nombre" : ""}.</li>`;
  }
  $("#buscar").addEventListener("input", pintarLista);
  $("#lista").addEventListener("click", (e) => {
    const m = e.target.closest("[data-mover]");
    if (m) {
      const i = +m.dataset.mover, j = i + +m.dataset.d;
      const arr = datos.productos;
      if (j < 0 || j >= arr.length) return;
      [arr[i], arr[j]] = [arr[j], arr[i]];
      pintarLista(); marcarEstado();
      return;
    }
    const ed = e.target.closest("[data-editar]");
    if (ed) abrirEditor(+ed.dataset.editar);
  });

  $("#bNueva").addEventListener("click", () => abrirEditor(-1));

  /* ---------- Editor ---------- */
  const editor = $("#editor");
  let edIndice = -1;   // -1 = nueva
  let ed = null;       // copia de la pieza que se edita

  function siguienteId() {
    const nums = datos.productos.map((p) => parseInt(p.id, 10)).filter(Number.isFinite);
    const n = (nums.length ? Math.max(...nums) : 0) + 1;
    return String(n).padStart(2, "0");
  }

  function abrirEditor(i) {
    edIndice = i;
    ed = i >= 0
      ? clonar(datos.productos[i])
      : { id: siguienteId(), nombre: "", categoria: Object.keys(datos.categorias)[0], medidas: "", precio: null, descripcion: "", visible: true, fotos: [] };
    $("#eTitulo").textContent = i >= 0 ? "Editar pieza" : "Nueva pieza";
    $("#eId").value = ed.id;
    $("#eNombre").value = ed.nombre;
    $("#eCat").innerHTML = Object.entries(datos.categorias).map(([k, v]) => `<option value="${esc(k)}">${esc(v)}</option>`).join("");
    $("#eCat").value = ed.categoria;
    $("#ePrecio").value = typeof ed.precio === "number" ? ed.precio : "";
    $("#eMedidas").value = ed.medidas || "";
    $("#eDesc").value = ed.descripcion || "";
    $("#eVisible").checked = ed.visible !== false;
    $("#eBorrar").hidden = i < 0;
    $("#eError").hidden = true;
    pintarFotos();
    editor.showModal();
    editor.querySelector(".editor__cuerpo").scrollTop = 0;
  }

  function pintarFotos(cargando = 0) {
    const n = ed.fotos.length;
    $("#eFotos").innerHTML =
      ed.fotos.map((f, i) => `
        <div class="foto">
          ${imgFoto(f)}
          ${i === 0 ? `<span class="foto__principal">Principal</span>` : ""}
          ${nuevas.has(f) ? `<span class="foto__nueva">Nueva</span>` : ""}
          <div class="foto__acciones">
            <button type="button" data-f="${i}" data-acc="izq" aria-label="Mover a la izquierda" ${i === 0 ? "disabled" : ""}>◀</button>
            <button type="button" class="quitar" data-f="${i}" data-acc="quitar" aria-label="Quitar foto">✕</button>
            <button type="button" data-f="${i}" data-acc="der" aria-label="Mover a la derecha" ${i === n - 1 ? "disabled" : ""}>▶</button>
          </div>
        </div>`).join("") +
      Array.from({ length: cargando }, () => `<div class="foto foto--cargando">Procesando…</div>`).join("") +
      (n < 12 ? `<label class="foto foto--agregar"><div><span>+</span>Agregar fotos</div><input type="file" accept="image/*" multiple id="eArchivo"></label>` : "");
  }

  $("#eFotos").addEventListener("click", (e) => {
    const b = e.target.closest("[data-acc]");
    if (!b) return;
    const i = +b.dataset.f;
    if (b.dataset.acc === "quitar") {
      if (!confirm("¿Quitar esta foto de la pieza?")) return;
      ed.fotos.splice(i, 1);
    } else {
      const j = b.dataset.acc === "izq" ? i - 1 : i + 1;
      [ed.fotos[i], ed.fotos[j]] = [ed.fotos[j], ed.fotos[i]];
    }
    pintarFotos();
  });

  $("#eFotos").addEventListener("change", async (e) => {
    if (e.target.id !== "eArchivo") return;
    const files = [...e.target.files].slice(0, 12 - ed.fotos.length);
    if (!files.length) return;
    let pendientes = files.length;
    pintarFotos(pendientes);
    for (const file of files) {
      try {
        const r = await achicar(file);
        const nombre = nombreNuevo($("#eId").value.trim() || ed.id);
        nuevas.set(nombre, r);
        ed.fotos.push(nombre);
      } catch (err) {
        aviso(err.message);
      }
      pintarFotos(--pendientes);
    }
  });

  $("#fEditor").addEventListener("submit", (e) => {
    e.preventDefault();
    const id = $("#eId").value.trim();
    const nombre = $("#eNombre").value.trim();
    const precioStr = $("#ePrecio").value.trim();
    const error = (m) => { $("#eError").textContent = m; $("#eError").hidden = false; };
    if (!/^[0-9a-zA-Z-]+$/.test(id)) return error("El N° solo puede tener números, letras o guiones.");
    if (datos.productos.some((p, i) => p.id === id && i !== edIndice)) return error(`Ya existe otra pieza con el N° ${id}.`);
    if (!nombre) return error("Falta el nombre.");
    if (precioStr && !(Number(precioStr) >= 0)) return error("El precio no es válido.");
    if (!ed.fotos.length && !confirm("Esta pieza no tiene fotos y no se va a mostrar en la web. ¿Guardar igual?")) return;

    Object.assign(ed, {
      id,
      nombre,
      categoria: $("#eCat").value,
      precio: precioStr ? Math.round(Number(precioStr)) : null,
      medidas: $("#eMedidas").value.trim(),
      descripcion: $("#eDesc").value.trim(),
      visible: $("#eVisible").checked,
    });
    if (edIndice >= 0) datos.productos[edIndice] = ed;
    else datos.productos.push(ed);
    editor.close();
    pintarLista(); pintarCats(); marcarEstado();
    aviso("Pieza guardada. Acordate de “Publicar cambios”.");
  });

  $("#eBorrar").addEventListener("click", () => {
    if (!confirm(`¿Eliminar "${datos.productos[edIndice].nombre}"? Se borra al publicar.`)) return;
    datos.productos.splice(edIndice, 1);
    editor.close();
    pintarLista(); pintarCats(); marcarEstado();
  });

  editor.addEventListener("click", (e) => {
    if (e.target === editor || e.target.closest("[data-cerrar]")) editor.close();
  });

  /* ---------- Categorías ---------- */
  function pintarCats() {
    const usadas = new Set(datos.productos.map((p) => p.categoria));
    $("#cats").innerHTML = Object.entries(datos.categorias).map(([k, v]) => {
      const n = datos.productos.filter((p) => p.categoria === k).length;
      return `<li class="cat">
        <input value="${esc(v)}" data-cat="${esc(k)}" aria-label="Nombre de la categoría" maxlength="60">
        <small>${n} pieza${n === 1 ? "" : "s"}</small>
        <button data-borrar-cat="${esc(k)}" ${usadas.has(k) ? "disabled title='Hay piezas en esta categoría'" : ""}>Borrar</button>
      </li>`;
    }).join("");
  }
  $("#cats").addEventListener("input", (e) => {
    const k = e.target.dataset.cat;
    if (k) { datos.categorias[k] = e.target.value; marcarEstado(); }
  });
  $("#cats").addEventListener("change", (e) => {
    const k = e.target.dataset.cat;
    if (k && !e.target.value.trim()) { aviso("La categoría no puede quedar vacía."); e.target.focus(); }
  });
  $("#cats").addEventListener("click", (e) => {
    const k = e.target.dataset.borrarCat;
    if (!k || e.target.disabled) return;
    if (Object.keys(datos.categorias).length === 1) return aviso("Tiene que quedar al menos una categoría.");
    delete datos.categorias[k];
    pintarCats(); marcarEstado();
  });
  $("#fCat").addEventListener("submit", (e) => {
    e.preventDefault();
    const nombre = $("#nuevaCat").value.trim();
    if (!nombre) return;
    let k = nombre.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "cat";
    let n = 2, kk = k;
    while (datos.categorias[kk]) kk = `${k}-${n++}`;
    datos.categorias[kk] = nombre;
    $("#nuevaCat").value = "";
    pintarCats(); marcarEstado();
  });

  /* ---------- Contacto ---------- */
  const camposContacto = { cWa: "whatsapp", cWaVis: "whatsappVisible", cIg: "instagram", cDias: "diasSinStock" };
  function pintarContacto() {
    for (const [id, k] of Object.entries(camposContacto)) $("#" + id).value = datos.config[k] ?? "";
  }
  for (const [id, k] of Object.entries(camposContacto)) {
    $("#" + id).addEventListener("input", (e) => {
      datos.config[k] = k === "diasSinStock" ? parseInt(e.target.value, 10) || 0 : e.target.value.trim();
      marcarEstado();
    });
  }

  /* ---------- Publicar ---------- */
  const prog = $("#progreso");
  function progreso(titulo, texto, fin = false) {
    $("#pTitulo").textContent = titulo;
    $("#pTexto").textContent = texto || "";
    $("#pSpin").hidden = fin;
    $("#pOk").hidden = !fin;
    if (!prog.open) prog.showModal();
  }
  prog.addEventListener("cancel", (e) => { if (!$("#pOk").hidden) return; e.preventDefault(); });
  $("#pOk").addEventListener("click", () => prog.close());

  $("#bPublicar").addEventListener("click", async () => {
    if (!haySucio()) return;
    if (Object.values(datos.categorias).some((v) => !v.trim())) return aviso("Hay una categoría sin nombre.");
    const usadas = new Set(datos.productos.flatMap((p) => p.fotos));
    const aSubir = [...nuevas.entries()].filter(([n, f]) => usadas.has(n) && !f.sha);
    try {
      for (let i = 0; i < aSubir.length; i++) {
        progreso("Publicando…", `Subiendo fotos ${i + 1} de ${aSubir.length}`);
        const [nombre, f] = aSubir[i];
        const r = await api("subir", { method: "POST", body: { nombre, contenido: f.base64 } });
        f.sha = r.sha;
      }
      progreso("Publicando…", "Guardando el catálogo");
      const fotos = [...nuevas.entries()].filter(([n, f]) => usadas.has(n) && f.sha).map(([nombre, f]) => ({ nombre, sha: f.sha }));
      const borrar = [...fotosOriginales].filter((n) => !usadas.has(n));
      const r = await api("guardar", { method: "POST", body: { datos, base, fotos, borrar } });
      for (const [n, f] of nuevas) if (usadas.has(n)) previews.set(n, f.dataUrl);
      nuevas.clear();
      aplicarPublicado(r.datos, r.base);
      pintarTodo();
      progreso("¡Listo! 🎉", "Los cambios ya están guardados. La web se actualiza sola en 1 o 2 minutos.", true);
    } catch (err) {
      progreso("No se pudo publicar", err.message, true);
    }
  });

  $("#bDescartar").addEventListener("click", async () => {
    $(".menu").open = false;
    if (!haySucio()) return aviso("No hay cambios para descartar.");
    if (!confirm("¿Descartar todos los cambios sin publicar?")) return;
    nuevas.clear();
    datos = JSON.parse(snapshot);
    pintarTodo();
  });

  $("#bSalir").addEventListener("click", () => {
    $(".menu").open = false;
    if (haySucio() && !confirm("Tenés cambios sin publicar. ¿Salir igual?")) return;
    token.set(null);
    datos = null; nuevas.clear();
    mostrarLogin();
  });

  document.addEventListener("click", (e) => {
    const m = $(".menu");
    if (m.open && !m.contains(e.target)) m.open = false;
  });

  /* ---------- Aviso ---------- */
  let tAviso;
  function aviso(txt) {
    const t = $("#toast");
    t.textContent = txt;
    t.classList.add("ver");
    clearTimeout(tAviso);
    tAviso = setTimeout(() => t.classList.remove("ver"), 2600);
  }

  /* ---------- Inicio ---------- */
  if (token.get()) cargar().catch((err) => { if (!$("#vLogin").hidden) return; mostrarLogin(err.message); });
  else mostrarLogin();
})();
