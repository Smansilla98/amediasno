"""Prueba local con sesión real. Ejecutar con Next y Postgres locales activos.
Los datos sintéticos se crean solo en la base de desarrollo configurada.
"""
import json
import uuid
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[1]
ARTIFACTS = ROOT / '.test-artifacts'
ARTIFACTS.mkdir(exist_ok=True)
with sync_playwright() as pw:
    browser = pw.chromium.launch(channel='chrome', headless=True, args=['--no-sandbox'])
    context = browser.new_context(viewport={'width': 1440, 'height': 1000})
    # Vercel sirve este endpoint en el despliegue, no en localhost. No es parte del flujo probado.
    context.route('**/_vercel/insights/**', lambda route: route.fulfill(status=200, content_type='application/javascript', body='/* Analytics local no disponible */'))
    page = context.new_page()
    errors = []
    page.on('pageerror', lambda error: errors.append({'message': str(error), 'stack': error.stack}))
    page.goto('http://localhost:3000/sign-up')
    page.locator('input[name=name]').fill('Prueba stock')
    page.locator('input[name=email]').fill(f'stock-{uuid.uuid4().hex[:8]}@example.test')
    page.locator('input[name=password]').fill(uuid.uuid4().hex)
    page.get_by_role('button', name='Crear cuenta', exact=True).click()
    page.wait_for_url('http://localhost:3000/', timeout=30000)
    expect(page.get_by_text('Cargá tus productos', exact=True)).to_be_visible()
    page.get_by_role('button', name='Nuevo producto', exact=True).click()
    dialog = page.get_by_role('dialog').last
    dialog.locator('input[name=name]').fill('Medias deportivas')
    dialog.locator('input[name=category]').fill('Medias')
    dialog.locator('input[name=color]').fill('Negras')
    dialog.get_by_text('M', exact=True).click()
    dialog.get_by_text('L', exact=True).click()
    # Los inputs de dinero no tienen name; localizar por texto de Field.
    dialog.get_by_label('Costo', exact=False).fill('3000')
    dialog.get_by_label('Precio de venta', exact=False).fill('6000')
    dialog.locator('input[name=stock]').fill('5')
    dialog.locator('select[name=stockSize]').select_option('M')
    dialog.get_by_role('button', name='Guardar producto', exact=True).click()
    expect(page.get_by_role('dialog')).to_have_count(0)
    page.goto('http://localhost:3000/?v=pedidos')
    page.get_by_role('button', name='Nuevo pedido', exact=True).first.click()
    dialog = page.get_by_role('dialog').last
    dialog.locator('input[name=customerName]').fill('Lucía Pérez')
    dialog.locator('input[name=customerPhone]').fill('11 5555 5555')
    dialog.locator('select').nth(0).select_option(label='Medias deportivas · Negras')
    dialog.locator('select').nth(1).select_option('M')
    dialog.locator('input[type=number]').fill('2')
    # Abastecimiento: entregar al crear, sin tanda.
    dialog.get_by_label('Abastecimiento', exact=False).select_option('delivered')
    dialog.get_by_role('button', name='Guardar pedido', exact=True).click()
    expect(page.get_by_role('dialog')).to_have_count(0)
    page.get_by_text('PED-1001', exact=True).first.click()
    dialog = page.get_by_role('dialog').last
    expect(dialog.get_by_text('Entregado', exact=True).first).to_be_visible()
    href = dialog.get_by_role('link', name='Escribirle por WhatsApp').get_attribute('href')
    assert href.startswith('https://wa.me/5491155555555?text=')
    dialog.get_by_role('button', name='Cerrar', exact=True).click()
    page.goto('http://localhost:3000/?v=proveedores')
    page.get_by_role('button', name='Nuevo proveedor', exact=True).click()
    dialog = page.get_by_role('dialog').last
    dialog.locator('input[name=name]').fill('Fábrica Central')
    dialog.locator('input[name=contact]').fill('011 15 4444 4444')
    dialog.get_by_role('button', name='Guardar proveedor', exact=True).click()
    expect(page.get_by_role('dialog')).to_have_count(0)
    page.goto('http://localhost:3000/?v=tandas')
    page.get_by_role('button', name='Nueva tanda', exact=True).click()
    dialog = page.get_by_role('dialog').last
    dialog.locator('input[name=name]').fill('Reposición de stock · octubre')
    dialog.get_by_role('button', name='Agregar para stock').click()
    dialog.locator('select').nth(1).select_option(label='Medias deportivas · Negras')
    dialog.locator('select').nth(2).select_option('L')
    dialog.get_by_label('Unidades', exact=True).fill('8')
    dialog.get_by_role('button', name='Crear tanda', exact=True).click()
    expect(page.get_by_role('dialog')).to_have_count(0)
    page.get_by_text('Reposición de stock · octubre', exact=True).click()
    dialog = page.get_by_role('dialog').last
    expect(dialog.get_by_role('button', name='Recibir mercadería')).to_be_enabled()
    expect(dialog.get_by_role('link', name='Enviar pedido por WhatsApp')).to_have_attribute('href', __import__('re').compile(r'^https://wa.me/5491144444444\?text='))
    page.screenshot(path=str(ARTIFACTS / 'stock-tanda.png'), full_page=True)
    dialog.get_by_role('button', name='Recibir mercadería').click()
    page.get_by_role('dialog').last.get_by_role('button', name='Sí, llegó todo').click()
    expect(page.get_by_text('Recibida', exact=True).first).to_be_visible()
    page.goto('http://localhost:3000/?v=catalogo')
    # Tras recibir 8 L, el total físico debe ser 3 M + 8 L = 11.
    expect(page.get_by_text('11 / 11 u.', exact=True)).to_be_visible()
    page.screenshot(path=str(ARTIFACTS / 'stock-catalogo.png'), full_page=True)
    page.goto('http://localhost:3000/?v=clientes')
    expect(page.get_by_role('link', name='WhatsApp').first).to_have_attribute('href', 'https://wa.me/5491155555555')
    page.set_viewport_size({'width': 390, 'height': 844})
    expect(page.get_by_role('link', name='WhatsApp').last).to_be_visible()
    assert page.evaluate('document.documentElement.scrollWidth <= window.innerWidth')
    page.screenshot(path=str(ARTIFACTS / 'stock-movil.png'), full_page=True)
    assert not errors, errors
    print(json.dumps({'ok': True, 'checks': ['registro real', 'stock inicial M', 'entrega inmediata', 'WhatsApp cliente', 'tanda sin pedidos', 'WhatsApp proveedor', 'recepción stock L', 'stock físico correcto', 'móvil sin desborde'], 'pageErrors': errors}, ensure_ascii=False))
    browser.close()