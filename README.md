# Medias · gestión de pedidos

Pedidos, pagos, stock, tandas de fábrica y caja para un emprendimiento que vende por encargo.

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
- `lib/stock.ts` — la regla de stock: un pedido que espera fábrica cuenta como "solicitado"; al
  recibir una tanda entra al stock real; al entregarse sale.
- `components/ui/modal.tsx` — la ventana modal (hoja desde abajo en el celular, centrada en
  escritorio) y `FormModal`, que maneja envío, estado y errores.
- `components/app/` — armazón, pantallas (`sections/`) y ventanas (`forms/`).
- `app/api/export/orders` — descarga de pedidos, clientes, catálogo, pagos, gastos, caja y tandas
  en Excel, CSV, PDF o JSON (`?tipo=…&format=…`).

Los importes se guardan en centavos. `toCents()` entiende `4500`, `4.500` y `4500,50`.
