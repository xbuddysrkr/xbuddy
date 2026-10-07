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
  const [fieldError,    setFieldError]    = useState('')

  // Progress state
  const [processing,    setProcessing]    = useState(false)
  const [stepStatuses,  setStepStatuses]  = useState(PENDING_STATUSES)
  const [failedStep,    setFailedStep]    = useState(null)   // step id
  const [errorReason,   setErrorReason]   = useState('')
  const [result,        setResult]        = useState(null)   // { orderId, message }

  // Cached base64 values so retry can skip re-encoding
  const cachedRef = useRef({ pdfBase64: null })

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

    const cache = cachedRef.current

    try {
      // ── Step: upload_file (encode PDF file) ──────────────────────────────
      if (!retryFromStep || retryFromStep === 'upload_file') {
        setStep('upload_file', 'active')
        try {
          if (!cache.pdfBase64) cache.pdfBase64 = await fileToBase64(orderMeta.pdfFile)
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
          colorMode:        orderMeta.colorMode || (orderMeta.printType === 'Color' ? 'color' : 'bw'),
          printType:        orderMeta.printType,
          printSide:        orderMeta.printSide,
          duplex:           orderMeta.duplex,
          pageSize:         orderMeta.pageSize,
          paperSize:        orderMeta.paperSize || orderMeta.pageSize,
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
          screenshotBase64:     '',
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
