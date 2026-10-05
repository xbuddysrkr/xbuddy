import { useState, useRef, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { fileToBase64 } from '../utils/fileToBase64'
import { submitOrder } from '../utils/api'
import { saveOrder } from '../utils/orderStore'
import OrderProgress from './OrderProgress'

const inputCls = 'w-full bg-[#FAFAFA] border border-orange-200 rounded-xl px-4 py-2.5 text-[#222222] text-sm placeholder:text-gray-400 focus:outline-none focus:border-[#F78C25] focus:ring-1 focus:ring-orange-200 transition-all'

const PENDING_STATUSES = { upload_file: 'pending', save_order: 'pending', print_agent: 'pending', confirmed: 'pending' }

export default function PaymentProofForm({ orderMeta, onSuccess, onClose }) {
  const [phone,         setPhone]         = useState('')
  const [transactionId, setTransactionId] = useState('')
  const [screenshot,    setScreenshot]    = useState(null)
  const [preview,       setPreview]       = useState(null)
  const [fieldError,    setFieldError]    = useState('')

  // Progress state
  const [processing,    setProcessing]    = useState(false)
  const [stepStatuses,  setStepStatuses]  = useState(PENDING_STATUSES)
  const [failedStep,    setFailedStep]    = useState(null)   // step id
  const [errorReason,   setErrorReason]   = useState('')
  const [result,        setResult]        = useState(null)   // { orderId, message }

  // Cached base64 values so retry can skip re-encoding
  const cachedRef = useRef({ screenshotBase64: null, pdfBase64: null })

  const fileInputRef = useRef()

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

  function handleScreenshot(file) {
    if (!file) return
    if (!file.type.startsWith('image/')) { setFieldError('Please upload an image file (JPG, PNG, etc.)'); return }
    setScreenshot(file)
    setPreview(URL.createObjectURL(file))
    cachedRef.current.screenshotBase64 = null  // invalidate cache on new file
    setFieldError('')
  }

  // Core submission logic — retryFromStep lets us resume from a failed step
  const runSubmit = useCallback(async (retryFromStep = null) => {
    setProcessing(true)
    setFailedStep(null)
    setErrorReason('')

    const cache = cachedRef.current

    try {
      // ── Step: upload_file (encode both files) ──────────────────────────────
      if (!retryFromStep || retryFromStep === 'upload_file') {
        setStep('upload_file', 'active')
        try {
          if (!cache.screenshotBase64) cache.screenshotBase64 = await fileToBase64(screenshot)
          if (!cache.pdfBase64)        cache.pdfBase64        = await fileToBase64(orderMeta.pdfFile)
        } catch (err) {
          throw { step: 'upload_file', reason: err.message || 'Failed to read file' }
        }
        setStep('upload_file', 'done')
      }

      // ── Steps: save_order + print_agent (handled inside submitOrder) ───────
      const res = await submitOrder(
        {
          name:             phone.trim(),
          fileName:         orderMeta.fileName,
          totalPages:       orderMeta.totalPages,
          printableCount:   orderMeta.printableCount || orderMeta.totalPages,
          copies:           orderMeta.copies,
          printType:        orderMeta.printType,
          printSide:        orderMeta.printSide,
          pageSize:         orderMeta.pageSize,
          orientation:      orderMeta.orientation,
          pageRange:        orderMeta.pageRange,
          pageRangeMode:    orderMeta.pageRangeMode,
          customPages:      orderMeta.customPages,
          selectedPages:    orderMeta.selectedPages || [],
          selectedPageCount: orderMeta.selectedPageCount || (orderMeta.selectedPages ? orderMeta.selectedPages.length : 0),
          printingCost:         orderMeta.printingCost || 0,
          digitalProcessingFee: orderMeta.digitalProcessingFee || orderMeta.serviceFee || 0,
          serviceFee:           orderMeta.digitalProcessingFee || orderMeta.serviceFee || 0,
          amount:               orderMeta.amount,
          transactionId:        transactionId.trim(),
          screenshotBase64:     cache.screenshotBase64,
          pdfBase64:            cache.pdfBase64,
        },
        {
          onStep: (stepId) => {
            // Mark previous step done when next one starts
            if (stepId === 'print_agent') setStep('save_order', 'done')
            setStep(stepId, 'active')
          },
        }
      )

      // Mark last two steps done
      setStep('print_agent', 'done')
      setStep('confirmed', 'done')
      setResult({ orderId: res.orderId, message: res.message })
      if (res?.orderId) {
        saveOrder({
          orderId:              res.orderId,
          fileName:             orderMeta?.fileName,
          totalPages:           orderMeta?.totalPages,
          printableCount:       orderMeta?.printableCount || orderMeta?.selectedPageCount || orderMeta?.totalPages,
          copies:               orderMeta?.copies,
          printType:            orderMeta?.printType,
          printSide:            orderMeta?.printSide,
          pageSize:             orderMeta?.pageSize,
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
      const stepId = err?.step || 'save_order'
      const reason = err?.reason || err?.message || 'Unknown Error'
      setStep(stepId, 'error')
      setFailedStep(stepId)
      setErrorReason(reason)
    } finally {
      setProcessing(false)
    }
  }, [phone, transactionId, screenshot, orderMeta, onSuccess])

  function handleSubmit(e) {
    e.preventDefault()
    if (!phone.trim())         return setFieldError('Please enter your phone number.')
    if (!transactionId.trim()) return setFieldError('Please enter the Transaction ID.')
    if (!screenshot)           return setFieldError('Please upload your payment screenshot.')
    setStepStatuses(PENDING_STATUSES)
    runSubmit(null)
  }

  function handleRetry() {
    // Reset only the failed step and everything after it, keep earlier done steps
    const failIdx = ['upload_file', 'save_order', 'print_agent', 'confirmed'].indexOf(failedStep)
    setStepStatuses(prev => {
      const next = { ...prev }
      ;['upload_file', 'save_order', 'print_agent', 'confirmed'].forEach((id, i) => {
        if (i >= failIdx) next[id] = 'pending'
      })
      return next
    })
    setFailedStep(null)
    setErrorReason('')
    runSubmit(failedStep)
  }

  function handleCancel() {
    setProcessing(false)
    setStepStatuses(PENDING_STATUSES)
    setFailedStep(null)
    setErrorReason('')
  }

  const showProgress = processing || failedStep || result

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mt-4 border-t border-orange-100 pt-4">
      <h4 className="text-[#222222] font-semibold mb-4 text-sm">Confirm Your Payment</h4>

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

        <div>
          <label className="text-gray-500 text-xs mb-1 block">Payment Screenshot</label>
          <div
            onClick={() => !processing && fileInputRef.current.click()}
            className={`border-2 border-dashed rounded-xl p-4 text-center transition-all ${
              processing ? 'opacity-60 cursor-not-allowed' :
              preview    ? 'border-orange-300 bg-orange-50 cursor-pointer' :
                           'border-orange-200 hover:border-[#F78C25] hover:bg-orange-50 cursor-pointer'
            }`}
          >
            <input
              ref={fileInputRef} type="file" accept="image/*" className="hidden"
              onChange={(e) => handleScreenshot(e.target.files[0])}
              disabled={processing}
            />
            <AnimatePresence mode="wait">
              {preview ? (
                <motion.div key="preview" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                  <img src={preview} alt="Payment screenshot" className="h-24 object-contain mx-auto rounded-lg mb-2" />
                  <p className="text-[#F78C25] text-xs">{screenshot.name}</p>
                  {!processing && <p className="text-gray-400 text-xs mt-0.5">Click to change</p>}
                </motion.div>
              ) : (
                <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                  <div className="w-8 h-8 rounded-lg bg-orange-50 border border-orange-200 flex items-center justify-center mx-auto mb-2">
                    <svg className="w-4 h-4 text-[#F78C25]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                  </div>
                  <p className="text-gray-400 text-xs">Tap to upload screenshot</p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        <AnimatePresence>
          {fieldError && (
            <motion.p initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              className="text-amber-600 text-xs bg-amber-50 border border-amber-200 rounded-lg px-3 py-2"
            >
              ⚠ {fieldError}
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
            className="w-full py-3 bg-[#F78C25] hover:bg-[#e07010] text-white font-bold text-sm rounded-xl transition-all duration-200"
          >
            ✓ Confirm &amp; Submit Order
          </motion.button>
        )}
      </form>
    </motion.div>
  )
}
