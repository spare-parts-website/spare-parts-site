import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth } from '@/lib/auth'

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

// GET /api/invoices?id=orderId - returns HTML invoice for printing
export async function GET(req: NextRequest) {
  try {
    const session = await requireAuth()
    const { searchParams } = new URL(req.url)
    const orderId = searchParams.get('id')
    if (!orderId) return new Response('Order ID required', { status: 400 })

    const order = await db.order.findUnique({
      where: { id: orderId },
      include: {
        part: { select: { name: true, brand: true, image: true, price: true } },
        items: { orderBy: { createdAt: 'asc' } },
        store: { select: { name: true, address: true, phone: true, ownerId: true } },
        buyer: { select: { name: true, email: true, phone: true } },
        timeline: { orderBy: { createdAt: 'asc' } },
      },
    })

    if (!order) return new Response('Order not found', { status: 404 })

    const isBuyer = order.buyerId === session.id
    const isOwner = session.role === 'SHOP_OWNER' && order.store.ownerId === session.id
    const isAdmin = session.role === 'ADMIN'
    if (!isBuyer && !isOwner && !isAdmin) {
      return new Response('Unauthorized', { status: 403 })
    }

    const items = order.items.length ? order.items : [{
      productName: order.part.name,
      unitPrice: order.part.price,
      quantity: order.quantity,
      discount: order.discount || 0,
      itemTotal: Math.max(0, order.totalPrice - (order.shippingFee || 0)),
    }]
    const discount = items.reduce((sum, item) => sum + item.discount, 0)
    const subtotal = items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0)
    const shippingFee = order.shippingFee || 0
    const total = order.totalPrice
    const itemRows = items.map((item) => `
          <tr>
            <td><strong>${escapeHtml(item.productName)}</strong></td>
            <td>${item.quantity}</td>
            <td>${item.unitPrice.toLocaleString('ar-EG')} ج.م</td>
            <td>${item.itemTotal.toLocaleString('ar-EG')} ج.م</td>
          </tr>`).join('')
    const invoiceNumber = escapeHtml(`INV-${order.id.slice(-8).toUpperCase()}`)
    const date = escapeHtml(new Date(order.createdAt).toLocaleDateString('ar-EG'))
    const statusLabel = order.status === 'PAID' ? 'مدفوع' : order.status === 'DELIVERED' ? 'تم التوصيل' : order.status === 'PENDING' ? 'بانتظار الموافقة' : order.status

    const html = `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
<meta charset="utf-8">
<title>فاتورة ${invoiceNumber}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Cairo', 'Segoe UI', Tahoma, sans-serif; background: #f5f5f5; padding: 20px; color: #1a1a1a; }
  .invoice { max-width: 800px; margin: 0 auto; background: white; padding: 40px; border-radius: 12px; box-shadow: 0 4px 20px rgba(0,0,0,0.08); }
  .header { display: flex; justify-content: space-between; align-items: flex-start; padding-bottom: 20px; border-bottom: 3px solid #0d9488; margin-bottom: 30px; }
  .logo { font-size: 28px; font-weight: bold; color: #0d9488; }
  .invoice-info { text-align: left; }
  .invoice-info h1 { font-size: 24px; color: #0d9488; margin-bottom: 5px; }
  .invoice-info p { font-size: 14px; color: #666; }
  .parties { display: grid; grid-template-columns: 1fr 1fr; gap: 30px; margin-bottom: 30px; }
  .party h3 { font-size: 14px; color: #999; margin-bottom: 8px; text-transform: uppercase; }
  .party p { font-size: 16px; margin-bottom: 4px; }
  .party .name { font-weight: bold; font-size: 18px; }
  .items { margin-bottom: 30px; }
  table { width: 100%; border-collapse: collapse; }
  th { background: #f0fdfa; color: #0d9488; padding: 12px; text-align: right; font-size: 14px; border-bottom: 2px solid #0d9488; }
  td { padding: 12px; border-bottom: 1px solid #eee; font-size: 14px; }
  .totals { margin-left: auto; width: 300px; margin-top: 20px; }
  .totals .row { display: flex; justify-content: space-between; padding: 8px 0; font-size: 16px; }
  .totals .total { border-top: 2px solid #0d9488; padding-top: 12px; margin-top: 8px; font-size: 22px; font-weight: bold; color: #0d9488; }
  .status-badge { display: inline-block; padding: 4px 12px; border-radius: 20px; font-size: 12px; font-weight: bold; background: #d1fae5; color: #065f46; }
  .footer { margin-top: 40px; padding-top: 20px; border-top: 1px solid #eee; text-align: center; color: #999; font-size: 12px; }
  .print-btn { display: block; margin: 20px auto; padding: 12px 32px; background: #0d9488; color: white; border: none; border-radius: 8px; font-size: 16px; cursor: pointer; }
  .print-btn:hover { background: #0f766e; }
  @media print { body { background: white; padding: 0; } .invoice { box-shadow: none; padding: 20px; } .print-btn { display: none; } }
</style>
</head>
<body>
  <div class="invoice">
    <div class="header">
      <div>
        <div class="logo">غيار ماركت</div>
        <p style="color: #666; margin-top: 5px;">منصة غيار ماركت لقطع غيار السيارات</p>
      </div>
      <div class="invoice-info">
        <h1>فاتورة</h1>
        <p>رقم: ${invoiceNumber}</p>
        <p>التاريخ: ${date}</p>
        <p>الحالة: <span class="status-badge">${escapeHtml(statusLabel)}</span></p>
      </div>
    </div>

    <div class="parties">
      <div class="party">
        <h3>من (المتجر)</h3>
        <p class="name">${escapeHtml(order.store.name)}</p>
        ${order.store.address ? `<p>${escapeHtml(order.store.address)}</p>` : ''}
        ${order.store.phone ? `<p>هاتف: ${escapeHtml(order.store.phone)}</p>` : ''}
      </div>
      <div class="party">
        <h3>إلى (العميل)</h3>
        <p class="name">${escapeHtml(order.buyer.name)}</p>
        <p>${escapeHtml(order.buyer.email)}</p>
        ${order.buyer.phone ? `<p>هاتف: ${escapeHtml(order.buyer.phone)}</p>` : ''}
      </div>
    </div>

    <div class="items">
      <table>
        <thead>
          <tr>
            <th>القطعة</th>
            <th>الكمية</th>
            <th>السعر</th>
            <th>الإجمالي</th>
          </tr>
        </thead>
        <tbody>
          ${itemRows}
        </tbody>
      </table>
    </div>

    <div class="totals">
      <div class="row"><span>المجموع الفرعي:</span><span>${subtotal.toLocaleString('ar-EG')} ج.م</span></div>
      ${discount > 0 ? `<div class="row"><span>الخصم${order.couponCode ? ` (${escapeHtml(order.couponCode)})` : ''}:</span><span>- ${discount.toLocaleString('ar-EG')} ج.م</span></div>` : ''}
      <div class="row"><span>الشحن:</span><span>${shippingFee.toLocaleString('ar-EG')} ج.م</span></div>
      <div class="row total"><span>الإجمالي:</span><span>${total.toLocaleString('ar-EG')} ج.م</span></div>
    </div>

    ${order.deliveryAddress ? `
    <div style="margin-top: 30px; padding: 16px; background: #f9fafb; border-radius: 8px;">
      <h3 style="font-size: 14px; color: #999; margin-bottom: 8px;">عنوان التوصيل</h3>
      <p>${escapeHtml(order.deliveryAddress)}</p>
    </div>` : ''}

    <div class="footer">
      <p>شكراً لتعاملكم معنا</p>
      <p>هذه الفاتورة مولدة إلكترونياً من منصة غيار ماركت</p>
    </div>

    <button class="print-btn" onclick="window.print()">طباعة / حفظ PDF</button>
  </div>
</body>
</html>`

    const invoiceCsp = [
      "default-src 'none'",
      "style-src 'unsafe-inline'",
      "font-src 'self' data:",
      "script-src 'unsafe-inline'",
      "frame-ancestors 'none'",
      "base-uri 'none'",
      "form-action 'none'",
    ].join('; ')

    return new Response(html, {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Content-Security-Policy': invoiceCsp,
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'DENY',
        'Cache-Control': 'private, no-store, max-age=0',
      },
    })
  } catch (e: any) {
    if (e.message === 'UNAUTHORIZED') return new Response('Unauthorized', { status: 401 })
    console.error(e)
    return new Response('Server error', { status: 500 })
  }
}
