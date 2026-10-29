# A medias No · ventas y stock

Ventas, stock por talle, pedidos a fábrica, pagos y caja.

Next.js 16 (App Router) · React 19 · Tailwind 4 · Postgres con Drizzle · better-auth.

## Levantarlo

```bash
pnpm install
pnpm db:dev     # Postgres local sin Docker (queda corriendo; crea .env.local la primera vez)
pnpm dev        # en otra terminal → http://localhost:3000
```

Creá una cuenta desde `/sign-up`. Cada cuenta ve solo sus datos.

Para usar otra base, copiá `.env.example` a `.env.local`, completá
`DATABASE_URL` y corré `pnpm db:setup`: crea las tablas que falten y no toca las que ya existen.

Otros comandos: `pnpm typecheck`, `pnpm build`.

## Cómo está armado

- `app/actions/` — acciones del servidor, una por tema. Todas devuelven `{ ok, data } | { ok, error }`
  (`lib/session.ts`): en producción Next oculta el mensaje de los errores lanzados, así que los de
  validación viajan como resultado.
- `app/actions/workspace.ts` — trae todos los datos de la cuenta de una vez. `lib/view.ts` arma con
  eso lo que muestra cada pantalla (saldos, márgenes, tandas agrupadas, series por mes).
- `lib/inventory.ts` y `lib/stock.ts` — stock por talle, reservas de pedidos listos y
  entregas bajo bloqueo transaccional por cuenta (`lib/stock.ts` tiene las reglas de estado).
- `components/ui/modal.tsx` — la ventana modal (hoja desde abajo en el celular, centrada en
  escritorio) y `FormModal`, que maneja envío, estado y errores.
- `components/app/` — armazón, pantallas (`sections/`) y ventanas (`forms/`).
- `app/api/export/orders` — descarga de pedidos, clientes, catálogo, pagos, gastos, caja y tandas
  en Excel, CSV, PDF o JSON (`?tipo=…&format=…`).

Los importes se guardan en centavos. `toCents()` entiende `4500`, `4.500` y `4500,50`.


## Cómo se usa

Tres cosas separadas, cada una con su alta, baja y modificación:

| Pantalla | Qué es | Qué hace con el stock |
| --- | --- | --- |
| **Productos** | Lo que vendés: nombre, talles, costo, precio, tabla de medidas. | Al darlo de alta cargás cuántas unidades tenés de cada talle. |
| **Stock** | Lo que tenés en mano, por talle: en mano, reservado, disponible y en camino. | **Ingreso** suma unidades; **Corregir conteo** deja cada talle en lo que contaste. |
| **Ventas** | Lo que te compra cada cliente. | **Entregar ahora** descuenta; **Reservar** separa; **Queda pendiente** no toca nada. |
| **Pedidos a fábrica** | Lo que le encargás a la fábrica: reposición de stock, ventas pendientes o ambas. | **Recibir mercadería** suma todo al stock y reserva las ventas del pedido. |

Reglas:

- **Disponible = en mano − reservado.** Una venta solo usa unidades disponibles del mismo producto y talle.
- **Si hay stock, la venta se entrega en el momento.** El formulario lo sugiere solo cuando alcanza.
- **Si no hay stock, la venta queda Pendiente.** Desde su detalle se encarga a fábrica, o se entrega
  más adelante cuando entre mercadería.
- **Una venta En fábrica se puede entregar desde stock sin esperar.** Sale del pedido a fábrica y lo
  encargado para ella queda en ese pedido como reposición: la fábrica puede estar haciéndolo y, al
  recibirlo, entra libre al stock.
- **Quitar una venta del pedido a fábrica** (desde el detalle del pedido) también quita sus productos:
  sirve para corregir un encargo antes de mandarlo.
- **Recibir** se hace una sola vez. Si llegó algo distinto, corregilo con un conteo en Stock.
- Mientras una venta está **Pendiente** se pueden corregir sus productos, talles y precios.
- Un producto se puede **borrar** solo si nunca se usó; si no, se **archiva**. Un pedido a fábrica
  se puede borrar mientras no se recibió: sus ventas vuelven a Pendiente.
- Cancelar una venta libera su reserva (o devuelve las unidades, si ya se había entregado).
- WhatsApp en clientes, proveedores, ventas y pedidos a fábrica: abre `wa.me` con el mensaje
  preparado; **no lo envía solo**.

### Stock «Sin talle»

Instalaciones viejas guardaban stock sin talle. Aparece en Stock en amarillo («Asignale talle»).
Con **Corregir conteo** poné 0 en «Sin talle» y la cantidad real en cada talle. No se adivina la
distribución: eso podría entregar una prenda del talle equivocado.

## Deploy en Railway

1. En Railway, nuevo proyecto → **Deploy from GitHub repo** con este repositorio, y sumá un
   servicio **PostgreSQL** al mismo proyecto.
2. En el servicio web → **Variables**, cargá lo de [`.env.railway.example`](.env.railway.example):
   `DATABASE_URL=${{Postgres.DATABASE_URL}}`, `BETTER_AUTH_SECRET` (`openssl rand -hex 32`) y
   `BETTER_AUTH_URL` con la URL pública exacta (Settings → Networking → Generate Domain).
3. Listo: cada push a la rama configurada en Railway (Settings → Source) vuelve a desplegar.

Railway usa [`railway.toml`](railway.toml) → [`Dockerfile`](Dockerfile) → [`start.sh`](start.sh), que
espera a Postgres, aplica el esquema (idempotente, no borra datos) y arranca Next en `$PORT`.
El healthcheck es `/api/health` (responde 200 solo si la base contesta). **Start Command** y
**Pre-deploy Command** del dashboard deben quedar vacíos.

### Pasar los datos desde Neon/Vercel

Con la app vieja sin uso (para no perder ventas en el medio):

```bash
pg_dump --no-owner --no-acl "$URL_NEON" > respaldo.sql
psql "$URL_RAILWAY" < respaldo.sql   # sobre la base de Railway vacía
```

Después desplegá: `start.sh` aplica las migraciones nuevas sobre esos datos. Las cuentas y
contraseñas viajan en las tablas de better-auth; mantené el mismo `BETTER_AUTH_SECRET` si querés
conservar las sesiones abiertas (si no, solo hay que volver a ingresar).

### Actualizar una instalación existente

1. Respaldo de Postgres (`pg_dump`).
2. Desplegar. El esquema se aplica solo al arrancar (`pnpm db:setup` hace lo mismo a mano).
   Esta versión agrega `supplier_batches.order_id` y copia como líneas los productos de las ventas
   de tandas viejas; repetirlo no duplica nada.
3. Revisar en Stock si quedó algo «Sin talle» y clasificarlo con un conteo.

`products.requested_stock` ya no se usa: «En camino» se calcula desde los pedidos a fábrica abiertos.

### Teléfonos para WhatsApp

Para Argentina aceptamos número con área (`11 5555 5555`), formato local con `0`/`15`
(`011 15 5555 5555`) o internacional (`+54 9 11 5555 5555`). Para otros países ingresar
`+código de país`. Un contacto que sea email, texto o un número incompleto no genera botón.

### Pruebas de inventario

Se usa Bun solo como ejecutor de pruebas (`npx bun@1` alcanza, no hace falta instalarlo).
Prepará una base Postgres de pruebas con `DATABASE_URL=<base de pruebas> node scripts/db-setup.mjs`
(sin `.env.local` que apunte a otra base), luego:

```bash
TEST_DATABASE_URL='postgresql://usuario:clave@localhost:5432/base_pruebas' npx bun@1 test tests/inventory.test.ts
```

Las pruebas exigen `TEST_DATABASE_URL`; nunca usar producción. Usan un usuario sintético,
verifican las acciones reales sobre Postgres y limpian sus datos. Cubren concurrencia, rollback,
reservas, talles, entrega desde stock de ventas en fábrica, pedidos de reposición y mixtos,
ingreso y conteo de stock, bajas, migración idempotente y WhatsApp.
`tests/` se excluye del typecheck/build de Next: es un runner Bun, no código de la aplicación.

Con Next y la base de desarrollo activos, `python tests/browser-smoke.py` (Playwright) recorre en
el navegador: producto con stock por talle, venta entregada en el momento, venta sin stock
encargada a fábrica, pedido de reposición, recepción y vista móvil. Crea datos sintéticos.
