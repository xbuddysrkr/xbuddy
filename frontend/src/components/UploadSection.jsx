import { useCallback, useState } from 'react'
import { useDropzone } from 'react-dropzone'
import { motion, AnimatePresence } from 'framer-motion'
import { AlertTriangle, Eye, RefreshCw, Trash2, CheckCircle2 } from 'lucide-react'
import FileTypeIcon from './FileTypeIcon'
import DocumentPreviewModal from './DocumentPreviewModal'
import { processFile, resolveFileType, formatBytes, SUPPORTED_TYPES, MAX_FILE_SIZE } from '../utils/fileProcessor'
import { useLanguage } from '../i18n/LanguageContext'

const FORMAT_LABELS = ['PDF', 'DOCX', 'DOC', 'JPG', 'PNG']

const ACCEPT = {
  'application/pdf': ['.pdf'],
  'application/msword': ['.doc'],
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/png': ['.png'],
}

export default function UploadSection({ onFileReady }) {
  const { t } = useLanguage()
  const [loading, setLoading] = useState(false)
  const [stage, setStage] = useState(0)
  const [error, setError] = useState('')
  const [preview, setPreview] = useState(null) // { file, originalFile, thumbnail, name, size, totalPages, typeInfo, requiresAgent }
  const [showPreviewModal, setShowPreviewModal] = useState(false)

  const stageLabels = [
    t('upload.stagesReading', 'Reading file…'),
    t('upload.stagesDetecting', 'Detecting format…'),
    t('upload.stagesProcessing', 'Processing document…'),
    t('upload.stagesGenerating', 'Generating preview…'),
    t('upload.stagesAlmost', 'Almost ready…'),
  ]

  const processAndReady = useCallback(async (file) => {
    setError('')
    setLoading(true)
    setStage(0)

    try {
      const typeInfo = resolveFileType(file)
      if (!typeInfo) {
        throw new Error(t('upload.unsupportedError', 'Unsupported format. Only PDF, Word (.doc, .docx), and Image (.jpg, .png) files are accepted.'))
      }
      if (file.size > MAX_FILE_SIZE) {
        throw new Error(t('upload.sizeError', 'File exceeds 100 MB limit.'))
      }

      setStage(1)
      await tick()
      setStage(2)

      const result = await processFile(file)

      setStage(3)
      await tick()

      // Preserve authentic original file bytes, name, and MIME type
      const originalFile = result.originalFile || file
      const info = {
        file: originalFile,
        originalFile,
        name: file.name,
        size: formatBytes(file.size),
        totalPages: result.totalPages || 1,
        thumbnail: result.thumbnail || null,
        typeInfo,
        requiresAgent: result.requiresAgent || false,
      }

      setStage(4)
      setPreview(info)
      setLoading(false)
      onFileReady?.(info)
    } catch (e) {
      setError(e.message || t('upload.genericError', 'Could not process file.'))
      setLoading(false)
    }
  }, [onFileReady, t])

  const onDrop = useCallback((accepted, rejected) => {
    if (rejected.length > 0) {
      setError(t('upload.rejectedError', 'Unsupported file format or file exceeds 100 MB. Accepted formats: PDF, DOC, DOCX, JPG, PNG.'))
      return
    }
    if (accepted.length > 0) {
      processAndReady(accepted[0])
    }
  }, [processAndReady, t])

  const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
    onDrop,
    accept: ACCEPT,
    maxFiles: 1,
    maxSize: MAX_FILE_SIZE,
    noClick: Boolean(preview), // Don't trigger file picker on clicking preview controls
  })

  const handleRemoveFile = (e) => {
    e?.stopPropagation()
    setPreview(null)
    setError('')
    onFileReady?.(null)
  }

  const handleReplaceFile = (e) => {
    e?.stopPropagation()
    open()
  }

  const handlePreviewClick = (e) => {
    e?.stopPropagation()
    setShowPreviewModal(true)
  }

  const fileExt = (preview?.name?.split('.').pop() || preview?.typeInfo?.label || 'FILE').toUpperCase()

  return (
    <section className="max-w-2xl mx-auto px-4 py-8">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="text-center mb-8">
        <h2 className="text-3xl font-bold text-[#222222] mb-2">{t('upload.title', 'Upload Your Document')}</h2>
        <p className="text-gray-500 text-sm">{t('upload.subtitle', 'PDF, Word (.doc, .docx), and Image (.jpg, .png) files accepted')}</p>
      </motion.div>

      {/* Main Upload / File Area */}
      <motion.div
        id="tour-upload-area"
        data-tour="upload-area"
        initial={{ opacity: 0, scale: 0.97 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.1 }}
        {...getRootProps()}
        className={`
          relative border-2 border-dashed rounded-2xl p-6 sm:p-8 text-center transition-all duration-200 bg-white
          ${isDragActive ? 'border-[#F78C25] bg-orange-50' : 'border-orange-200 hover:border-[#F78C25]'}
          ${!preview ? 'cursor-pointer hover:bg-orange-50/50' : ''}
        `}
      >
        <input {...getInputProps()} />

        <AnimatePresence mode="wait">
          {loading ? (
            <motion.div key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-4 py-6">
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
            <motion.div
              key="preview"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="text-left space-y-5"
            >
              {/* File Info Row */}
              <div className="flex items-start sm:items-center justify-between gap-4">
                <div className="flex items-center gap-4 min-w-0">
                  <div className="w-14 h-16 rounded-xl border border-orange-200 bg-orange-50 flex-shrink-0 overflow-hidden flex items-center justify-center shadow-inner">
                    {preview.thumbnail ? (
                      <img src={preview.thumbnail} alt="preview thumbnail" className="w-full h-full object-cover" />
                    ) : (
                      <FileTypeIcon typeInfo={preview.typeInfo} className="w-8 h-8 text-[#F78C25]" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="px-2.5 py-0.5 rounded-md bg-orange-100 text-[#F78C25] text-xs font-bold tracking-wide">
                        {fileExt}
                      </span>
                      <span className="text-gray-400 text-xs font-medium">
                        {preview.size}
                      </span>
                    </div>
                    <p className="text-[#222222] font-semibold text-base truncate max-w-xs sm:max-w-md" title={preview.name}>
                      {preview.name}
                    </p>
                    <p className="text-gray-400 text-xs mt-0.5">
                      {preview.totalPages} {preview.totalPages !== 1 ? t('common.pages', 'pages') : t('common.page', 'page')}
                    </p>
                  </div>
                </div>

                {/* Ready Status */}
                <div className="hidden sm:flex items-center gap-1.5 px-3 py-1 rounded-full bg-green-50 border border-green-200 text-green-700 text-xs font-medium flex-shrink-0">
                  <CheckCircle2 className="w-3.5 h-3.5 text-green-600" />
                  <span>{t('upload.ready', 'Ready')}</span>
                </div>
              </div>

              {/* Action Buttons: Preview Document (Prominent), Replace File, Remove File */}
              <div className="flex flex-wrap items-center justify-between gap-2.5 pt-3 border-t border-orange-100">
                <button
                  type="button"
                  onClick={handlePreviewClick}
                  id="btn-preview-document"
                  className="flex-1 sm:flex-none inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-[#F78C25] hover:bg-[#e07b1c] text-white rounded-xl font-semibold text-sm shadow-md hover:shadow-lg transition-all active:scale-95"
                >
                  <Eye className="w-4 h-4" />
                  <span>{t('upload.previewDocument', 'Preview Document')}</span>
                </button>

                <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                  <button
                    type="button"
                    onClick={handleReplaceFile}
                    id="btn-replace-file"
                    className="flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 px-3.5 py-2 text-xs font-medium text-gray-700 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-xl transition active:scale-95"
                  >
                    <RefreshCw className="w-3.5 h-3.5 text-gray-500" />
                    <span>{t('upload.replaceFile', 'Replace File')}</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleRemoveFile}
                    id="btn-remove-file"
                    className="flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 px-3.5 py-2 text-xs font-medium text-red-600 bg-red-50 hover:bg-red-100 border border-red-200 rounded-xl transition active:scale-95"
                  >
                    <Trash2 className="w-3.5 h-3.5 text-red-500" />
                    <span>{t('upload.removeFile', 'Remove File')}</span>
                  </button>
                </div>
              </div>
            </motion.div>
          ) : (
            <motion.div key="idle" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="py-4">
              <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-orange-50 border border-orange-200 flex items-center justify-center">
                <svg className="w-8 h-8 text-[#F78C25]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                    d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
              </div>
              <p className="text-[#222222] font-semibold mb-1">
                {isDragActive ? t('upload.dropHere', 'Drop it here!') : t('upload.dropPrompt', 'Drop your document here')}
              </p>
              <p className="text-gray-500 text-sm">{t('upload.clickToBrowse', 'or click to browse')}</p>
              <p className="text-gray-400 text-xs mt-2">{t('upload.maxSize', 'PDF, Word (.doc, .docx), Images (.jpg, .png) · Max 100 MB')}</p>
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
            <span key={fmt} className="px-2.5 py-1 rounded-md bg-white border border-orange-200 text-gray-700 text-xs font-semibold shadow-xs">
              {fmt}
            </span>
          ))}
        </div>
      </motion.div>

      {/* Modal Preview */}
      {showPreviewModal && preview && (
        <DocumentPreviewModal
          file={preview.originalFile || preview.file}
          typeInfo={preview.typeInfo}
          onClose={() => setShowPreviewModal(false)}
        />
      )}
    </section>
  )
}

function tick() { return new Promise(r => setTimeout(r, 120)) }
