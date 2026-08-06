import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth } from '@/lib/auth'

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

    const invoiceNumber = `INV-${order.id.slice(-8).toUpperCase()}`
    const date = new Date(order.createdAt).toLocaleDateString('ar-EG')
    const subtotal = order.totalPrice
    const discount = order.discount || 0
    const total = subtotal - discount

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
        <div class="logo">قطع غيار</div>
        <p style="color: #666; margin-top: 5px;">منصة قطع غيار السيارات</p>
      </div>
      <div class="invoice-info">
        <h1>فاتورة</h1>
        <p>رقم: ${invoiceNumber}</p>
        <p>التاريخ: ${date}</p>
        <p>الحالة: <span class="status-badge">${order.status === 'PAID' ? 'مدفوع' : order.status === 'DELIVERED' ? 'تم التوصيل' : order.status === 'PENDING' ? 'بانتظار الموافقة' : order.status}</span></p>
      </div>
    </div>

    <div class="parties">
      <div class="party">
        <h3>من (المتجر)</h3>
        <p class="name">${order.store.name}</p>
        ${order.store.address ? `<p>${order.store.address}</p>` : ''}
        ${order.store.phone ? `<p>هاتف: ${order.store.phone}</p>` : ''}
      </div>
      <div class="party">
        <h3>إلى (العميل)</h3>
        <p class="name">${order.buyer.name}</p>
        <p>${order.buyer.email}</p>
        ${order.buyer.phone ? `<p>هاتف: ${order.buyer.phone}</p>` : ''}
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
          <tr>
            <td>
              <strong>${order.part.name}</strong>
              ${order.part.brand ? `<br><small style="color:#999">${order.part.brand}</small>` : ''}
            </td>
            <td>${order.quantity}</td>
            <td>${order.part.price.toLocaleString('ar-EG')} ج.م</td>
            <td>${(order.part.price * order.quantity).toLocaleString('ar-EG')} ج.م</td>
          </tr>
        </tbody>
      </table>
    </div>

    <div class="totals">
      <div class="row"><span>المجموع الفرعي:</span><span>${subtotal.toLocaleString('ar-EG')} ج.م</span></div>
      ${discount > 0 ? `<div class="row"><span>الخصم${order.couponCode ? ` (${order.couponCode})` : ''}:</span><span>- ${discount.toLocaleString('ar-EG')} ج.م</span></div>` : ''}
      <div class="row total"><span>الإجمالي:</span><span>${total.toLocaleString('ar-EG')} ج.م</span></div>
    </div>

    ${order.deliveryAddress ? `
    <div style="margin-top: 30px; padding: 16px; background: #f9fafb; border-radius: 8px;">
      <h3 style="font-size: 14px; color: #999; margin-bottom: 8px;">عنوان التوصيل</h3>
      <p>${order.deliveryAddress}</p>
    </div>` : ''}

    <div class="footer">
      <p>شكراً لتعاملكم معنا</p>
      <p>هذه الفاتورة مولدة إلكترونياً من منصة قطع غيار</p>
    </div>

    <button class="print-btn" onclick="window.print()">طباعة / حفظ PDF</button>
  </div>
</body>
</html>`

    return new Response(html, {
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    })
  } catch (e: any) {
    if (e.message === 'UNAUTHORIZED') return new Response('Unauthorized', { status: 401 })
    console.error(e)
    return new Response('Server error', { status: 500 })
  }
}
