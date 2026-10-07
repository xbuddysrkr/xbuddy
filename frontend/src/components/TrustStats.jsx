import React from 'react'
import { motion } from 'framer-motion'
import { Zap, GraduationCap, ShieldCheck, Sun, CreditCard, Sparkles } from 'lucide-react'

export default function TrustStats() {
  const stats = [
    {
      icon: Sparkles,
      title: 'Academic',
      label: 'Toolkit',
      description: 'Academic toolkit, form generation & utilities',
      tag: 'Coming Soon',
    },
    {
      icon: Zap,
      title: '30 sec',
      label: 'Average Print',
      description: 'Lightning-fast document retrieval and printing',
      tag: null,
    },
    {
      icon: GraduationCap,
      title: 'Built for',
      label: 'Campuses',
      description: 'Designed specifically for university ecosystems',
      tag: null,
    },
    {
      icon: ShieldCheck,
      title: '100%',
      label: 'Secure Collection',
      description: 'Encrypted QR pickup with zero privacy leaks',
      tag: null,
    },
    {
      icon: Sun,
      title: 'Zero Wait',
      label: 'Campus Queues',
      description: 'Order in advance and skip peak-hour Xerox shop lines',
      tag: null,
    },
    {
      icon: CreditCard,
      title: 'Instant',
      label: 'Digital Payments',
      description: 'Unified UPI, Cards & Wallet payment checkout',
      tag: null,
    },
  ]

  return (
    <div className="w-full max-w-6xl mx-auto mt-16 px-4">
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
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
              className="relative p-5 rounded-2xl bg-white/80 backdrop-blur-md border border-orange-100/80 shadow-lg shadow-orange-500/5 hover:border-orange-300 hover:shadow-xl hover:shadow-orange-500/10 transition-all group flex flex-col justify-between"
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
