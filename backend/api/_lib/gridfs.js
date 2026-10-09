import { GridFSBucket } from 'mongodb'
import { Readable } from 'node:stream'

export const GRIDFS_BUCKET_NAME = 'order_pdfs'

/**
 * Returns a GridFSBucket instance for the given database.
 */
export function getGridFSBucket(db, bucketName = GRIDFS_BUCKET_NAME) {
  if (!db) throw new Error('Database instance required for GridFSBucket')
  return new GridFSBucket(db, { bucketName })
}

/**
 * Uploads a PDF buffer to GridFS under filename `${orderId}.pdf`.
 * Automatically purges any pre-existing files for the same orderId to prevent duplicates.
 */
export async function savePdfToGridFS(db, orderId, pdfBuffer, metadata = {}) {
  if (!db) throw new Error('Database instance is required')
  if (!orderId) throw new Error('orderId is required')
  if (!Buffer.isBuffer(pdfBuffer) || pdfBuffer.length === 0) {
    throw new Error('Valid PDF Buffer is required')
  }

  // Validate magic header
  const magic = pdfBuffer.subarray(0, 5).toString('ascii')
  if (magic !== '%PDF-') {
    throw new Error(`Invalid PDF header: expected "%PDF-", got "${magic}"`)
  }

  const cleanId = String(orderId).trim().toUpperCase()
  const filename = `${cleanId}.pdf`
  const bucket = getGridFSBucket(db)

  // Clean up any existing file versions for this order
  try {
    const existingFiles = await bucket.find({
      $or: [{ filename }, { 'metadata.orderId': cleanId }]
    }).toArray()
    for (const file of existingFiles) {
      try {
        await bucket.delete(file._id)
      } catch (delErr) {
        console.warn(`[GridFS cleanup notice] Failed to delete prior file ${file._id} for ${cleanId}:`, delErr.message)
      }
    }
  } catch (findErr) {
    console.warn(`[GridFS lookup notice] ${cleanId}:`, findErr.message)
  }

  // Upload new file stream
  return new Promise((resolve, reject) => {
    const uploadStream = bucket.openUploadStream(filename, {
      contentType: 'application/pdf',
      metadata: {
        orderId: cleanId,
        fileName: metadata.fileName || filename,
        size: pdfBuffer.length,
        uploadedAt: new Date().toISOString(),
        ...metadata,
      },
    })

    uploadStream.on('error', (err) => {
      console.error(`[GridFS upload error] Order ${cleanId}:`, err)
      reject(err)
    })

    uploadStream.on('finish', () => {
      resolve({
        fileId: uploadStream.id,
        filename,
        size: pdfBuffer.length,
      })
    })

    const readable = Readable.from(pdfBuffer)
    readable.pipe(uploadStream)
  })
}

/**
 * Retrieves a PDF from GridFS as a readable stream and file metadata.
 * Returns null if the file does not exist.
 */
export async function getPdfStreamFromGridFS(db, orderId) {
  if (!db || !orderId) return null
  const cleanId = String(orderId).trim().toUpperCase()
  const filename = `${cleanId}.pdf`
  const bucket = getGridFSBucket(db)

  try {
    const files = await bucket.find({
      $or: [{ filename }, { 'metadata.orderId': cleanId }]
    }).sort({ uploadDate: -1 }).limit(1).toArray()

    if (!files || files.length === 0) return null
    const file = files[0]
    const stream = bucket.openDownloadStream(file._id)
    return { file, stream }
  } catch (err) {
    console.warn(`[GridFS read error] Order ${cleanId}:`, err.message)
    throw err
  }
}

/**
 * Reads the complete PDF from GridFS into a Buffer.
 * Returns null if the file does not exist.
 */
export async function getPdfBufferFromGridFS(db, orderId) {
  const result = await getPdfStreamFromGridFS(db, orderId)
  if (!result) return null
  const { file, stream } = result

  return new Promise((resolve, reject) => {
    const chunks = []
    stream.on('data', (chunk) => chunks.push(chunk))
    stream.on('error', (err) => reject(err))
    stream.on('end', () => {
      const buf = Buffer.concat(chunks)
      resolve({ buffer: buf, file })
    })
  })
}

/**
 * Checks whether a PDF exists in GridFS for an orderId.
 */
export async function hasPdfInGridFS(db, orderId) {
  if (!db || !orderId) return false
  const cleanId = String(orderId).trim().toUpperCase()
  const filename = `${cleanId}.pdf`
  const bucket = getGridFSBucket(db)
  try {
    const count = await bucket.find({
      $or: [{ filename }, { 'metadata.orderId': cleanId }]
    }).limit(1).toArray()
    return count.length > 0
  } catch {
    return false
  }
}

/**
 * Deletes all GridFS files associated with an orderId.
 * Used for rollbacks when order document creation fails.
 */
export async function deletePdfFromGridFS(db, orderId) {
  if (!db || !orderId) return false
  const cleanId = String(orderId).trim().toUpperCase()
  const filename = `${cleanId}.pdf`
  const bucket = getGridFSBucket(db)
  try {
    const files = await bucket.find({
      $or: [{ filename }, { 'metadata.orderId': cleanId }]
    }).toArray()
    for (const file of files) {
      try {
        await bucket.delete(file._id)
      } catch (delErr) {
        console.warn(`[GridFS delete error] File ${file._id} for ${cleanId}:`, delErr.message)
      }
    }
    return true
  } catch (err) {
    console.warn(`[GridFS delete lookup error] ${cleanId}:`, err.message)
    return false
  }
}
