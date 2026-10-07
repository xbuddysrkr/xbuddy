import React from 'react'
import { motion } from 'framer-motion'
import { GraduationCap, Building2, Hospital, Landmark, BookOpen, School } from 'lucide-react'

export default function PerfectFor() {
  const categories = [
    { icon: GraduationCap, title: 'Colleges', desc: 'Instant student assignment & project printing' },
    { icon: Building2, title: 'Offices', desc: 'Secure corporate document kiosks & badges' },
    { icon: Hospital, title: 'Hospitals', desc: 'Patient records & prescription form generation' },
    { icon: Landmark, title: 'Government Offices', desc: 'Public utility application forms & verification' },
    { icon: BookOpen, title: 'Libraries', desc: 'Quiet autonomous print & scan terminals' },
    { icon: School, title: 'Universities', desc: 'Campus-wide smart kiosk network deployment' },
  ]

  return (
    <section className="py-20 px-4 bg-white relative overflow-hidden">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="text-center max-w-2xl mx-auto mb-16">
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-orange-50 border border-orange-200 text-[#F7931E] text-xs font-bold uppercase tracking-wider mb-3"
          >
            Universal Deployment
          </motion.div>
          <motion.h2
            initial={{ opacity: 0, y: 15 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.1 }}
            className="text-3xl md:text-5xl font-extrabold text-slate-900 tracking-tight"
          >
            Perfect <span className="gradient-text-orange">For</span>
          </motion.h2>
          <motion.p
            initial={{ opacity: 0, y: 15 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.2 }}
            className="text-slate-500 text-base md:text-lg mt-3"
          >
            Scalable infrastructure built for high-footfall educational, healthcare, and civic environments.
          </motion.p>
        </div>

        {/* Cards Grid */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          {categories.map((cat, idx) => {
            const IconComp = cat.icon
            return (
              <motion.div
                key={cat.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.4, delay: idx * 0.08 }}
                whileHover={{ y: -6, scale: 1.02 }}
                className="p-5 rounded-3xl bg-white border border-orange-100 shadow-md shadow-orange-500/5 hover:border-orange-300 hover:shadow-xl hover:shadow-orange-500/10 transition-all duration-300 flex flex-col items-center text-center group"
              >
                <div className="w-14 h-14 rounded-2xl bg-orange-50 text-[#F7931E] border border-orange-100/80 flex items-center justify-center mb-3 group-hover:bg-[#F7931E] group-hover:text-white transition-all duration-300 shadow-sm">
                  <IconComp className="w-7 h-7" />
                </div>
                <h3 className="text-base font-bold text-slate-900 mb-1 group-hover:text-[#F7931E] transition-colors">
                  {cat.title}
                </h3>
                <p className="text-[11px] text-slate-400 leading-snug">
                  {cat.desc}
                </p>
              </motion.div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
