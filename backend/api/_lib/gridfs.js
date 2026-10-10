import { GridFSBucket } from 'mongodb'
import { Readable } from 'node:stream'

export const GRIDFS_BUCKET_NAME = 'order_pdfs'
export const GRIDFS_CHUNK_SIZE = 1024 * 1024 // 1 MB chunks to minimize network roundtrips to MongoDB Atlas

/**
 * Returns a GridFSBucket instance for the given database.
 */
export function getGridFSBucket(db, bucketName = GRIDFS_BUCKET_NAME) {
  if (!db) throw new Error('Database instance required for GridFSBucket')
  return new GridFSBucket(db, { bucketName })
}

/**
 * Uploads a PDF buffer or Readable stream to GridFS under filename `${orderId}.pdf`.
 * Automatically purges any pre-existing files for the same orderId to prevent duplicates.
 */
export async function savePdfToGridFS(db, orderId, pdfSource, metadata = {}) {
  if (!db) throw new Error('Database instance is required')
  if (!orderId) throw new Error('orderId is required')

  const isBuffer = Buffer.isBuffer(pdfSource)
  const isStream = Boolean(pdfSource && typeof pdfSource.pipe === 'function')

  if (!isBuffer && !isStream) {
    throw new Error('Valid PDF Buffer or Readable stream is required')
  }

  if (isBuffer) {
    if (pdfSource.length === 0) throw new Error('PDF Buffer is empty')
    // Validate magic header
    const magic = pdfSource.subarray(0, 5).toString('ascii')
    if (magic !== '%PDF-') {
      throw new Error(`Invalid PDF header: expected "%PDF-", got "${magic}"`)
    }
  }

  const cleanId = String(orderId).trim().toUpperCase()
  const filename = `${cleanId}.pdf`
  const bucket = getGridFSBucket(db)

  // Clean up any existing file versions for this order using indexed filename
  try {
    const existingFiles = await bucket.find({ filename }).toArray()
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

  const tUploadStart = performance.now()

  // Upload new file stream with 1MB chunk size
  return new Promise((resolve, reject) => {
    let bytesWritten = 0
    let validatedHeader = false

    const uploadStream = bucket.openUploadStream(filename, {
      chunkSizeBytes: GRIDFS_CHUNK_SIZE,
      contentType: 'application/pdf',
      metadata: {
        orderId: cleanId,
        fileName: metadata.fileName || filename,
        size: isBuffer ? pdfSource.length : (metadata.size || 0),
        uploadedAt: new Date().toISOString(),
        ...metadata,
      },
    })

    uploadStream.on('error', (err) => {
      console.error(`[GridFS upload error] Order ${cleanId}:`, err)
      reject(err)
    })

    uploadStream.on('finish', () => {
      const durationMs = Math.round(performance.now() - tUploadStart)
      resolve({
        fileId: uploadStream.id,
        filename,
        size: isBuffer ? pdfSource.length : bytesWritten,
        durationMs,
      })
    })

    if (isBuffer) {
      const readable = Readable.from(pdfSource)
      readable.pipe(uploadStream)
    } else {
      // Validate stream signature on first chunk
      pdfSource.on('data', (chunk) => {
        bytesWritten += chunk.length
        if (!validatedHeader && bytesWritten >= 5) {
          const magic = chunk.subarray(0, 5).toString('ascii')
          if (magic !== '%PDF-') {
            uploadStream.destroy(new Error(`Invalid PDF header: expected "%PDF-", got "${magic}"`))
            return
          }
          validatedHeader = true
        }
      })
      pdfSource.pipe(uploadStream)
    }
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
    let anyErrors = false
    for (const file of files) {
      try {
        await bucket.delete(file._id)
      } catch (delErr) {
        console.error(`[GridFS delete error] File ${file._id} for ${cleanId}:`, delErr.message)
        anyErrors = true
      }
    }
    if (anyErrors) {
      throw new Error(`Failed to delete one or more GridFS chunks/files for ${cleanId}`)
    }
    return true
  } catch (err) {
    console.error(`[GridFS delete failure] ${cleanId}:`, err.message)
    throw err
  }
}
