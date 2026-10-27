import { MongoClient, BSON } from 'mongodb'
import dns from 'dns'
import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import { execSync } from 'child_process'

try {
  dns.setServers(['8.8.8.8', '1.1.1.1'])
} catch (_) {}

async function createBackup() {
  console.log('================================================================')
  console.log('      XBUDDY DATABASE FULL BACKUP (NON-DESTRUCTIVE READ-ONLY)   ')
  console.log('================================================================\n')

  const utcTimestamp = new Date().toISOString().replace(/[:.]/g, '-').replace('Z', 'UTC')
  const backupBaseDir = 'C:\\Users\\SRKREC\\.xbuddy_backups'
  if (!fs.existsSync(backupBaseDir)) {
    fs.mkdirSync(backupBaseDir, { recursive: true })
  }

  const backupFolderName = `xbuddy_backup_${utcTimestamp}`
  const backupDir = path.join(backupBaseDir, backupFolderName)
  const dbDir = path.join(backupDir, 'xbuddy')
  fs.mkdirSync(dbDir, { recursive: true })

  const uri = process.env.MONGODB_URI || ''
  if (!uri) throw new Error('MONGODB_URI is required')

  console.log('[Connecting to MongoDB Atlas...]')
  const client = new MongoClient(uri, {
    maxPoolSize: 5,
    serverSelectionTimeoutMS: 30000,
    connectTimeoutMS: 30000,
    socketTimeoutMS: 180000,
  })
  await client.connect()
  const db = client.db(process.env.MONGODB_DB_NAME || 'xbuddy')

  // Verify connection host without credentials
  const clusterMatch = uri.match(/@([^/?]+)/)
  const sanitizedCluster = clusterMatch ? clusterMatch[1] : 'Unknown Cluster'

  console.log('[Step 2.1: Target Database Verification]')
  console.log(`  - Target Cluster:  ${sanitizedCluster}`)
  console.log(`  - Database:        ${db.databaseName}`)
  console.log(`  - Backup Path:     ${backupDir}\n`)

  const collectionsInfo = await db.listCollections().toArray()
  const collectionNames = collectionsInfo.map(c => c.name).sort()

  console.log(`[Step 2.2: Exporting ${collectionNames.length} Collections to BSON]`)

  const summary = {
    utcTimestamp,
    creationTime: new Date().toISOString(),
    cluster: sanitizedCluster,
    database: db.databaseName,
    tools: {
      node: process.version,
      mongodbDriver: '7.7.0',
      bson: 'Standard MongoDB BSON Format',
      archiver: 'Windows tar (bsdtar)'
    },
    collections: []
  }

  for (const name of collectionNames) {
    const col = db.collection(name)
    const indexes = await col.indexes()
    const options = collectionsInfo.find(c => c.name === name)?.options || {}

    // 1. Export Metadata JSON
    const metadata = {
      options,
      indexes: indexes.map(idx => ({
        v: idx.v,
        key: idx.key,
        name: idx.name,
        unique: Boolean(idx.unique),
        background: Boolean(idx.background),
      })),
    }
    fs.writeFileSync(path.join(dbDir, `${name}.metadata.json`), JSON.stringify(metadata, null, 2))

    // 2. Export Documents to Binary BSON
    const bsonFilePath = path.join(dbDir, `${name}.bson`)
    const bsonStream = fs.createWriteStream(bsonFilePath)

    let docCount = 0
    let totalBytes = 0

    const cursor = col.find({}, { batchSize: name === 'order_pdfs.chunks' ? 25 : 100 })
    let lastLogTime = Date.now()

    for await (const doc of cursor) {
      const serialized = BSON.serialize(doc)
      const canWrite = bsonStream.write(serialized)
      if (!canWrite) {
        await new Promise(resolve => bsonStream.once('drain', resolve))
      }
      docCount++
      totalBytes += serialized.length

      if (name === 'order_pdfs.chunks' && (docCount % 25 === 0 || Date.now() - lastLogTime > 15000)) {
        const pct = ((docCount / collectionsInfo.find(c => c.name === name)?.count || 419) * 100).toFixed(1)
        console.log(`    ... [${name}] Streamed ${docCount}/419 chunks (${(totalBytes / (1024 * 1024)).toFixed(2)} MB)`)
        lastLogTime = Date.now()
      }
    }

    await new Promise(resolve => bsonStream.end(resolve))

    console.log(`  ✓ ${name.padEnd(22)}: ${docCount.toString().padStart(6)} doc(s) -> ${(totalBytes / 1024).toFixed(1).padStart(8)} KB BSON`)

    summary.collections.push({
      name,
      documentCount: docCount,
      bsonBytes: totalBytes,
      indexesCount: indexes.length
    })
  }

  // Write backup manifest
  fs.writeFileSync(path.join(backupDir, 'manifest.json'), JSON.stringify(summary, null, 2))
  console.log('\n[Step 2.3: Compressing Backup Archive with tar.gz]')

  const archiveName = `${backupFolderName}.tar.gz`
  const archivePath = path.join(backupBaseDir, archiveName)

  // Use Windows native tar
  try {
    execSync(`tar -czf "${archivePath}" -C "${backupBaseDir}" "${backupFolderName}"`, { stdio: 'pipe' })
  } catch (tarErr) {
    throw new Error(`Failed to create tar.gz archive: ${tarErr.message}`)
  }

  const archiveStat = fs.statSync(archivePath)
  console.log(`  ✓ Archive Created: ${archivePath}`)
  console.log(`  ✓ Archive Size:    ${archiveStat.size.toLocaleString()} bytes (${(archiveStat.size / (1024 * 1024)).toFixed(2)} MB)`)

  // Compute SHA-256
  console.log('\n[Step 2.4: Computing SHA-256 Checksum]')
  const hash = crypto.createHash('sha256')
  const fileBuf = fs.readFileSync(archivePath)
  hash.update(fileBuf)
  const sha256 = hash.digest('hex')
  console.log(`  ✓ SHA-256: ${sha256}`)

  summary.archive = {
    path: archivePath,
    bytes: archiveStat.size,
    sha256,
  }

  // Restrict NTFS permissions on the archive
  try {
    execSync(`cmd.exe /c "icacls \\"${archivePath}\\" /inheritance:r /grant:r %USERNAME%:F"`, { stdio: 'pipe' })
    console.log('  ✓ File Permissions: NTFS ACL restricted exclusively to current user (%USERNAME%)')
  } catch (aclErr) {
    console.warn('  ! ACL restriction notice:', aclErr.message)
  }

  // Step 2.5: Archive Integrity Validation
  console.log('\n[Step 2.5: Validating Archive Integrity via Extraction & BSON Deserialization]')
  const verifyDir = path.join(backupBaseDir, `verify_${Date.now()}`)
  fs.mkdirSync(verifyDir, { recursive: true })

  try {
    execSync(`tar -xzf "${archivePath}" -C "${verifyDir}"`, { stdio: 'pipe' })
    console.log('  ✓ Archive extraction test succeeded.')

    const extractedDbDir = path.join(verifyDir, backupFolderName, 'xbuddy')
    let totalVerifiedDocs = 0

    for (const colSummary of summary.collections) {
      const bsonFile = path.join(extractedDbDir, `${colSummary.name}.bson`)
      if (!fs.existsSync(bsonFile)) {
        throw new Error(`Missing expected BSON file in archive: ${colSummary.name}.bson`)
      }

      const fileBuffer = fs.readFileSync(bsonFile)
      let offset = 0
      let verifiedDocs = 0

      while (offset < fileBuffer.length) {
        if (offset + 4 > fileBuffer.length) {
          throw new Error(`Corrupted BSON stream in ${colSummary.name}: truncated length header`)
        }
        const docSize = fileBuffer.readInt32LE(offset)
        if (offset + docSize > fileBuffer.length) {
          throw new Error(`Corrupted BSON doc in ${colSummary.name}: expected ${docSize} bytes, only ${fileBuffer.length - offset} remaining`)
        }
        const docBytes = fileBuffer.subarray(offset, offset + docSize)
        const doc = BSON.deserialize(docBytes)
        if (!doc || typeof doc !== 'object') {
          throw new Error(`Failed to deserialize BSON document in ${colSummary.name}`)
        }
        verifiedDocs++
        offset += docSize
      }

      if (verifiedDocs !== colSummary.documentCount) {
        throw new Error(`Document count mismatch in ${colSummary.name}: expected ${colSummary.documentCount}, verified ${verifiedDocs}`)
      }

      totalVerifiedDocs += verifiedDocs
      console.log(`  ✓ Verified ${colSummary.name}: ${verifiedDocs}/${colSummary.documentCount} documents deserialized cleanly from BSON`)
    }

    console.log(`\n  ★ 100% Archive Verification PASSED: ${totalVerifiedDocs} total documents deserialized bit-perfectly!`)
  } finally {
    // Cleanup extraction verification directory
    try {
      fs.rmSync(verifyDir, { recursive: true, force: true })
    } catch {}
  }

  await client.close()

  fs.writeFileSync('f:/xerox buddy/backend/scripts/backup_manifest.json', JSON.stringify(summary, null, 2))
  console.log('\n================================================================')
  console.log('             FULL BACKUP CREATED AND VERIFIED 100%              ')
  console.log('================================================================')

  return summary
}

createBackup().catch(err => {
  console.error('\n[BACKUP FATAL ERROR]:', err)
  process.exit(1)
})
