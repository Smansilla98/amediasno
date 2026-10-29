"""Prueba de navegador con sesión real. Ejecutar con Next y Postgres locales activos.
Crea una cuenta y datos sintéticos en la base de desarrollo configurada.

Recorre el flujo principal: producto con stock por talle, venta entregada en el
momento desde stock, venta sin stock encargada a fábrica, reposición sin ventas,
recepción, importación desde planilla y vista móvil.

Uso: python tests/browser-smoke.py [http://localhost:3000]
(con el servidor levantado con ALLOW_SIGNUP=true si la base ya tiene cuentas)
"""
import sys
import uuid
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

BASE = sys.argv[1] if len(sys.argv) > 1 else 'http://localhost:3000'
ARTIFACTS = Path(__file__).resolve().parents[1] / '.test-artifacts'
ARTIFACTS.mkdir(exist_ok=True)


def dialog(page):
    return page.get_by_role('dialog').last


def go(page, label):
    page.get_by_role('navigation', name='Secciones').get_by_role('button', name=label).click()


with sync_playwright() as pw:
    browser = pw.chromium.launch(headless=True, args=['--no-sandbox'])
    context = browser.new_context(viewport={'width': 1440, 'height': 1000})
    page = context.new_page()
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))

    page.goto(f'{BASE}/sign-up')
    page.locator('input[name=name]').fill('Prueba stock')
    page.locator('input[name=email]').fill(f'stock-{uuid.uuid4().hex[:8]}@example.test')
    page.locator('input[name=password]').fill(uuid.uuid4().hex)
    page.get_by_role('button', name='Crear cuenta', exact=True).click()
    page.wait_for_url(f'{BASE}/', timeout=30000)

    # Producto con talles y stock inicial por talle.
    page.get_by_role('button', name='Nuevo producto', exact=True).click()
    d = dialog(page)
    d.locator('input[name=name]').fill('Buzo')
    d.get_by_label('Precio de venta').fill('20000')
    for size in ('M', 'L'):
        d.get_by_role('group', name='Talles disponibles').get_by_text(size, exact=True).click()
    d.locator('section', has_text='Stock que ya tenés').get_by_label('M', exact=True).fill('2')
    d.get_by_role('button', name='Guardar producto').click()
    expect(page.get_by_text('Producto guardado')).to_be_visible()

    # El stock se ve por talle.
    go(page, 'Stock')
    card = page.locator('section', has_text='Buzo').first
    expect(card.get_by_text('2 en mano')).to_be_visible()
    page.screenshot(path=str(ARTIFACTS / 'stock.png'), full_page=True)

    # Venta con stock: se entrega en el momento, sin pasar por fábrica.
    page.get_by_role('button', name='Nuevo', exact=True).click()
    page.get_by_role('menuitem', name='Venta').click()
    d = dialog(page)
    d.locator('input[name=customerName]').fill('Cliente con stock')
    d.get_by_label('Producto').first.select_option(label='Buzo')
    d.get_by_label('Talle').first.select_option('M')
    expect(d.get_by_text('En stock · 2 disponibles')).to_be_visible()
    expect(d.get_by_role('radio', name='Entregar ahora')).to_be_checked()
    d.get_by_role('button', name='Guardar y entregar').click()
    expect(page.get_by_text('Venta entregada: stock descontado')).to_be_visible()
    expect(card.get_by_text('1 en mano')).to_be_visible()

    # Proveedor para poder pedir a fábrica.
    go(page, 'Proveedores')
    page.get_by_role('button', name='Nuevo proveedor').click()
    d = dialog(page)
    d.locator('input[name=name]').fill('Fábrica prueba')
    d.get_by_role('button', name='Guardar proveedor').click()
    expect(page.get_by_text('Proveedor guardado')).to_be_visible()

    # Venta sin stock: queda pendiente y se encarga desde su detalle.
    page.get_by_role('button', name='Nuevo', exact=True).click()
    page.get_by_role('menuitem', name='Venta').click()
    d = dialog(page)
    d.get_by_role('button', name='+ Cargar un cliente nuevo').click()
    d.locator('input[name=customerName]').fill('Cliente sin stock')
    d.get_by_label('Producto').first.select_option(label='Buzo')
    d.get_by_label('Talle').first.select_option('L')
    expect(d.get_by_text('Sin stock disponible')).to_be_visible()
    expect(d.get_by_role('radio', name='Queda pendiente')).to_be_checked()
    d.get_by_role('button', name='Guardar venta').click()
    expect(page.get_by_text('Venta guardada como pendiente')).to_be_visible()
    go(page, 'Ventas')
    page.get_by_role('cell', name='Cliente sin stock').click()
    dialog(page).get_by_role('button', name='Encargar a fábrica').click()
    d = dialog(page)
    d.get_by_role('button', name='Crear pedido').click()
    expect(page.get_by_text('Pedido a fábrica creado')).to_be_visible()
    expect(dialog(page).get_by_text('Encargada en')).to_be_visible()
    page.keyboard.press('Escape')

    # Pedido solo de reposición, y recepción de todo.
    go(page, 'Pedidos a fábrica')
    page.get_by_role('button', name='Nuevo pedido').click()
    d = dialog(page)
    d.get_by_label('Producto').first.select_option(label='Buzo')
    d.get_by_label('Talle').first.select_option('M')
    d.get_by_label('Cant.').first.fill('3')
    d.get_by_role('button', name='Crear pedido').click()
    expect(page.get_by_text('Pedido a fábrica creado')).to_be_visible()
    for kind in ('Reposición de stock', 'Para ventas'):
        page.get_by_role('button', name=kind).first.click()
        dialog(page).get_by_role('button', name='Recibir mercadería').click()
        dialog(page).get_by_role('button', name='Sí, llegó todo').click()
        expect(page.get_by_text('Mercadería recibida').first).to_be_visible()
        page.keyboard.press('Escape')

    go(page, 'Stock')
    card = page.locator('section', has_text='Buzo').first
    expect(card.get_by_text('4 en mano')).to_be_visible()
    expect(card.get_by_text('1 res.')).to_be_visible()
    page.screenshot(path=str(ARTIFACTS / 'stock-final.png'), full_page=True)

    # Importar desde planilla (pegado como desde Excel): crea uno y actualiza otro.
    go(page, 'Productos')
    page.get_by_role('button', name='Importar planilla').click()
    d = dialog(page)
    d.get_by_label('Pegar planilla').fill('Producto\tColor\tPrecio\tS\tM\nRemera\tBlanca\t9.000\t4\t0\nBuzo\t\t\t\t5')
    expect(d.get_by_text('Vista previa')).to_be_visible()
    expect(d.get_by_text('Actualiza', exact=True)).to_be_visible()
    page.screenshot(path=str(ARTIFACTS / 'import.png'), full_page=True)
    d.get_by_role('button', name='Importar 2 productos').click()
    expect(page.get_by_text('Listo: 1 productos nuevos, 1 actualizados, 9 unidades')).to_be_visible()
    go(page, 'Stock')
    expect(page.locator('section', has_text='Remera').first.get_by_text('4 en mano')).to_be_visible()

    # Móvil: la barra inferior lleva a Stock.
    page.set_viewport_size({'width': 390, 'height': 844})
    page.get_by_role('navigation', name='Navegación principal').get_by_role('button', name='Ventas').click()
    page.screenshot(path=str(ARTIFACTS / 'mobile.png'), full_page=True)

    assert not errors, errors
    browser.close()
    print('Prueba de navegador OK')
