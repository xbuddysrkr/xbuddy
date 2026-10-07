import React from 'react'
import { motion } from 'framer-motion'
import { UploadCloud, Sliders, CreditCard, Store, ArrowRight } from 'lucide-react'

export default function Workflow({ onStartPrint }) {
  const steps = [
    {
      step: 'Step 1',
      title: 'Upload Document',
      description: 'Upload PDF, documents, or images directly from your phone or laptop.',
      icon: UploadCloud,
    },
    {
      step: 'Step 2',
      title: 'Configure Print',
      description: 'Select B&W/Color, single/double side, custom pages & transparent pricing.',
      icon: Sliders,
    },
    {
      step: 'Step 3',
      title: 'Pay & Get Order ID',
      description: 'Pay securely via UPI (PhonePe, GPay, Paytm) and generate your unique Order ID.',
      icon: CreditCard,
    },
    {
      step: 'Step 4',
      title: 'Collect at Xerox Shop',
      description: 'Head to your campus Xerox shop, show your Order ID, and collect your fresh prints.',
      icon: Store,
    },
  ]

  return (
    <section className="py-20 px-4 relative overflow-hidden bg-white">
      {/* Soft background glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[300px] bg-orange-400/5 blur-3xl rounded-full pointer-events-none" />

      <div className="max-w-6xl mx-auto relative z-10">
        {/* Section Header */}
        <div className="text-center max-w-2xl mx-auto mb-16">
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-orange-50 border border-orange-200 text-[#F7931E] text-xs font-bold uppercase tracking-wider mb-3"
          >
            Digital Ordering Workflow
          </motion.div>
          <motion.h2
            initial={{ opacity: 0, y: 15 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.1 }}
            className="text-3xl md:text-5xl font-extrabold text-slate-900 tracking-tight"
          >
            How <span className="gradient-text-orange">X Buddy</span> Works
          </motion.h2>
          <motion.p
            initial={{ opacity: 0, y: 15 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.2 }}
            className="text-slate-500 text-base md:text-lg mt-3"
          >
            From phone upload to Xerox shop collection in 4 seamless digital steps.
          </motion.p>
        </div>

        {/* Timeline Grid */}
        <div className="relative">
          {/* Animated Connecting Line (Desktop) */}
          <div className="hidden lg:block absolute top-1/2 left-12 right-12 -translate-y-6 h-0.5 z-0">
            <div className="w-full h-full bg-orange-100 rounded-full overflow-hidden">
              <motion.div
                className="h-full bg-gradient-to-r from-[#F7931E] via-amber-400 to-[#F7931E]"
                initial={{ width: '0%' }}
                whileInView={{ width: '100%' }}
                viewport={{ once: true }}
                transition={{ duration: 1.5, ease: 'easeInOut' }}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 relative z-10">
            {steps.map((item, idx) => {
              const IconComp = item.icon
              return (
                <motion.div
                  key={item.step}
                  initial={{ opacity: 0, y: 25 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.5, delay: idx * 0.15 }}
                  whileHover={{ y: -6 }}
                  className="p-6 rounded-3xl bg-white border border-orange-100/90 shadow-xl shadow-orange-500/5 hover:border-orange-300 hover:shadow-2xl hover:shadow-orange-500/10 transition-all duration-300 flex flex-col justify-between group"
                >
                  <div>
                    {/* Header: Badge & Arrow */}
                    <div className="flex items-center justify-between mb-6">
                      <span className="px-3 py-1 rounded-xl bg-orange-50 text-[#F7931E] text-xs font-extrabold border border-orange-200/60">
                        {item.step}
                      </span>
                      {idx < steps.length - 1 && (
                        <div className="hidden lg:flex w-8 h-8 rounded-full bg-orange-50 items-center justify-center text-orange-400 group-hover:bg-[#F7931E] group-hover:text-white transition-colors">
                          <ArrowRight className="w-4 h-4" />
                        </div>
                      )}
                    </div>

                    {/* Step Icon */}
                    <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-orange-50 to-amber-50 border border-orange-100 flex items-center justify-center text-[#F7931E] mb-5 group-hover:scale-110 group-hover:bg-[#F7931E] group-hover:text-white transition-all duration-300 shadow-sm">
                      <IconComp className="w-7 h-7" />
                    </div>

                    {/* Content */}
                    <h3 className="text-xl font-bold text-slate-900 mb-2 group-hover:text-[#F7931E] transition-colors">
                      {item.title}
                    </h3>
                    <p className="text-slate-500 text-xs md:text-sm leading-relaxed">
                      {item.description}
                    </p>
                  </div>

                  <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-between text-[11px] font-semibold text-slate-400 group-hover:text-[#F7931E] transition-colors">
                    <span>Action ready</span>
                    <span>0{idx + 1}</span>
                  </div>
                </motion.div>
              )
            })}
          </div>
        </div>
      </div>
    </section>
  )
}
