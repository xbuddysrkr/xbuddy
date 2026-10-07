import { useCallback, useState } from 'react'
import { useDropzone } from 'react-dropzone'
import { motion, AnimatePresence } from 'framer-motion'
import { processFile, resolveFileType, formatBytes, SUPPORTED_TYPES, MAX_FILE_SIZE } from '../utils/fileProcessor'

const FORMAT_LABELS = ['PDF', 'DOCX', 'PPTX', 'XLSX', 'DOC', 'PPT', 'XLS', 'RTF', 'TXT', 'JPG', 'PNG', 'WEBP', 'BMP', 'TIFF', 'SVG', 'HTML']

const ACCEPT = Object.fromEntries(
  Object.entries(SUPPORTED_TYPES).map(([mime, { ext }]) => [mime, [ext]])
)

const STAGES = ['Reading file…', 'Detecting format…', 'Processing document…', 'Generating preview…', 'Almost ready…']

export default function UploadSection({ onFileReady }) {
  const [loading,   setLoading]   = useState(false)
  const [stage,     setStage]     = useState(0)
  const [error,     setError]     = useState('')
  const [preview,   setPreview]   = useState(null) // { thumbnail, name, size, pages, typeInfo }

  const processAndReady = useCallback(async (file) => {
    setError('')
    setPreview(null)
    setLoading(true)
    setStage(0)

    try {
      const typeInfo = resolveFileType(file)
      if (!typeInfo) throw new Error('Unsupported file format.')
      if (file.size > MAX_FILE_SIZE) throw new Error('File exceeds 100 MB limit.')

      setStage(1)
      await tick()
      setStage(2)

      const result = await processFile(file)

      setStage(3)
      await tick()

      const info = {
        file: result.pdfBlob,
        originalFile: result.originalFile || file,
        name: file.name,
        size: formatBytes(file.size),
        totalPages: result.totalPages,
        thumbnail: result.thumbnail,
        typeInfo,
        requiresAgent: result.requiresAgent || false,
      }

      setStage(4)
      setPreview(info)
      setLoading(false)
      onFileReady(info)
    } catch (e) {
      setError(e.message || 'Could not process file.')
      setLoading(false)
    }
  }, [onFileReady])

  const onDrop = useCallback((accepted, rejected) => {
    if (rejected.length > 0) {
      setError('Unsupported file format or file too large (max 100 MB).')
      return
    }
    if (accepted.length > 0) processAndReady(accepted[0])
  }, [processAndReady])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: ACCEPT,
    maxFiles: 1,
    maxSize: MAX_FILE_SIZE,
  })

  return (
    <section className="max-w-2xl mx-auto px-4 py-8">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="text-center mb-8">
        <h2 className="text-3xl font-bold text-[#222222] mb-2">Upload Your Document</h2>
        <p className="text-gray-500 text-sm">Drag & drop or click to select — any format supported</p>
      </motion.div>

      {/* Drop zone */}
      <motion.div
        initial={{ opacity: 0, scale: 0.97 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.1 }}
        {...getRootProps()}
        className={`
          relative border-2 border-dashed rounded-2xl p-10 text-center cursor-pointer transition-all duration-200 bg-white
          ${isDragActive ? 'border-[#F78C25] bg-orange-50' : 'border-orange-200 hover:border-[#F78C25] hover:bg-orange-50'}
        `}
      >
        <input {...getInputProps()} />
        <AnimatePresence mode="wait">
          {loading ? (
            <motion.div key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-4">
              <div className="w-12 h-12 border-2 border-[#F78C25] border-t-transparent rounded-full animate-spin mx-auto" />
              <div>
                <p className="text-[#F78C25] font-medium">{STAGES[stage]}</p>
                <div className="mt-3 w-48 mx-auto h-1.5 bg-orange-100 rounded-full overflow-hidden">
                  <motion.div
                    className="h-full bg-[#F78C25] rounded-full"
                    animate={{ width: `${((stage + 1) / STAGES.length) * 100}%` }}
                    transition={{ duration: 0.4 }}
                  />
                </div>
              </div>
            </motion.div>
          ) : preview ? (
            <motion.div key="preview" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="flex items-center gap-5 text-left"
            >
              {/* Thumbnail */}
              <div className="w-16 h-20 rounded-xl border border-orange-200 bg-orange-50 flex-shrink-0 overflow-hidden flex items-center justify-center">
                {preview.thumbnail
                  ? <img src={preview.thumbnail} alt="preview" className="w-full h-full object-cover" />
                  : <span className="text-3xl">{preview.typeInfo.icon}</span>
                }
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="px-2 py-0.5 rounded-md bg-orange-100 text-[#F78C25] text-xs font-bold">{preview.typeInfo.label}</span>
                  {preview.requiresAgent && (
                    <span className="px-2 py-0.5 rounded-md bg-yellow-100 text-yellow-600 text-xs font-medium">Agent Required</span>
                  )}
                </div>
                <p className="text-[#222222] font-semibold truncate">{preview.name}</p>
                <p className="text-gray-400 text-xs mt-0.5">{preview.size} · {preview.totalPages} page{preview.totalPages !== 1 ? 's' : ''}</p>
              </div>
              <div className="text-right flex-shrink-0">
                <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center">
                  <svg className="w-4 h-4 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <p className="text-gray-400 text-xs mt-1">Ready</p>
              </div>
            </motion.div>
          ) : (
            <motion.div key="idle" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-orange-50 border border-orange-200 flex items-center justify-center">
                <svg className="w-8 h-8 text-[#F78C25]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                    d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
              </div>
              <p className="text-[#222222] font-semibold mb-1">
                {isDragActive ? 'Drop it here!' : 'Drop your file here'}
              </p>
              <p className="text-gray-500 text-sm">or click to browse</p>
              <p className="text-gray-400 text-xs mt-2">Max 100 MB</p>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      {/* Error */}
      <AnimatePresence>
        {error && (
          <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="mt-3 px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-red-500 text-sm text-center"
          >
            ⚠️ {error}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Supported formats strip */}
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }}
        className="mt-5 text-center"
      >
        <p className="text-gray-400 text-xs mb-2 font-medium uppercase tracking-wider">Supported Formats</p>
        <div className="flex flex-wrap justify-center gap-1.5">
          {FORMAT_LABELS.map(fmt => (
            <span key={fmt} className="px-2 py-0.5 rounded-md bg-white border border-orange-100 text-gray-500 text-xs font-medium">
              {fmt}
            </span>
          ))}
        </div>
      </motion.div>
    </section>
  )
}

function tick() { return new Promise(r => setTimeout(r, 120)) }
