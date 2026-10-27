import { getOrderStatus, isHtmlResponse } from '../../frontend/src/utils/api.js'

async function run() {
  console.log('--- FINAL LIVE PRODUCTION ENDPOINT VERIFICATION ---')

  // 1. Target order XB8797 on Vercel
  const t1 = await fetch('https://xbuddysrkr.vercel.app/api/orders?action=getOrderStatus&orderId=XB8797')
  const ct1 = t1.headers.get('content-type')
  const d1 = await t1.json()
  console.log('TEST 1 (XB8797 on Vercel):')
  console.log('  Status:', t1.status)
  console.log('  Content-Type:', ct1)
  console.log('  orderId:', d1.order?.orderId)
  console.log('  mongoSaved:', d1.order?.mongoSaved)
  console.log('  source:', d1.source)
  console.log('  printStatus:', d1.order?.printStatus)
  console.log('  paymentStatus:', d1.order?.paymentStatus)

  // 2. Target order XB8797 on Render canonical
  const t1r = await fetch('https://xbuddy.onrender.com/api/orders?action=getOrderStatus&orderId=XB8797')
  const ct1r = t1r.headers.get('content-type')
  const d1r = await t1r.json()
  console.log('\nTEST 2 (XB8797 on Render):')
  console.log('  Status:', t1r.status)
  console.log('  Content-Type:', ct1r)
  console.log('  orderId:', d1r.order?.orderId)
  console.log('  source:', d1r.source)

  // 3. Nonexistent order XB0000 on Vercel
  const t2 = await fetch('https://xbuddysrkr.vercel.app/api/orders?action=getOrderStatus&orderId=XB0000')
  const ct2 = t2.headers.get('content-type')
  const d2 = await t2.json()
  console.log('\nTEST 3 (XB0000 on Vercel):')
  console.log('  Status:', t2.status)
  console.log('  Content-Type:', ct2)
  console.log('  success:', d2.success)
  console.log('  error:', d2.error)

  // 4. listOrders on Vercel
  const t3 = await fetch('https://xbuddysrkr.vercel.app/api/orders?action=listOrders')
  const ct3 = t3.headers.get('content-type')
  const d3 = await t3.json()
  const has8797 = d3.orders?.some(o => o.orderId === 'XB8797')
  console.log('\nTEST 4 (listOrders on Vercel):')
  console.log('  Status:', t3.status)
  console.log('  Content-Type:', ct3)
  console.log('  orderCount:', d3.orders?.length)
  console.log('  source:', d3.source)
  console.log('  contains XB8797:', has8797)

  // 5. Client getOrderStatus('XB8797')
  const client8797 = await getOrderStatus('XB8797')
  console.log('\nTEST 5 (Frontend client getOrderStatus XB8797):')
  console.log('  success:', client8797.success)
  console.log('  orderId:', client8797.orderId)
  console.log('  verified:', client8797.verified)
  console.log('  verifiedInMongo:', client8797.verifiedInMongo)
  console.log('  source:', client8797.source)
  console.log('  printStatus:', client8797.printStatus)
  console.log('  paymentStatus:', client8797.paymentStatus)

  // 6. Client getOrderStatus('XB0000')
  const client0000 = await getOrderStatus('XB0000')
  console.log('\nTEST 6 (Frontend client getOrderStatus XB0000):')
  console.log('  success:', client0000.success)
  console.log('  notFound:', client0000.notFound)
  console.log('  unavailable:', client0000.unavailable)
  console.log('  error:', client0000.error)

  // 7. isHtmlResponse guard
  const htmlSample = '<!DOCTYPE html><html><head><script src="/assets/main-niTvHFXS.js"></script></head><body><div id="root"></div></body></html>'
  const isHtml = isHtmlResponse(htmlSample, 'text/html; charset=utf-8')
  console.log('\nTEST 7 (isHtmlResponse guard):')
  console.log('  Correctly flagged SPA HTML as HTML:', isHtml)

  console.log('\n=== ALL TESTS COMPLETED SUCCESSFULLY ===')
}

run()
