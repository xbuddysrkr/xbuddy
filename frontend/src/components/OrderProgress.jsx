import { motion, AnimatePresence } from 'framer-motion'
import { CheckCircle2, XCircle, Clock, RotateCcw } from 'lucide-react'
import PerfectStackGame from './PerfectStackGame'

// Steps that map 1-to-1 with real network calls / backend responses
const STEPS = [
  { id: 'upload_file', label: 'Preparing Document',   desc: 'Reading & preparing document' },
  { id: 'save_order',  label: 'Saving Order',        desc: 'Securing order in cloud database' },
  { id: 'confirmed',   label: 'Order Confirmed',      desc: 'Order verified & queued for shopkeeper' },
]

function StepIcon({ status }) {
  if (status === 'active')
    return <div className="w-5 h-5 border-2 border-[#F7931E] border-t-transparent rounded-full animate-spin" />
  if (status === 'done')
    return (
      <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} className="w-5 h-5 rounded-full bg-green-500 flex items-center justify-center">
        <svg className="w-3 h-3 text-white" viewBox="0 0 12 12" fill="none">
          <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </motion.div>
    )
  if (status === 'error')
    return (
      <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} className="w-5 h-5 rounded-full bg-red-500 flex items-center justify-center">
        <svg className="w-3 h-3 text-white" viewBox="0 0 12 12" fill="none">
          <path d="M3 3l6 6M9 3l-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      </motion.div>
    )
  return <div className="w-5 h-5 rounded-full border-2 border-gray-200" />
}

// stepStatuses: { [stepId]: 'pending' | 'active' | 'done' | 'error' }
export default function OrderProgress({
  stepStatuses,
  failedStep,
  errorReason,
  result,
  submissionPhase = 'idle',
  uploadProgress = { percent: 0, loaded: 0, total: 0 },
  onRetry,
  onCancel,
}) {
  const hasFailed = !!failedStep
  const isSuccess = !!result

  // Truthful progress state evaluation (never shows fake static 33%)
  let displayPercent = null
  let isIndeterminate = false
  let headerLabel = 'Processing Order…'

  if (isSuccess) {
    displayPercent = 100
    headerLabel = 'Order Confirmed!'
  } else if (hasFailed) {
    displayPercent = null
    headerLabel = 'Order Failed'
  } else if (submissionPhase === 'reconciling') {
    isIndeterminate = true
    headerLabel = 'Still saving; checking order status…'
  } else if (submissionPhase === 'saving' || (stepStatuses.save_order === 'active' && !hasFailed)) {
    // Honest indeterminate indicator during backend MongoDB Atlas & GridFS persistence
    isIndeterminate = true
    headerLabel = 'Securing in Cloud Database…'
  } else if (submissionPhase === 'uploading' || (stepStatuses.upload_file === 'active' && uploadProgress?.percent > 0)) {
    displayPercent = Math.min(99, Math.max(0, uploadProgress?.percent || 0))
    headerLabel = `Uploading Document (${displayPercent}%)…`
  } else if (submissionPhase === 'preparing' || stepStatuses.upload_file === 'active') {
    headerLabel = 'Preparing Document…'
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="mt-4 bg-[#FFFDF9] border border-orange-200 rounded-2xl shadow-md overflow-hidden"
    >
      {/* Progress bar */}
      <div className="h-1.5 bg-orange-100 overflow-hidden relative">
        {hasFailed ? (
          <div className="h-full bg-red-400 w-full" />
        ) : isSuccess ? (
          <motion.div
            className="h-full bg-emerald-500"
            initial={{ width: 0 }}
            animate={{ width: '100%' }}
            transition={{ duration: 0.3 }}
          />
        ) : isIndeterminate ? (
          <motion.div
            className="h-full bg-gradient-to-r from-amber-400 via-[#F7931E] to-amber-400 w-full"
            animate={{
              x: ['-100%', '100%'],
            }}
            transition={{
              repeat: Infinity,
              duration: 1.4,
              ease: 'easeInOut',
            }}
          />
        ) : (
          <motion.div
            className="h-full bg-[#F7931E]"
            animate={{ width: `${displayPercent || 5}%` }}
            transition={{ duration: 0.25, ease: 'easeOut' }}
          />
        )}
      </div>

      <div className="p-4 space-y-3">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-[#222222] font-semibold text-sm">
            {isSuccess ? (
              <>
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>Order Confirmed!</span>
              </>
            ) : hasFailed ? (
              <>
                <XCircle className="w-4 h-4 text-red-500 shrink-0" />
                <span>Order Failed</span>
              </>
            ) : isIndeterminate ? (
              <>
                <div className="w-4 h-4 border-2 border-[#F7931E] border-t-transparent rounded-full animate-spin shrink-0" />
                <span>{headerLabel}</span>
              </>
            ) : (
              <>
                <Clock className="w-4 h-4 text-[#F7931E] animate-pulse shrink-0" />
                <span>{headerLabel}</span>
              </>
            )}
          </div>
          {isSuccess ? (
            <span className="text-xs text-emerald-600 font-mono font-bold">100%</span>
          ) : hasFailed ? (
            <span className="text-xs text-red-500 font-mono font-semibold">Failed</span>
          ) : isIndeterminate ? (
            <span className="text-xs text-amber-600 font-semibold flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-ping" />
              Saving…
            </span>
          ) : displayPercent !== null ? (
            <span className="text-xs text-[#F7931E] font-mono font-bold">{displayPercent}%</span>
          ) : (
            <span className="text-xs text-gray-400 font-mono">Preparing…</span>
          )}
        </div>

        {/* XBuddy Perfect Stack — Automatic Waiting Mini-Game while actively processing */}
        {!isSuccess && !hasFailed && (
          <div className="pt-0.5">
            <PerfectStackGame />
          </div>
        )}

        {/* Steps */}
        <div className="space-y-2">
          {STEPS.map((step) => {
            const status = stepStatuses[step.id] ?? 'pending'
            const isFailed = step.id === failedStep

            let dynamicDesc = step.desc
            if (step.id === 'upload_file') {
              if (submissionPhase === 'uploading' && uploadProgress?.percent > 0) {
                dynamicDesc = `Uploading document bytes (${uploadProgress.percent}%)...`
              } else if (status === 'done') {
                dynamicDesc = 'Document uploaded successfully'
              }
            } else if (step.id === 'save_order') {
              if (submissionPhase === 'reconciling') {
                dynamicDesc = 'Still saving; checking order status...'
              } else if (status === 'active') {
                dynamicDesc = 'Securing order in cloud database...'
              } else if (status === 'done') {
                dynamicDesc = 'Secured in MongoDB Atlas'
              }
            }

            return (
              <motion.div
                key={step.id}
                animate={isFailed ? { x: [-4, 4, -3, 3, 0] } : {}}
                transition={{ duration: 0.35 }}
                className={`flex items-center gap-3 px-3 py-1.5 rounded-xl transition-colors ${
                  status === 'active' ? 'bg-orange-50 border border-orange-200' :
                  isFailed           ? 'bg-red-50 border border-red-200' :
                  status === 'done'  ? 'bg-green-50/60' : 'opacity-50'
                }`}
              >
                <StepIcon status={status} />
                <div className="flex-1 min-w-0">
                  <p className={`text-xs font-semibold truncate ${isFailed ? 'text-red-600' : status === 'done' ? 'text-green-700' : 'text-[#222222]'}`}>
                    {step.label}
                  </p>
                  {isFailed && errorReason && (
                    <p className="text-xs text-red-500 mt-0.5 truncate">{errorReason}</p>
                  )}
                  {status === 'active' && (
                    <p className="text-xs text-gray-400 mt-0.5">{dynamicDesc}</p>
                  )}
                </div>
              </motion.div>
            )
          })}
        </div>

        {/* Success state */}
        <AnimatePresence>
          {isSuccess && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-green-50 border border-green-200 rounded-xl px-4 py-3 space-y-1"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-500">Order ID</span>
                <span className="font-mono font-bold text-[#F7931E] text-sm">{result.orderId}</span>
              </div>
              {result.message && (
                <p className="text-xs text-green-600">{result.message}</p>
              )}
              <p className="text-xs text-gray-400">Show this ID to the shopkeeper to collect your print.</p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Failure actions */}
        <AnimatePresence>
          {hasFailed && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex gap-2 pt-1">
              <button
                onClick={onRetry}
                className="flex-1 py-2 bg-[#F7931E] hover:bg-[#e07010] text-white text-xs font-bold rounded-xl transition-colors inline-flex items-center justify-center gap-1.5"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Retry</span>
              </button>
              <button
                onClick={onCancel}
                className="flex-1 py-2 bg-gray-100 hover:bg-gray-200 text-gray-600 text-xs font-semibold rounded-xl transition-colors"
              >
                Cancel
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  )
}
