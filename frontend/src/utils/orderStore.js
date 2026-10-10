const STORAGE_KEY = 'xbuddy_my_orders'

/**
 * Retrieves all saved orders from localStorage, de-duped by orderId and sorted newest first.
 * @returns {Array} List of order objects
 */
export function getMyOrders() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []

    // De-dupe by orderId keeping newest savedAt
    const map = new Map()
    for (const item of parsed) {
      if (item && item.orderId) {
        const existing = map.get(item.orderId)
        if (!existing || (item.savedAt || 0) > (existing.savedAt || 0)) {
          map.set(item.orderId, item)
        }
      }
    }

    const uniqueOrders = Array.from(map.values())
    // Sort newest (savedAt) first
    uniqueOrders.sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0))

    return uniqueOrders
  } catch (err) {
    console.error('Failed to read my orders from localStorage:', err)
    return []
  }
}

/**
 * Saves an order to localStorage.
 * De-dupes by orderId and prepends as the newest order.
 * @param {Object} order - Order metadata object
 * @returns {Array} Updated list of orders
 */
export function saveOrder(order) {
  if (!order || !order.orderId) {
    console.warn('Cannot save order without orderId:', order)
    return getMyOrders()
  }

  const newEntry = {
    orderId: order.orderId,
    fileName: order.fileName || 'Document.pdf',
    totalPages: Number(order.totalPages) || 1,
    printableCount: Number(order.printableCount) || Number(order.totalPages) || 1,
    copies: Number(order.copies) || 1,
    colorMode: order.colorMode || (order.printType === 'Color' ? 'color' : 'bw'),
    printType: (order.colorMode === 'color' || order.printType === 'Color') ? 'Color' : 'B&W',
    printSide: order.printSide || (order.duplex ? 'Double' : 'Single'),
    duplex: order.duplex === true || order.printSide === 'Double',
    pageSize: order.pageSize || order.paperSize || 'A4',
    paperSize: order.paperSize || order.pageSize || 'A4',
    orientation: order.orientation || 'portrait',
    pageRange: order.pageRange || 'all',
    customPages: order.customPages || '',
    printingCost: Number(order.printingCost) || 0,
    digitalProcessingFee: Number(order.digitalProcessingFee || order.serviceFee) || 0,
    serviceFee: Number(order.digitalProcessingFee || order.serviceFee) || 0,
    amount: Number(order.amount) || 0,
    phone: order.phone || '',
    savedAt: order.savedAt || Date.now(),
    status: order.printStatus || order.status || 'Order Received',
    printStatus: order.printStatus || order.status || 'Order Received',
    paymentStatus: order.paymentStatus || 'pending',
    printedAt: order.printedAt || null,
    pdfExpiresAt: order.pdfExpiresAt || null,
    pdfDeletedAt: order.pdfDeletedAt || null,
    hasPdf: order.hasPdf !== false,
  }

  try {
    const existing = getMyOrders()
    const filtered = existing.filter(o => o.orderId !== newEntry.orderId)
    const updated = [newEntry, ...filtered]
    
    // Sort newest first
    updated.sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0))

    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated))
    return updated
  } catch (err) {
    console.error('Failed to save order to localStorage:', err)
    return getMyOrders()
  }
}

/**
 * Updates specific fields on an existing saved order in localStorage.
 * @param {string} orderId 
 * @param {Object} patch 
 * @returns {Array} Updated list of orders
 */
export function updateOrder(orderId, patch) {
  if (!orderId || !patch || typeof patch !== 'object') return getMyOrders()
  try {
    const existing = getMyOrders()
    let found = false
    const updated = existing.map(item => {
      if (item.orderId === orderId) {
        found = true
        return { ...item, ...patch }
      }
      return item
    })
    if (found) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated))
    }
    return updated
  } catch (err) {
    console.error('Failed to update order in localStorage:', err)
    return getMyOrders()
  }
}

/**
 * Finds a specific order by orderId.
 * @param {string} orderId 
 * @returns {Object|null}
 */
export function findOrder(orderId) {
  if (!orderId) return null
  const orders = getMyOrders()
  return orders.find(o => o.orderId === orderId) || null
}
