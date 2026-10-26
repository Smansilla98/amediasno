# A medias No · gestión de pedidos

Pedidos, pagos, stock por talle, compras a fábrica y caja. Las ventas y las compras son independientes.

Next.js 16 (App Router) · React 19 · Tailwind 4 · Postgres con Drizzle · better-auth.

## Levantarlo

```bash
pnpm install
pnpm db:dev     # Postgres local sin Docker (queda corriendo; crea .env.local la primera vez)
pnpm dev        # en otra terminal → http://localhost:3000
```

Creá una cuenta desde `/sign-up`. Cada cuenta ve solo sus datos.

Para usar otra base (Neon, por ejemplo), copiá `.env.example` a `.env.local`, completá
`DATABASE_URL` y corré `pnpm db:setup`: crea las tablas que falten y no toca las que ya existen.

Otros comandos: `pnpm typecheck`, `pnpm build`.

## Cómo está armado

- `app/actions/` — acciones del servidor, una por tema. Todas devuelven `{ ok, data } | { ok, error }`
  (`lib/session.ts`): en producción Next oculta el mensaje de los errores lanzados, así que los de
  validación viajan como resultado.
- `app/actions/workspace.ts` — trae todos los datos de la cuenta de una vez. `lib/view.ts` arma con
  eso lo que muestra cada pantalla (saldos, márgenes, tandas agrupadas, series por mes).
- `lib/inventory.ts` y `lib/stock.ts` — stock por talle, reservas de pedidos listos y
  entregas bajo bloqueo transaccional por cuenta. Recibir una tanda ingresa mercadería;
  entregar descuenta stock. Tomar una venta no crea un encargo a fábrica.
- `components/ui/modal.tsx` — la ventana modal (hoja desde abajo en el celular, centrada en
  escritorio) y `FormModal`, que maneja envío, estado y errores.
- `components/app/` — armazón, pantallas (`sections/`) y ventanas (`forms/`).
- `app/api/export/orders` — descarga de pedidos, clientes, catálogo, pagos, gastos, caja y tandas
  en Excel, CSV, PDF o JSON (`?tipo=…&format=…`).

Los importes se guardan en centavos. `toCents()` entiende `4500`, `4.500` y `4500,50`.


## Flujos de venta, stock y fábrica

- **Nuevo pedido → Tomar:** queda Tomado, sin enviar a fábrica. Podés decidir más adelante.
- **Nuevo pedido → Reservar stock:** queda Listo para entregar; las unidades quedan reservadas
  para ese cliente, pero siguen en el stock físico.
- **Nuevo pedido → Entregar ahora:** valida producto/talle y descuenta stock al guardar.
- En el **detalle de un pedido tomado**, si hay stock completo aparecen Reservar stock y
  Entregar ahora. Nunca usa unidades reservadas para otra persona ni sustituye talles.
- **Nueva tanda:** elegís explícitamente qué pedidos de clientes enviar y/o agregás líneas
  de mercadería para stock. No hay pedidos seleccionados automáticamente. Una tanda puede
  tener cero pedidos de clientes y solo reposición.
- **Recibir mercadería:** ingresa tanto los productos de clientes como los adicionales.
  Los pedidos activos quedan listos y reservados; el resto queda libre. Repetir la recepción
  no vuelve a sumar mercadería.
- Si querés cubrir con stock un pedido ya incluido en una tanda abierta, **quitalo de la tanda**
  antes de entregarlo. Esto también lo elimina del listado a encargar: avisale al proveedor
  si ya enviaste el encargo. Si la compra ya no se puede modificar, recibí la tanda antes.
- Cancelar la venta **no cancela la compra a fábrica**: las unidades que siguen en la tanda
  entran al stock libre cuando la recibís.
- **Ajustar stock:** sumar/restar por talle, o Clasificar unidades sin talle hacia un talle
  concreto sin alterar el total físico. Las reservas no se pueden restar por error.
- WhatsApp en clientes, proveedores, detalle de pedido y detalle de tanda. Se abre `wa.me`
  con el mensaje preparado; **no envía el mensaje automáticamente**.

### Actualizar una instalación existente

1. Hacé un respaldo de Postgres y planificá una ventana de actualización: la versión anterior
   no mantiene las nuevas columnas de inventario.
2. Aplicá los cambios de código y corré `pnpm db:setup` con la conexión configurada.
   La migración agrega `products.stock_by_size`, `supplier_batches.size` y
   `stock_movements.size`. Es idempotente; no borra pedidos, stock ni pagos.
3. Corré `pnpm typecheck` y `pnpm build`; luego actualizá tu despliegue de Next.js.
4. El stock que antes no tenía talle se conserva en **Sin talle / legado**. En Catálogo →
   Ajustar stock → Clasificar, distribuí las cantidades reales en sus talles. No se adivina
   la distribución: eso podría entregar una prenda del talle incorrecto.
5. Revisá los pedidos que ya estaban Listos antes de actualizar: ahora cuentan como reservas.
   Si aparece disponibilidad negativa en un talle, clasificá el stock físico existente o
   liberá la reserva volviendo el pedido a Tomado. No se inventa stock para corregirla.

La columna `requested_stock` se conserva para compatibilidad como contador de demanda de
clientes sin abastecer. La interfaz y las exportaciones calculan **En fábrica** desde tandas
abiertas, incluyendo compras para stock; un pedido tomado solo no aparece como encargo.
Los pedidos sin productos del catálogo mantienen su flujo manual, sin inventario.
La edición de una tanda permite cambiar sus datos, no sus líneas adicionales de reposición;
los pedidos de clientes se agregan/quitan desde el detalle mientras no esté recibida.

### Teléfonos para WhatsApp

Para Argentina aceptamos número con área (`11 5555 5555`), formato local con `0`/`15`
(`011 15 5555 5555`) o internacional (`+54 9 11 5555 5555`). Para otros países ingresar
`+código de país`. Un contacto que sea email, texto o un número incompleto no genera botón.

### Pruebas de inventario

Se usa Bun solo como ejecutor de pruebas, sin cambiar el stack Next.js de la aplicación.
Prepará una base Postgres de pruebas con `DATABASE_URL=<base de pruebas> node scripts/db-setup.mjs`
(sin `.env.local` que apunte a otra base), luego:

```bash
TEST_DATABASE_URL='postgresql://usuario:clave@localhost:5432/base_pruebas' bun test tests/inventory.test.ts
```

Las pruebas exigen `TEST_DATABASE_URL`; nunca usar producción. Usan un usuario sintético,
verifican las acciones reales sobre Postgres y limpian sus datos. Cubren concurrencia,
rollback, reservas, talles, compras sin clientes, compras mixtas, migración idempotente y WhatsApp.
`tests/` se excluye del typecheck/build de Next: es un runner Bun, no código de la aplicación.

Con Next.js local y la base de desarrollo activos, `python tests/browser-smoke.py` realiza
una prueba de navegador con Playwright/Chrome: registro, producto, entrega inmediata,
WhatsApp, reposición sin pedidos, recepción y móvil. Crea datos sintéticos en desarrollo.

El smoke test intercepta únicamente el endpoint de Vercel Analytics, que no se sirve en localhost.
No reemplaza acciones, autenticación ni consultas de inventario.
