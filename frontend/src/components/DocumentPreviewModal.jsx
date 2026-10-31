import { useState, useEffect, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  X,
  ZoomIn,
  ZoomOut,
  Maximize2,
  ChevronLeft,
  ChevronRight,
  RotateCw,
  FileText,
  AlertCircle,
  Loader2,
  Image as ImageIcon,
} from 'lucide-react'
import * as pdfjsLib from 'pdfjs-dist'

export default function DocumentPreviewModal({ file, typeInfo, onClose }) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [zoom, setZoom] = useState(1.0)
  const [fitWidth, setFitWidth] = useState(false)
  const [rotation, setRotation] = useState(0)

  // PDF specific state
  const [pdfDoc, setPdfDoc] = useState(null)
  const [currentPage, setCurrentPage] = useState(1)
  const [numPages, setNumPages] = useState(0)
  const canvasRef = useRef(null)
  const renderTaskRef = useRef(null)

  // Image specific state
  const [imageUrl, setImageUrl] = useState(null)

  // DOCX specific container
  const docxContainerRef = useRef(null)

  const isPdf = typeInfo?.mime === 'application/pdf' || file?.name?.toLowerCase().endsWith('.pdf')
  const isDocx = file?.name?.toLowerCase().endsWith('.docx')
  const isDoc = file?.name?.toLowerCase().endsWith('.doc') && !isDocx
  const isImage = typeInfo?.category === 'image' ||
    ['.jpg', '.jpeg', '.png'].some(ext => file?.name?.toLowerCase().endsWith(ext))

  // ── 1. Document Loader ────────────────────────────────────────────────────────
  useEffect(() => {
    let isCancelled = false
    let createdUrl = null

    async function loadDocument() {
      setLoading(true)
      setError(null)

      try {
        if (!file) throw new Error('No document provided to preview.')

        if (isPdf) {
          const buffer = await file.arrayBuffer()
          if (isCancelled) return

          const loadingTask = pdfjsLib.getDocument({
            data: new Uint8Array(buffer),
            disableFontFace: false,
          })
          const doc = await loadingTask.promise
          if (isCancelled) return

          setPdfDoc(doc)
          setNumPages(doc.numPages)
          setCurrentPage(1)
          setLoading(false)
        } else if (isDocx) {
          // Render DOCX client-side using docx-preview for 100% layout and font fidelity
          const buffer = await file.arrayBuffer()
          if (isCancelled) return

          try {
            const docx = await import('docx-preview')
            if (isCancelled) return

            // Give container a tick to mount
            setTimeout(async () => {
              if (docxContainerRef.current && !isCancelled) {
                docxContainerRef.current.innerHTML = ''
                await docx.renderAsync(buffer, docxContainerRef.current, null, {
                  className: 'docx-preview-content',
                  inWrapper: true,
                  ignoreWidth: false,
                  ignoreHeight: false,
                  breakPages: true,
                  renderHeaders: true,
                  renderFooters: true,
                })
                setLoading(false)
              }
            }, 50)
          } catch (docxErr) {
            console.warn('docx-preview error, attempting server conversion fallback:', docxErr)
            // Fallback: try server preview conversion
            await loadViaServerPreview(file)
          }
        } else if (isDoc) {
          // Binary Word 97-2003: convert via server temporary preview endpoint
          await loadViaServerPreview(file)
        } else if (isImage) {
          createdUrl = URL.createObjectURL(file)
          setImageUrl(createdUrl)
          setLoading(false)
        } else {
          throw new Error('Unsupported format for preview.')
        }
      } catch (err) {
        if (!isCancelled) {
          console.error('[DocumentPreview Error]:', err)
          setError(err.message || 'Failed to render document preview.')
          setLoading(false)
        }
      }
    }

    async function loadViaServerPreview(docFile) {
      try {
        const formData = new FormData()
        formData.append('file', docFile)
        formData.append('action', 'previewDocument')

        const backendUrl = (import.meta.env?.VITE_BACKEND_URL || 'https://xbuddy.onrender.com').replace(/\/$/, '')
        const res = await fetch(`${backendUrl}/api/orders?action=previewDocument`, {
          method: 'POST',
          body: formData,
        })

        if (!res.ok) {
          throw new Error(`Server preview conversion returned HTTP ${res.status}`)
        }

        const pdfBlob = await res.blob()
        if (isCancelled) return

        const buffer = await pdfBlob.arrayBuffer()
        const loadingTask = pdfjsLib.getDocument({
          data: new Uint8Array(buffer),
        })
        const doc = await loadingTask.promise
        if (isCancelled) return

        setPdfDoc(doc)
        setNumPages(doc.numPages)
        setCurrentPage(1)
        setLoading(false)
      } catch (srvErr) {
        throw new Error(
          `High-fidelity preview for ${docFile.name} could not be generated: ${srvErr.message}. The original document is preserved and will be processed natively for printing.`
        )
      }
    }

    loadDocument()

    return () => {
      isCancelled = true
      if (createdUrl) {
        URL.revokeObjectURL(createdUrl)
      }
    }
  }, [file, isPdf, isDocx, isDoc, isImage])

  // ── 2. Render PDF Page to Canvas ──────────────────────────────────────────────
  const renderPdfPage = useCallback(async (pageNum) => {
    if (!pdfDoc || !canvasRef.current) return

    try {
      if (renderTaskRef.current) {
        renderTaskRef.current.cancel()
      }

      const page = await pdfDoc.getPage(pageNum)
      const canvas = canvasRef.current
      if (!canvas) return
      const ctx = canvas.getContext('2d')

      // Device pixel ratio for ultra-crisp text rendering
      const dpr = window.devicePixelRatio || 1
      const initialVp = page.getViewport({ scale: 1.0, rotation })

      let scale = zoom
      if (fitWidth) {
        const containerW = canvas.parentElement?.clientWidth ? (canvas.parentElement.clientWidth - 48) : 800
        scale = containerW / initialVp.width
      }

      const viewport = page.getViewport({ scale: scale * dpr, rotation })

      canvas.width = viewport.width
      canvas.height = viewport.height
      canvas.style.width = `${viewport.width / dpr}px`
      canvas.style.height = `${viewport.height / dpr}px`

      const renderContext = {
        canvasContext: ctx,
        viewport,
      }

      renderTaskRef.current = page.render(renderContext)
      await renderTaskRef.current.promise
    } catch (err) {
      if (err?.name !== 'RenderingCancelledException') {
        console.warn('PDF render error:', err)
      }
    }
  }, [pdfDoc, zoom, fitWidth, rotation])

  useEffect(() => {
    if (pdfDoc && currentPage > 0) {
      renderPdfPage(currentPage)
    }
  }, [pdfDoc, currentPage, zoom, fitWidth, rotation, renderPdfPage])

  // ── 3. Zoom Controls ──────────────────────────────────────────────────────────
  const handleZoomIn = () => {
    setFitWidth(false)
    setZoom(z => Math.min(3.0, Number((z + 0.25).toFixed(2))))
  }

  const handleZoomOut = () => {
    setFitWidth(false)
    setZoom(z => Math.max(0.5, Number((z - 0.25).toFixed(2))))
  }

  const handleFitWidth = () => {
    setFitWidth(f => !f)
  }

  const handleRotate = () => {
    setRotation(r => (r + 90) % 360)
  }

  // ── 4. Keybinding & Cleanup ───────────────────────────────────────────────────
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose()
      if (isPdf && numPages > 1) {
        if (e.key === 'ArrowRight' || e.key === 'PageDown') {
          setCurrentPage(p => Math.min(numPages, p + 1))
        } else if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
          setCurrentPage(p => Math.max(1, p - 1))
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose, isPdf, numPages])

  const formatFileSize = (bytes) => {
    if (!bytes) return ''
    if (bytes < 1024) return bytes + ' B'
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
    return (bytes / (1024 * 1024)).toFixed(2) + ' MB'
  }

  const fileExt = (file?.name?.split('.').pop() || '').toUpperCase()

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/75 backdrop-blur-sm animate-fade-in">
        {/* Click outside to close backdrop */}
        <div className="absolute inset-0" onClick={onClose} />

        {/* Modal Window */}
        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 10 }}
          transition={{ duration: 0.2 }}
          className="relative w-full max-w-5xl h-[92vh] flex flex-col bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl overflow-hidden z-10"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 sm:px-6 py-3.5 bg-slate-800/90 border-b border-slate-700 flex-shrink-0">
            {/* Document Info */}
            <div className="flex items-center gap-3 min-w-0 pr-2">
              <div className="w-9 h-9 rounded-lg bg-orange-500/15 border border-orange-500/30 flex items-center justify-center flex-shrink-0">
                {isImage ? (
                  <ImageIcon className="w-5 h-5 text-orange-400" />
                ) : (
                  <FileText className="w-5 h-5 text-orange-400" />
                )}
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="text-white font-medium text-sm sm:text-base truncate max-w-xs sm:max-w-md">
                    {file?.name || 'Document Preview'}
                  </h3>
                  <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-orange-500/20 text-orange-400 border border-orange-500/30">
                    {fileExt}
                  </span>
                </div>
                <p className="text-slate-400 text-xs">
                  {formatFileSize(file?.size)}
                  {numPages > 0 ? ` · ${numPages} ${numPages === 1 ? 'page' : 'pages'}` : ''}
                </p>
              </div>
            </div>

            {/* Viewer Controls */}
            <div className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0">
              {/* Zoom Controls */}
              <div className="flex items-center bg-slate-700/70 rounded-lg p-0.5 border border-slate-600/60">
                <button
                  type="button"
                  onClick={handleZoomOut}
                  title="Zoom Out"
                  aria-label="Zoom Out"
                  className="p-1.5 text-slate-300 hover:text-white hover:bg-slate-600/70 rounded transition"
                >
                  <ZoomOut className="w-4 h-4" />
                </button>
                <span className="px-2 text-xs font-mono text-slate-300 min-w-[44px] text-center">
                  {fitWidth ? 'FIT' : `${Math.round(zoom * 100)}%`}
                </span>
                <button
                  type="button"
                  onClick={handleZoomIn}
                  title="Zoom In"
                  aria-label="Zoom In"
                  className="p-1.5 text-slate-300 hover:text-white hover:bg-slate-600/70 rounded transition"
                >
                  <ZoomIn className="w-4 h-4" />
                </button>
              </div>

              {/* Fit Width Toggle */}
              {isPdf && (
                <button
                  type="button"
                  onClick={handleFitWidth}
                  title={fitWidth ? 'Reset Zoom' : 'Fit to Width'}
                  className={`p-2 rounded-lg border transition ${
                    fitWidth
                      ? 'bg-orange-500/20 text-orange-400 border-orange-500/40'
                      : 'bg-slate-700/70 text-slate-300 hover:text-white border-slate-600/60'
                  }`}
                >
                  <Maximize2 className="w-4 h-4" />
                </button>
              )}

              {/* Rotate (PDF / Image) */}
              {(isPdf || isImage) && (
                <button
                  type="button"
                  onClick={handleRotate}
                  title="Rotate 90°"
                  aria-label="Rotate 90°"
                  className="p-2 text-slate-300 hover:text-white bg-slate-700/70 border border-slate-600/60 rounded-lg transition"
                >
                  <RotateCw className="w-4 h-4" />
                </button>
              )}

              {/* Close Button */}
              <button
                type="button"
                onClick={onClose}
                title="Close Preview (Esc)"
                aria-label="Close Preview"
                className="p-2 ml-1 text-slate-400 hover:text-white hover:bg-red-500/20 hover:border-red-500/40 border border-transparent rounded-lg transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Body Viewer Canvas */}
          <div className="flex-1 overflow-auto bg-slate-950 p-4 flex items-center justify-center relative">
            {loading && (
              <div className="flex flex-col items-center gap-3 text-slate-400">
                <Loader2 className="w-8 h-8 animate-spin text-orange-500" />
                <p className="text-sm">Rendering high-fidelity document preview…</p>
              </div>
            )}

            {error && (
              <div className="max-w-md p-6 bg-slate-900 border border-red-500/30 rounded-xl text-center space-y-3">
                <div className="w-12 h-12 rounded-full bg-red-500/10 text-red-400 flex items-center justify-center mx-auto">
                  <AlertCircle className="w-6 h-6" />
                </div>
                <h4 className="text-white font-medium text-base">Preview Unavailable</h4>
                <p className="text-slate-400 text-xs leading-relaxed">{error}</p>
                <p className="text-xs text-orange-400/90 bg-orange-500/10 p-2.5 rounded-lg border border-orange-500/20">
                  Your authentic file is safely preserved and will print accurately through the XBuddy Print Station.
                </p>
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-xs font-medium transition"
                >
                  Close Preview
                </button>
              </div>
            )}

            {/* PDF Canvas View */}
            {!loading && !error && isPdf && (
              <div className="flex flex-col items-center justify-center my-auto">
                <div className="bg-white rounded shadow-2xl overflow-hidden border border-slate-700/60">
                  <canvas ref={canvasRef} className="block max-w-full h-auto transition-transform duration-150" />
                </div>
              </div>
            )}

            {/* Image View */}
            {!loading && !error && isImage && imageUrl && (
              <div className="flex items-center justify-center w-full h-full p-4 overflow-auto">
                <img
                  src={imageUrl}
                  alt={file?.name || 'Document image'}
                  style={{
                    transform: `scale(${zoom}) rotate(${rotation}deg)`,
                    transformOrigin: 'center center',
                    transition: 'transform 0.15s ease-out',
                  }}
                  className="max-h-[80vh] max-w-full object-contain rounded-lg shadow-2xl"
                />
              </div>
            )}

            {/* DOCX HTML Container */}
            {!error && isDocx && (
              <div
                className="w-full h-full overflow-auto bg-slate-900/60 p-4 flex justify-center"
                style={{
                  transform: `scale(${zoom})`,
                  transformOrigin: 'top center',
                  transition: 'transform 0.15s ease-out',
                }}
              >
                <div
                  ref={docxContainerRef}
                  className="docx-preview-container bg-white text-black p-8 rounded shadow-2xl max-w-4xl min-h-[600px] w-full"
                />
              </div>
            )}
          </div>

          {/* Footer Page Navigation (For Multi-page PDFs) */}
          {!loading && !error && isPdf && numPages > 1 && (
            <div className="flex items-center justify-between px-6 py-2.5 bg-slate-800/95 border-t border-slate-700 flex-shrink-0">
              <button
                type="button"
                disabled={currentPage <= 1}
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-300 hover:text-white bg-slate-700/60 hover:bg-slate-700 rounded-lg disabled:opacity-40 disabled:cursor-not-allowed transition"
              >
                <ChevronLeft className="w-4 h-4" />
                Previous Page
              </button>

              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-400">Page</span>
                <input
                  type="number"
                  min={1}
                  max={numPages}
                  value={currentPage}
                  onChange={(e) => {
                    const p = parseInt(e.target.value, 10)
                    if (!isNaN(p) && p >= 1 && p <= numPages) {
                      setCurrentPage(p)
                    }
                  }}
                  className="w-12 px-1.5 py-1 text-center bg-slate-900 border border-slate-600 rounded text-xs text-white font-mono focus:outline-none focus:border-orange-500"
                />
                <span className="text-xs text-slate-400">of {numPages}</span>
              </div>

              <button
                type="button"
                disabled={currentPage >= numPages}
                onClick={() => setCurrentPage(p => Math.min(numPages, p + 1))}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-300 hover:text-white bg-slate-700/60 hover:bg-slate-700 rounded-lg disabled:opacity-40 disabled:cursor-not-allowed transition"
              >
                Next Page
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </motion.div>
      </div>
    </AnimatePresence>
  )
}
