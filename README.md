# Yana · catálogo web

Catálogo de piezas de yeso cerámico. La gente arma "Mi pedido" y lo manda por WhatsApp
con la lista ya escrita. Incluye un panel en **`/admin`** para editar piezas, precios,
fotos, categorías y datos de contacto sin tocar código.

## Cómo funciona el panel

- Se entra con una contraseña (`ADMIN_PASSWORD`).
- Al tocar **Publicar cambios**, el panel guarda todo (catálogo + fotos nuevas) como un
  commit en este repo de GitHub. Vercel detecta el commit y republica la web sola en 1–2 minutos.
- Las fotos se achican en el celular antes de subirse (máx. 1400 px), así la web carga rápido.
- Las fotos que se quitan de todas las piezas se borran del repo en el mismo commit.

## Estructura

| Archivo | Qué es |
| --- | --- |
| `index.html`, `styles.css`, `app.js` | La web pública |
| `data/productos.json` | El catálogo (lo edita el panel) |
| `img/piezas/` | Fotos de las piezas |
| `admin/` | Panel de administración |
| `api/` | Funciones de Vercel que usa el panel (login y guardado en GitHub) |

## Variables de entorno (en Vercel)

| Variable | Valor |
| --- | --- |
| `ADMIN_PASSWORD` | Contraseña del panel |
| `GITHUB_TOKEN` | Token de GitHub con permiso *Contents: Read and write* sobre este repo |
| `GITHUB_REPO` | `NikyMen/Yana` |
| `GITHUB_BRANCH` | `main` |

## Probar la web en la compu

```bash
python -m http.server 5173
```

y abrir http://localhost:5173 (el panel necesita las funciones de Vercel: `npx vercel dev`).
