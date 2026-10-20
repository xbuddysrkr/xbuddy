import React from 'react'
import { motion } from 'framer-motion'
import { Zap, GraduationCap, ShieldCheck, CreditCard, Sparkles } from 'lucide-react'
import { useLanguage } from '../i18n/LanguageContext'

export default function TrustStats() {
  const { t } = useLanguage()

  const stats = [
    {
      icon: Sparkles,
      title: t('trustStats.stat1Title', 'Academic'),
      label: t('trustStats.stat1Label', 'Toolkit'),
      description: t('trustStats.stat1Desc', 'Academic toolkit, form generation & utilities'),
      tag: t('trustStats.stat1Tag', 'Coming Soon'),
    },
    {
      icon: Zap,
      title: t('trustStats.stat2Title', '30 sec'),
      label: t('trustStats.stat2Label', 'Average Print'),
      description: t('trustStats.stat2Desc', 'Lightning-fast document retrieval and printing'),
      tag: null,
    },
    {
      icon: GraduationCap,
      title: t('trustStats.stat3Title', 'Built for'),
      label: t('trustStats.stat3Label', 'Campuses'),
      description: t('trustStats.stat3Desc', 'Designed specifically for university ecosystems'),
      tag: null,
    },
    {
      icon: ShieldCheck,
      title: t('trustStats.stat4Title', '100%'),
      label: t('trustStats.stat4Label', 'Secure Collection'),
      description: t('trustStats.stat4Desc', 'Encrypted QR pickup with zero privacy leaks'),
      tag: null,
    },
    {
      icon: CreditCard,
      title: t('trustStats.stat5Title', 'Instant'),
      label: t('trustStats.stat5Label', 'Digital Payments'),
      description: t('trustStats.stat5Desc', 'Unified UPI, Cards & Wallet payment checkout'),
      tag: null,
    },
  ]

  return (
    <div className="w-full max-w-6xl mx-auto mt-16 px-4">
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        {stats.map((stat, i) => {
          const IconComponent = stat.icon
          return (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: i * 0.08 }}
              whileHover={{ y: -5 }}
              className="relative p-5 rounded-2xl bg-white/80 backdrop-blur-md border border-orange-100/80 shadow-lg shadow-orange-500/5 hover:border-orange-300 hover:shadow-xl hover:shadow-orange-500/10 transition-all group flex flex-col justify-between last:col-span-2 md:last:col-span-1"
            >
              {stat.tag && (
                <span className="absolute top-2.5 right-2.5 px-2 py-0.5 rounded-full text-[9px] font-bold bg-orange-100 text-[#F7931E] border border-orange-200 uppercase tracking-wider">
                  {stat.tag}
                </span>
              )}
              
              <div>
                <div className="w-10 h-10 rounded-xl bg-orange-50 text-[#F7931E] border border-orange-100 flex items-center justify-center mb-3 group-hover:bg-[#F7931E] group-hover:text-white transition-colors duration-300">
                  <IconComponent className="w-5 h-5" />
                </div>
                
                <h3 className="text-xl md:text-2xl font-extrabold text-slate-900 tracking-tight leading-none mb-1">
                  {stat.title}
                </h3>
                <p className="text-xs font-bold text-[#F7931E] mb-2">{stat.label}</p>
              </div>

              <p className="text-[11px] text-slate-500 font-normal leading-relaxed">
                {stat.description}
              </p>
            </motion.div>
          )
        })}
      </div>
    </div>
  )
}
