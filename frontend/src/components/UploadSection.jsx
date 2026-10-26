import { useCallback, useState } from 'react'
import { useDropzone } from 'react-dropzone'
import { motion, AnimatePresence } from 'framer-motion'
import { AlertTriangle } from 'lucide-react'
import FileTypeIcon from './FileTypeIcon'
import { processFile, resolveFileType, formatBytes, SUPPORTED_TYPES, MAX_FILE_SIZE } from '../utils/fileProcessor'
import { useLanguage } from '../i18n/LanguageContext'

const FORMAT_LABELS = ['PDF', 'DOCX', 'PPTX', 'XLSX', 'DOC', 'PPT', 'XLS', 'RTF', 'TXT', 'JPG', 'PNG', 'WEBP', 'BMP', 'TIFF', 'SVG', 'HTML']

const ACCEPT = Object.fromEntries(
  Object.entries(SUPPORTED_TYPES).map(([mime, { ext }]) => [mime, [ext]])
)

export default function UploadSection({ onFileReady }) {
  const { t } = useLanguage()
  const [loading,   setLoading]   = useState(false)
  const [stage,     setStage]     = useState(0)
  const [error,     setError]     = useState('')
  const [preview,   setPreview]   = useState(null) // { thumbnail, name, size, pages, typeInfo }

  const stageLabels = [
    t('upload.stagesReading', 'Reading file…'),
    t('upload.stagesDetecting', 'Detecting format…'),
    t('upload.stagesProcessing', 'Processing document…'),
    t('upload.stagesGenerating', 'Generating preview…'),
    t('upload.stagesAlmost', 'Almost ready…'),
  ]

  const processAndReady = useCallback(async (file) => {
    setError('')
    setPreview(null)
    setLoading(true)
    setStage(0)

    try {
      const typeInfo = resolveFileType(file)
      if (!typeInfo) throw new Error(t('upload.unsupportedError', 'Unsupported file format.'))
      if (file.size > MAX_FILE_SIZE) throw new Error(t('upload.sizeError', 'File exceeds 100 MB limit.'))

      setStage(1)
      await tick()
      setStage(2)

      const result = await processFile(file)

      setStage(3)
      await tick()

      const info = {
        file: result.originalFile || result.pdfBlob || file,
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
      setError(e.message || t('upload.genericError', 'Could not process file.'))
      setLoading(false)
    }
  }, [onFileReady, t])

  const onDrop = useCallback((accepted, rejected) => {
    if (rejected.length > 0) {
      setError(t('upload.rejectedError', 'Unsupported file format or file too large (max 100 MB).'))
      return
    }
    if (accepted.length > 0) processAndReady(accepted[0])
  }, [processAndReady, t])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: ACCEPT,
    maxFiles: 1,
    maxSize: MAX_FILE_SIZE,
  })

  return (
    <section className="max-w-2xl mx-auto px-4 py-8">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="text-center mb-8">
        <h2 className="text-3xl font-bold text-[#222222] mb-2">{t('upload.title', 'Upload Your Document')}</h2>
        <p className="text-gray-500 text-sm">{t('upload.subtitle', 'Drag & drop or click to select — any format supported')}</p>
      </motion.div>

      {/* Drop zone */}
      <motion.div
        id="tour-upload-area"
        data-tour="upload-area"
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
                <p className="text-[#F78C25] font-medium">{stageLabels[stage] || stageLabels[0]}</p>
                <div className="mt-3 w-48 mx-auto h-1.5 bg-orange-100 rounded-full overflow-hidden">
                  <motion.div
                    className="h-full bg-[#F78C25] rounded-full"
                    animate={{ width: `${((stage + 1) / stageLabels.length) * 100}%` }}
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
                  : <FileTypeIcon typeInfo={preview.typeInfo} className="w-8 h-8 text-[#F78C25]" />
                }
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="px-2 py-0.5 rounded-md bg-orange-100 text-[#F78C25] text-xs font-bold">{preview.typeInfo.label}</span>
                  {preview.requiresAgent && (
                    <span className="px-2 py-0.5 rounded-md bg-yellow-100 text-yellow-600 text-xs font-medium">{t('upload.agentRequired', 'Agent Required')}</span>
                  )}
                </div>
                <p className="text-[#222222] font-semibold truncate">{preview.name}</p>
                <p className="text-gray-400 text-xs mt-0.5">{preview.size} · {preview.totalPages} {preview.totalPages !== 1 ? t('common.pages', 'pages') : t('common.page', 'page')}</p>
              </div>
              <div className="text-right flex-shrink-0">
                <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center">
                  <svg className="w-4 h-4 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <p className="text-gray-400 text-xs mt-1">{t('upload.ready', 'Ready')}</p>
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
                {isDragActive ? t('upload.dropHere', 'Drop it here!') : t('upload.dropPrompt', 'Drop your file here')}
              </p>
              <p className="text-gray-500 text-sm">{t('upload.clickToBrowse', 'or click to browse')}</p>
              <p className="text-gray-400 text-xs mt-2">{t('upload.maxSize', 'Max 100 MB')}</p>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      {/* Error */}
      <AnimatePresence>
        {error && (
          <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="mt-3 px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-red-500 text-sm text-center flex items-center justify-center gap-1.5"
          >
            <AlertTriangle className="w-4 h-4 text-red-500 shrink-0" />
            <span>{error}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Supported formats strip */}
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }}
        className="mt-5 text-center"
      >
        <p className="text-gray-400 text-xs mb-2 font-medium uppercase tracking-wider">{t('upload.supportedFormats', 'Supported Formats')}</p>
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
