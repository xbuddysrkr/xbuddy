import { useState, useRef, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { AlertTriangle, Check } from 'lucide-react'
import { fileToBase64 } from '../utils/fileToBase64'
import { submitOrder, submitReprintPayment } from '../utils/api'
import { saveOrder } from '../utils/orderStore'
import OrderProgress from './OrderProgress'

const inputCls = 'w-full bg-[#FAFAFA] border border-orange-200 rounded-xl px-4 py-2.5 text-[#222222] text-sm placeholder:text-gray-400 focus:outline-none focus:border-[#F78C25] focus:ring-1 focus:ring-orange-200 transition-all'

const PENDING_STATUSES = { upload_file: 'pending', save_order: 'pending', confirmed: 'pending' }

export default function PaymentProofForm({ orderMeta, onSuccess, onClose }) {
  const [phone,         setPhone]         = useState('')
  const [transactionId, setTransactionId] = useState('')
  const [fieldError,    setFieldError]    = useState('')

  // Progress state
  const [processing,      setProcessing]      = useState(false)
  const [submissionPhase, setSubmissionPhase] = useState('idle') // 'idle' | 'preparing' | 'uploading' | 'saving' | 'reconciling' | 'confirmed' | 'failed'
  const [uploadProgress,  setUploadProgress]  = useState({ percent: 0, loaded: 0, total: 0 })
  const [stepStatuses,    setStepStatuses]    = useState(PENDING_STATUSES)
  const [failedStep,      setFailedStep]      = useState(null)   // step id
  const [errorReason,     setErrorReason]     = useState('')
  const [result,          setResult]          = useState(null)   // { orderId, message }

  // Cached base64 values and orderId so retry can skip re-encoding and reuse order ID idempotently
  const cachedRef = useRef({ pdfBase64: null, orderId: null })

  // beforeunload guard while processing
  useEffect(() => {
    if (!processing) return
    const handler = (e) => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [processing])

  function setStep(id, status) {
    setStepStatuses(prev => ({ ...prev, [id]: status }))
  }

  // Core submission logic — retryFromStep lets us resume from a failed step
  const runSubmit = useCallback(async (retryFromStep = null) => {
    setProcessing(true)
    setFailedStep(null)
    setErrorReason('')
    setSubmissionPhase('preparing')
    setUploadProgress({ percent: 0, loaded: 0, total: 0 })

    const cache = cachedRef.current

    try {
      // ── Step: upload_file (encode PDF file) ──────────────────────────────
      if (!retryFromStep || retryFromStep === 'upload_file') {
        setStep('upload_file', 'active')
        if (orderMeta?.isReprint) {
          // Document PDF is already stored durably in MongoDB Atlas GridFS; skip re-encoding
          setStep('upload_file', 'done')
        } else if (orderMeta?.pdfFile) {
          // Fast binary validation: check %PDF- header in first 5 bytes (< 1ms) without blocking
          try {
            const headerSlice = await orderMeta.pdfFile.slice(0, 5).arrayBuffer()
            const headerStr = String.fromCharCode(...new Uint8Array(headerSlice))
            if (headerStr !== '%PDF-') {
              throw new Error('Selected file is not a valid PDF document (missing %PDF- header)')
            }
          } catch (err) {
            throw { step: 'upload_file', reason: err.message || 'Invalid PDF header' }
          }
          setStep('upload_file', 'active')
        } else {
          try {
            if (!cache.pdfBase64) {
              const b64 = await fileToBase64(orderMeta.pdfFile)
              if (!b64 || b64.length < 50 || (!b64.startsWith('JVBERi0') && !b64.slice(0, 10).includes('JVBE'))) {
                throw new Error('Selected file is not a valid PDF document (missing %PDF- header)')
              }
              cache.pdfBase64 = b64
            }
          } catch (err) {
            throw { step: 'upload_file', reason: err.message || 'Failed to read file' }
          }
          setStep('upload_file', 'active')
        }
      }

      setSubmissionPhase('uploading')

      if (orderMeta?.isReprint) {
        setStep('save_order', 'active')
        setSubmissionPhase('saving')
        const res = await submitReprintPayment({
          orderId:       orderMeta.orderId,
          attemptId:     orderMeta.attemptId,
          transactionId: transactionId.trim(),
          phone:         phone.trim(),
        })

        if (!res?.success) {
          throw { step: 'save_order', reason: res?.error || 'Reprint payment processing failed' }
        }

        setStep('save_order', 'done')
        setStep('confirmed', 'done')
        setSubmissionPhase('confirmed')
        setResult({ orderId: orderMeta.orderId, message: res.message || 'Reprint payment confirmed. Document queued for printing.' })
        onSuccess(orderMeta.orderId, res)
        return
      }

      // Generate or reuse deterministic client orderId for idempotency
      if (!cache.orderId) {
        cache.orderId = 'XB' + String(Math.floor(1000 + Math.random() * 9000))
      }

      const res = await submitOrder(
        {
          orderId:              cache.orderId,
          name:                 phone.trim(),
          fileName:             orderMeta.fileName,
          totalPages:           orderMeta.totalPages,
          printableCount:       orderMeta.printableCount || orderMeta.totalPages,
          copies:               orderMeta.copies,
          colorMode:            orderMeta.colorMode || (orderMeta.printType === 'Color' ? 'color' : 'bw'),
          printType:            orderMeta.printType,
          printSide:            orderMeta.printSide,
          duplex:               orderMeta.duplex,
          pageSize:             orderMeta.pageSize,
          paperSize:            orderMeta.paperSize || orderMeta.pageSize,
          orientation:          orderMeta.orientation,
          pageRange:            orderMeta.pageRange,
          pageRangeMode:        orderMeta.pageRangeMode,
          customPages:          orderMeta.customPages,
          selectedPages:        orderMeta.selectedPages || [],
          selectedPageCount:    orderMeta.selectedPageCount || (orderMeta.selectedPages ? orderMeta.selectedPages.length : 0),
          printingCost:         orderMeta.printingCost || 0,
          digitalProcessingFee: orderMeta.digitalProcessingFee || orderMeta.serviceFee || 0,
          serviceFee:           orderMeta.digitalProcessingFee || orderMeta.serviceFee || 0,
          amount:               orderMeta.amount,
          transactionId:        transactionId.trim(),
          screenshotBase64:     '',
          pdfFile:              orderMeta.pdfFile,
          pdfBase64:            cache.pdfBase64,
        },
        {
          onStep: (stepId) => {
            if (stepId === 'save_order') {
              setSubmissionPhase('saving')
              setStep('upload_file', 'done')
              setStep('save_order', 'active')
            } else if (stepId === 'reconciling') {
              setSubmissionPhase('reconciling')
              setStep('upload_file', 'done')
              setStep('save_order', 'active')
            }
          },
          onUploadProgress: (progress) => {
            setUploadProgress(progress)
            if (progress.serverProcessing || progress.percent >= 100) {
              setSubmissionPhase('saving')
              setStep('upload_file', 'done')
              setStep('save_order', 'active')
            } else {
              setSubmissionPhase('uploading')
              setStep('upload_file', 'active')
            }
          },
        }
      )

      // Verified saved to MongoDB Atlas: mark save_order and confirmed done
      setSubmissionPhase('confirmed')
      setStep('save_order', 'done')
      setStep('confirmed', 'done')
      setResult({ orderId: res.orderId, message: res.message })
      if (res?.orderId) {
        saveOrder({
          orderId:              res.orderId,
          fileName:             orderMeta?.fileName,
          totalPages:           orderMeta?.totalPages,
          printableCount:       orderMeta?.printableCount || orderMeta?.selectedPageCount || orderMeta?.totalPages,
          copies:               orderMeta?.copies,
          colorMode:            orderMeta?.colorMode || (orderMeta?.printType === 'Color' ? 'color' : 'bw'),
          printType:            orderMeta?.printType,
          printSide:            orderMeta?.printSide,
          duplex:               orderMeta?.duplex,
          pageSize:             orderMeta?.pageSize,
          paperSize:            orderMeta?.paperSize || orderMeta?.pageSize,
          orientation:          orderMeta?.orientation,
          pageRange:            orderMeta?.pageRange,
          pageRangeMode:        orderMeta?.pageRangeMode,
          customPages:          orderMeta?.customPages,
          selectedPages:        orderMeta?.selectedPages || [],
          selectedPageCount:    orderMeta?.selectedPageCount || (orderMeta?.selectedPages ? orderMeta?.selectedPages.length : 0),
          printingCost:         orderMeta?.printingCost || 0,
          digitalProcessingFee: orderMeta?.digitalProcessingFee || orderMeta?.serviceFee || 0,
          serviceFee:           orderMeta?.digitalProcessingFee || orderMeta?.serviceFee || 0,
          amount:               orderMeta?.amount,
          phone:                phone.trim(),
          savedAt:              Date.now(),
        })
      }
      onSuccess(res.orderId)

    } catch (err) {
      setSubmissionPhase('failed')
      const stepId = err?.step || 'save_order'
      const reason = err?.reason || err?.message || 'Unknown Error'
      setStep(stepId, 'error')
      setFailedStep(stepId)
      setErrorReason(reason)
    } finally {
      setProcessing(false)
    }
  }, [phone, transactionId, orderMeta, onSuccess])

  function handleSubmit(e) {
    e.preventDefault()
    if (!phone.trim())         return setFieldError('Please enter your phone number.')
    if (!transactionId.trim()) return setFieldError('Please enter the Transaction ID.')
    if (transactionId.trim().length < 6) return setFieldError('Transaction ID must be at least 6 characters.')
    if (orderMeta?.isReprint) {
      const origTx = String(orderMeta.originalTransactionId || '').trim().toUpperCase()
      if (origTx && transactionId.trim().toUpperCase() === origTx) {
        return setFieldError('Cannot reuse the original order transaction ID. Every reprint requires a new payment and transaction reference.')
      }
    }
    setStepStatuses(PENDING_STATUSES)
    runSubmit(null)
  }

  function handleRetry() {
    // Reset only the failed step and everything after it, keep earlier done steps
    const stepsList = ['upload_file', 'save_order', 'confirmed']
    const failIdx = stepsList.indexOf(failedStep)
    setStepStatuses(prev => {
      const next = { ...prev }
      stepsList.forEach((id, i) => {
        if (i >= failIdx) next[id] = 'pending'
      })
      return next
    })
    setFailedStep(null)
    setErrorReason('')
    setSubmissionPhase('idle')
    runSubmit(failedStep)
  }

  function handleCancel() {
    setProcessing(false)
    setStepStatuses(PENDING_STATUSES)
    setFailedStep(null)
    setErrorReason('')
    setSubmissionPhase('idle')
    setUploadProgress({ percent: 0, loaded: 0, total: 0 })
  }

  const showProgress = processing || failedStep || result

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mt-4 border-t border-orange-100 pt-4">
      <h4 className="text-[#222222] font-semibold mb-4 text-sm">
        {orderMeta?.isReprint ? 'Confirm Reprint Payment' : 'Confirm Your Payment'}
      </h4>

      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <label className="text-gray-500 text-xs mb-1 block">Phone Number</label>
          <input
            type="tel" value={phone}
            onChange={(e) => { setPhone(e.target.value); setFieldError('') }}
            placeholder="Enter your phone number"
            className={inputCls}
            disabled={processing}
          />
        </div>

        <div>
          <label className="text-gray-500 text-xs mb-1 block">UPI Transaction ID</label>
          <input
            type="text" value={transactionId}
            onChange={(e) => { setTransactionId(e.target.value); setFieldError('') }}
            placeholder="e.g. 4358XXXXXXXX"
            className={inputCls + ' font-mono'}
            disabled={processing}
          />
        </div>

        <AnimatePresence>
          {fieldError && (
            <motion.p initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              className="text-amber-600 text-xs bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 flex items-center gap-1.5"
            >
              <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
              <span>{fieldError}</span>
            </motion.p>
          )}
        </AnimatePresence>

        {/* Progress card — shown only while processing or after terminal state */}
        <AnimatePresence>
          {showProgress && (
            <OrderProgress
              stepStatuses={stepStatuses}
              failedStep={failedStep}
              errorReason={errorReason}
              result={result}
              submissionPhase={submissionPhase}
              uploadProgress={uploadProgress}
              onRetry={handleRetry}
              onCancel={handleCancel}
            />
          )}
        </AnimatePresence>

        {/* Submit button — hidden once progress card takes over */}
        {!showProgress && (
          <motion.button
            type="submit"
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.97 }}
            className="w-full py-3 bg-[#F78C25] hover:bg-[#e07010] text-white font-bold text-sm rounded-xl transition-all duration-200 flex items-center justify-center gap-1.5"
          >
            <Check className="w-4 h-4" />
            <span>{orderMeta?.isReprint ? 'Confirm & Pay for Reprint' : 'Confirm & Submit Order'}</span>
          </motion.button>
        )}
      </form>
    </motion.div>
  )
}
