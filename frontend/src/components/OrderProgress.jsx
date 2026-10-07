import { motion, AnimatePresence } from 'framer-motion'

// Steps that map 1-to-1 with real network calls / backend responses
const STEPS = [
  { id: 'upload_file', label: 'Uploading File',       desc: 'Reading & encoding document' },
  { id: 'save_order',  label: 'Saving Order',          desc: 'Recording order on server' },
  { id: 'print_agent', label: 'Sending to Print Agent', desc: 'Transferring PDF to kiosk' },
  { id: 'confirmed',   label: 'Order Confirmed',        desc: 'Server issued your Order ID' },
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
export default function OrderProgress({ stepStatuses, failedStep, errorReason, result, onRetry, onCancel }) {
  const doneCount = STEPS.filter(s => stepStatuses[s.id] === 'done').length
  const progress  = Math.round((doneCount / STEPS.length) * 100)
  const hasFailed = !!failedStep
  const isSuccess = !!result

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="mt-4 bg-[#FFFDF9] border border-orange-200 rounded-2xl shadow-md overflow-hidden"
    >
      {/* Progress bar */}
      <div className="h-1 bg-orange-100">
        <motion.div
          className={`h-full ${hasFailed ? 'bg-red-400' : 'bg-[#F7931E]'}`}
          animate={{ width: `${progress}%` }}
          transition={{ duration: 0.4, ease: 'easeOut' }}
        />
      </div>

      <div className="p-4 space-y-3">
        {/* Header */}
        <div className="flex items-center justify-between">
          <p className="text-[#222222] font-semibold text-sm">
            {isSuccess ? '✅ Order Confirmed!' : hasFailed ? '❌ Order Failed' : '⏳ Processing Order…'}
          </p>
          <span className="text-xs text-gray-400 font-mono">{progress}%</span>
        </div>

        {/* Steps */}
        <div className="space-y-2.5">
          {STEPS.map((step) => {
            const status = stepStatuses[step.id] ?? 'pending'
            const isFailed = step.id === failedStep
            return (
              <motion.div
                key={step.id}
                animate={isFailed ? { x: [-4, 4, -3, 3, 0] } : {}}
                transition={{ duration: 0.35 }}
                className={`flex items-center gap-3 px-3 py-2 rounded-xl transition-colors ${
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
                    <p className="text-xs text-gray-400 mt-0.5">{step.desc}</p>
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
                className="flex-1 py-2 bg-[#F7931E] hover:bg-[#e07010] text-white text-xs font-bold rounded-xl transition-colors"
              >
                ↺ Retry
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
