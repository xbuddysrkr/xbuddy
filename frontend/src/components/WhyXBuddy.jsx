import React from 'react'
import { motion } from 'framer-motion'
import { Lock, ShieldCheck, Wallet, Store, Layers, CheckCircle2 } from 'lucide-react'
import { useLanguage } from '../i18n/LanguageContext'

export default function WhyXBuddy() {
  const { t } = useLanguage()

  const features = [
    {
      icon: Layers,
      title: t('whyXBuddy.feat1Title', t('whyXBuddy.f1Title', 'Academic Toolkit')),
      description: t('whyXBuddy.feat1Desc', t('whyXBuddy.f1Desc', 'Generate resumes, leave letters, bonafide requests, and format lab manuals in seconds.')),
    },
    {
      icon: Lock,
      title: t('whyXBuddy.feat2Title', 'Data Privacy'),
      description: t('whyXBuddy.feat2Desc', 'Your files and documents are encrypted in transit and automatically deleted after printing.'),
    },
    {
      icon: Store,
      title: t('whyXBuddy.f3Title', 'Xerox Shop Integration'),
      description: t('whyXBuddy.f3Desc', 'Connects directly with campus print shops for organized queue management and fast fulfillment.'),
    },
    {
      icon: Wallet,
      title: t('whyXBuddy.f4Title', 'Transparent Pricing'),
      description: t('whyXBuddy.f4Desc', 'Clear per-page rates and transparent digital processing fees with instant UPI verification.'),
    },
    {
      icon: ShieldCheck,
      title: t('whyXBuddy.f5Title', 'Live Order Tracking'),
      description: t('whyXBuddy.f5Desc', 'Track your print job status in real-time from Order Received to Ready for Collection.'),
    },
    {
      icon: CheckCircle2,
      title: t('whyXBuddy.f6Title', 'Custom Page Selection'),
      description: t('whyXBuddy.f6Desc', 'Print only specific pages or ranges with automated accurate page-level pricing calculations.'),
    },
  ]

  return (
    <section className="py-20 px-4 bg-gradient-to-b from-white via-orange-50/30 to-white relative overflow-hidden">
      <div className="max-w-6xl mx-auto">
        {/* Section Header */}
        <div className="text-center max-w-2xl mx-auto mb-16">
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-orange-100/70 border border-orange-200 text-[#F7931E] text-xs font-bold uppercase tracking-wider mb-3"
          >
            {t('whyXBuddy.badge', 'Software Platform Advantage')}
          </motion.div>
          <motion.h2
            initial={{ opacity: 0, y: 15 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.1 }}
            className="text-3xl md:text-5xl font-extrabold text-slate-900 tracking-tight"
          >
            {t('whyXBuddy.title', 'Why X Buddy?')}
          </motion.h2>
          <motion.p
            initial={{ opacity: 0, y: 15 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.2 }}
            className="text-slate-500 text-base md:text-lg mt-3"
          >
            {t('whyXBuddy.subtitle', 'The digital layer that modernizes campus Xerox shops and eliminates printing hassle for students.')}
          </motion.p>
        </div>

        {/* Feature Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {features.map((item, idx) => {
            const IconComponent = item.icon
            return (
              <motion.div
                key={item.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.4, delay: idx * 0.08 }}
                whileHover={{ y: -6 }}
                className="p-7 rounded-3xl bg-white/90 backdrop-blur-md border border-orange-100 shadow-lg shadow-orange-500/5 hover:border-orange-300 hover:shadow-2xl hover:shadow-orange-500/10 transition-all duration-300 group"
              >
                <div className="w-12 h-12 rounded-2xl bg-orange-50 text-[#F7931E] border border-orange-100 flex items-center justify-center mb-5 group-hover:bg-[#F7931E] group-hover:text-white group-hover:scale-110 transition-all duration-300 shadow-sm">
                  <IconComponent className="w-6 h-6" />
                </div>
                <h3 className="text-lg font-bold text-slate-900 mb-2 group-hover:text-[#F7931E] transition-colors">
                  {item.title}
                </h3>
                <p className="text-slate-500 text-xs md:text-sm leading-relaxed">
                  {item.description}
                </p>
              </motion.div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
