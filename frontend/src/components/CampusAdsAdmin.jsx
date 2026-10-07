import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Megaphone,
  Sparkles,
  CheckCircle2,
  Calendar,
  Link as LinkIcon,
  Tag,
  Layers,
  Image as ImageIcon,
  Video as VideoIcon,
  ArrowRight,
  ExternalLink,
  RefreshCw,
  Eye,
  Sliders,
  AlertCircle,
  Clock,
  Send,
  UploadCloud,
  FileCheck
} from 'lucide-react'
import { createCampusAd, fetchCampusAds } from '../utils/api'
import CampusPromotionAd from './CampusPromotionAd'

const PRESET_TEMPLATES = [
  {
    name: 'Hackathon 2026',
    icon: '⚡',
    clubName: 'CSE Student Association',
    title: 'CodeSprint 2026 — 24H Campus Hackathon',
    description: '₹50,000 cash prize pool! Free mentor sessions, goodies, certificates & midnight snacks. Open to all branches.',
    mediaType: 'image',
    mediaUrl: '/assets/campus-ads/hackathon-2026.jpg',
    clickUrl: 'https://srkrec.edu.in',
    buttonText: 'Register Free →',
    priority: 1,
  },
  {
    name: 'Robotics Workshop',
    icon: '🤖',
    clubName: 'Robotics & Automation Society',
    title: 'Autonomous Drone & IoT Bootcamp',
    description: 'Hands-on hardware session: Assemble sensor nodes, program flight controllers, and earn merit certificates.',
    mediaType: 'image',
    mediaUrl: 'https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&w=1200&q=80',
    clickUrl: 'https://srkrec.edu.in',
    buttonText: 'Reserve Your Seat',
    priority: 2,
  },
  {
    name: 'Tech Fest 2026',
    icon: '🚀',
    clubName: 'SRKR Innovation Cell',
    title: 'SRKR National Tech Fest — Call for Papers',
    description: 'Present your IEEE/Scopus research papers and project prototypes before industry judges & investors.',
    mediaType: 'image',
    mediaUrl: 'https://images.unsplash.com/photo-1517245386807-bb43f82c33c4?auto=format&fit=crop&w=1200&q=80',
    clickUrl: 'https://srkrec.edu.in',
    buttonText: 'Submit Paper',
    priority: 3,
  },
  {
    name: 'Design & UI Sprint',
    icon: '🎨',
    clubName: 'Google DSC / UI Club',
    title: 'Figma to Code 3-Day Sprint',
    description: 'Learn modern UI/UX design, micro-interactions, and responsive frontend implementation from alumni.',
    mediaType: 'image',
    mediaUrl: 'https://images.unsplash.com/photo-1531403009284-440f080d1e12?auto=format&fit=crop&w=1200&q=80',
    clickUrl: 'https://srkrec.edu.in',
    buttonText: 'Join Discord',
    priority: 4,
  }
]

function getFormattedDate(offsetDays = 0) {
  const d = new Date()
  d.setDate(d.getDate() + offsetDays)
  return d.toISOString().slice(0, 10)
}

export default function CampusAdsAdmin({ onBack, onNavigateToStatus }) {
  const [formData, setFormData] = useState({
    clubName: 'CSE Student Association',
    title: 'CodeSprint 2026 — 24H Campus Hackathon',
    description: '₹50,000 cash prize pool! Free mentor sessions, goodies, certificates & midnight snacks. Open to all branches.',
    mediaType: 'image',
    mediaUrl: '/assets/campus-ads/hackathon-2026.jpg',
    clickUrl: 'https://srkrec.edu.in',
    buttonText: 'Register Free →',
    placement: 'order-status',
    startDate: getFormattedDate(0),
    endDate: getFormattedDate(14),
    status: 'approved',
    priority: 1,
  })

  const [localFilePreview, setLocalFilePreview] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [submitResult, setSubmitResult] = useState(null)
  const [liveAdsList, setLiveAdsList] = useState([])
  const [loadingLiveAds, setLoadingLiveAds] = useState(false)
  const [activeTab, setActiveTab] = useState('create') // 'create' | 'live-ads'

  // Load existing approved ads from sheet
  const loadExistingAds = async () => {
    setLoadingLiveAds(true)
    try {
      const ads = await fetchCampusAds('order-status')
      if (Array.isArray(ads)) {
        setLiveAdsList(ads)
      }
    } catch (err) {
      console.error('Failed to load live ads:', err)
    } finally {
      setLoadingLiveAds(false)
    }
  }

  useEffect(() => {
    loadExistingAds()
  }, [])

  const handleChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }))
  }

  const applyTemplate = (tmpl) => {
    setFormData(prev => ({
      ...prev,
      clubName: tmpl.clubName,
      title: tmpl.title,
      description: tmpl.description,
      mediaType: tmpl.mediaType,
      mediaUrl: tmpl.mediaUrl,
      clickUrl: tmpl.clickUrl,
      buttonText: tmpl.buttonText,
      priority: tmpl.priority,
    }))
    setLocalFilePreview(null)
  }

function optimizeImageDataUrl(dataUrl, maxDim = 720, quality = 0.75) {
  return new Promise((resolve) => {
    if (!dataUrl || typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image/')) {
      return resolve(dataUrl)
    }
    const img = new Image()
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas')
        let width = img.width
        let height = img.height

        if (width > maxDim || height > maxDim) {
          if (width > height) {
            height = Math.round((height * maxDim) / width)
            width = maxDim
          } else {
            width = Math.round((width * maxDim) / height)
            height = maxDim
          }
        }

        canvas.width = width
        canvas.height = height
        const ctx = canvas.getContext('2d')
        ctx.drawImage(img, 0, 0, width, height)

        const compressed = canvas.toDataURL('image/jpeg', quality)
        resolve(compressed)
      } catch {
        resolve(dataUrl)
      }
    }
    img.onerror = () => resolve(dataUrl)
    img.src = dataUrl
  })
}

  const handleFileUpload = (e) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (file.type.startsWith('image/')) {
      const reader = new FileReader()
      reader.onload = async (event) => {
        const raw = event.target?.result
        if (raw) {
          // Optimize to ensure it fits comfortably within Google Sheets cell limits & transfers fast
          const optimized = await optimizeImageDataUrl(raw, 720, 0.75)
          setLocalFilePreview(optimized)
          setFormData(prev => ({
            ...prev,
            mediaUrl: optimized,
            mediaType: 'image',
          }))
        }
      }
      reader.readAsDataURL(file)
    } else {
      const reader = new FileReader()
      reader.onload = (event) => {
        const result = event.target?.result
        if (result) {
          setLocalFilePreview(result)
          setFormData(prev => ({
            ...prev,
            mediaUrl: result,
            mediaType: 'video',
          }))
        }
      }
      reader.readAsDataURL(file)
    }
  }

  const handleClearLocalFile = () => {
    setLocalFilePreview(null)
    setFormData(prev => ({
      ...prev,
      mediaUrl: '/assets/campus-ads/hackathon-2026.jpg',
      mediaType: 'image',
    }))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!formData.title?.trim()) {
      alert('Please enter an Ad Title')
      return
    }

    setSubmitting(true)
    setSubmitResult(null)

    try {
      let finalMediaUrl = formData.mediaUrl
      if (finalMediaUrl && finalMediaUrl.startsWith('data:image/')) {
        finalMediaUrl = await optimizeImageDataUrl(finalMediaUrl, 720, 0.75)
      }

      const payload = {
        ...formData,
        mediaUrl: finalMediaUrl,
      }

      const res = await createCampusAd(payload)
      if (res && res.success) {
        setSubmitResult({
          success: true,
          adId: res.adId,
          message: `Ad successfully published to XBuddy Ads Google Sheet! ID: ${res.adId}`,
        })
        loadExistingAds()
      } else {
        setSubmitResult({
          success: false,
          error: res?.error || 'Unable to save to Google Sheets',
        })
      }
    } catch (err) {
      setSubmitResult({
        success: false,
        error: err.message || 'Network error communicating with Google Apps Script',
      })
    } finally {
      setSubmitting(false)
    }
  }

  // Resolved ad preview object passed to live preview card
  const previewAd = {
    adId: 'PREVIEW-001',
    clubName: formData.clubName || 'Sample Club',
    title: formData.title || 'Sample Event Title',
    description: formData.description || 'Sample promotional description...',
    mediaType: formData.mediaType,
    mediaUrl: formData.mediaUrl || '/assets/campus-ads/hackathon-2026.jpg',
    clickUrl: formData.clickUrl || 'https://srkrec.edu.in',
    buttonText: formData.buttonText || 'View Details',
    placement: formData.placement,
    status: formData.status,
    priority: formData.priority,
    startDate: formData.startDate,
    endDate: formData.endDate,
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-orange-50/40 via-white to-slate-50 text-slate-800 pb-20">
      {/* Top Header */}
      <div className="sticky top-0 z-30 bg-white/90 backdrop-blur-md border-b border-orange-100 shadow-xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3.5 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <button
              onClick={onBack}
              className="p-2 rounded-xl bg-orange-50 hover:bg-orange-100 text-[#F7931E] border border-orange-200 transition-colors cursor-pointer text-xs font-bold flex items-center gap-1.5"
            >
              ← Back to App
            </button>
            <div className="h-4 w-px bg-slate-200 hidden sm:block" />
            <div className="flex items-center gap-2">
              <span className="w-8 h-8 rounded-xl bg-gradient-to-tr from-[#F7931E] to-[#FF6B00] flex items-center justify-center text-white text-base shadow-sm shadow-orange-500/20">
                📢
              </span>
              <div>
                <h1 className="text-sm sm:text-base font-black text-slate-900 tracking-tight leading-none">
                  XBuddy Campus Ads Manager
                </h1>
                <p className="text-[11px] text-slate-500 font-medium hidden sm:block">
                  Live URL route: <code className="text-[#F7931E] font-bold">/xbuddyads</code>
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-semibold">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span>Sheet: XBuddy Ads</span>
            </div>

            <button
              onClick={loadExistingAds}
              disabled={loadingLiveAds}
              className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors cursor-pointer text-xs flex items-center gap-1.5"
              title="Refresh ads from Google Sheets"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loadingLiveAds ? 'animate-spin text-[#F7931E]' : ''}`} />
              <span className="hidden sm:inline font-semibold">Refresh</span>
            </button>
          </div>
        </div>
      </div>

      {/* Hero Banner Notification */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 pt-6">
        <div className="p-4 sm:p-5 rounded-2xl bg-gradient-to-r from-orange-500 via-[#F7931E] to-amber-500 text-white shadow-lg shadow-orange-500/15 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="px-2 py-0.5 rounded-md bg-white/20 text-white text-[10px] font-black tracking-wide uppercase">
                Instant Publish
              </span>
              <span className="text-xs text-orange-100 font-medium">
                Connected to Google Sheet: <span className="font-mono underline">1a_dzI0AaOQo0gypw00BUUiKC872a7lKbKNQU4qe-Eq4</span>
              </span>
            </div>
            <h2 className="text-lg sm:text-xl font-black tracking-tight">
              Create & Publish Ads Directly to the Website
            </h2>
            <p className="text-xs sm:text-sm text-orange-100 max-w-2xl mt-0.5">
              Fill the form below to add your campus hackathon, club event, or student workshop. Ads with status <strong>Approved</strong> immediately show on the student waiting screen!
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => setActiveTab('create')}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                activeTab === 'create'
                  ? 'bg-white text-[#F7931E] shadow-md shadow-black/10'
                  : 'bg-white/20 text-white hover:bg-white/30'
              }`}
            >
              ✍️ New Ad Form
            </button>
            <button
              onClick={() => {
                setActiveTab('live-ads')
                loadExistingAds()
              }}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                activeTab === 'live-ads'
                  ? 'bg-white text-[#F7931E] shadow-md shadow-black/10'
                  : 'bg-white/20 text-white hover:bg-white/30'
              }`}
            >
              📋 Active Sheet Ads ({liveAdsList.length})
            </button>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 pt-6">
        {activeTab === 'create' ? (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Left Column: Form (7 cols) */}
            <div className="lg:col-span-7 bg-white rounded-3xl p-5 sm:p-7 border border-orange-100 shadow-xl shadow-orange-500/5">
              {/* Presets Row */}
              <div className="mb-6 pb-5 border-b border-slate-100">
                <div className="flex items-center justify-between mb-2.5">
                  <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-[#F7931E]" />
                    Quick Sample Presets (Click to autofill):
                  </span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {PRESET_TEMPLATES.map((tmpl) => (
                    <button
                      key={tmpl.name}
                      type="button"
                      onClick={() => applyTemplate(tmpl)}
                      className="px-2.5 py-2 rounded-xl bg-orange-50/70 hover:bg-orange-100/80 border border-orange-200/70 text-slate-700 hover:text-[#F7931E] transition-all text-left text-xs font-semibold flex items-center gap-1.5 cursor-pointer group"
                    >
                      <span className="text-sm group-hover:scale-110 transition-transform">{tmpl.icon}</span>
                      <span className="truncate">{tmpl.name}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Form Element */}
              <form onSubmit={handleSubmit} className="space-y-4">
                {/* Club / Organizer Name */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Club / Organizing Body Name <span className="text-orange-500">*</span>
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      required
                      value={formData.clubName}
                      onChange={(e) => handleChange('clubName', e.target.value)}
                      placeholder="e.g. CSE Student Association, CSI Chapter, SRKR Innovation Cell"
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 focus:border-[#F7931E] focus:ring-2 focus:ring-orange-200 text-xs sm:text-sm outline-hidden font-medium transition-all"
                    />
                  </div>
                </div>

                {/* Ad Title */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Headline / Event Title <span className="text-orange-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.title}
                    onChange={(e) => handleChange('title', e.target.value)}
                    placeholder="e.g. CodeSprint 2026 — 24H Campus Hackathon"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 focus:border-[#F7931E] focus:ring-2 focus:ring-orange-200 text-xs sm:text-sm outline-hidden font-bold text-slate-900 transition-all"
                  />
                </div>

                {/* Description */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Event Description / Highlights
                  </label>
                  <textarea
                    rows={3}
                    value={formData.description}
                    onChange={(e) => handleChange('description', e.target.value)}
                    placeholder="Short engaging description highlighting prizes, certificates, food, or eligibility..."
                    className="w-full px-3.5 py-2 rounded-xl border border-slate-200 focus:border-[#F7931E] focus:ring-2 focus:ring-orange-200 text-xs sm:text-sm outline-hidden font-medium transition-all"
                  />
                </div>

                {/* Media Type & Media URL */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Media Type
                    </label>
                    <div className="flex rounded-xl p-1 bg-slate-100 border border-slate-200">
                      <button
                        type="button"
                        onClick={() => handleChange('mediaType', 'image')}
                        className={`flex-1 py-1.5 rounded-lg text-xs font-bold flex items-center justify-center gap-1 transition-colors cursor-pointer ${
                          formData.mediaType === 'image'
                            ? 'bg-white text-[#F7931E] shadow-xs'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        <ImageIcon className="w-3.5 h-3.5" />
                        Image
                      </button>
                      <button
                        type="button"
                        onClick={() => handleChange('mediaType', 'video')}
                        className={`flex-1 py-1.5 rounded-lg text-xs font-bold flex items-center justify-center gap-1 transition-colors cursor-pointer ${
                          formData.mediaType === 'video'
                            ? 'bg-white text-[#F7931E] shadow-xs'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        <VideoIcon className="w-3.5 h-3.5" />
                        Video
                      </button>
                    </div>
                  </div>

                  <div className="sm:col-span-2">
                    <div className="flex items-center justify-between mb-1">
                      <label className="block text-xs font-bold text-slate-700">
                        Banner Image URL / Poster Link
                      </label>
                      {formData.mediaUrl?.startsWith('data:') && (
                        <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                          ✓ Local File Loaded & Compressed
                        </span>
                      )}
                    </div>
                    <input
                      type="text"
                      value={formData.mediaUrl?.startsWith('data:') ? '[Local Poster: Auto-Compressed for Google Sheets]' : formData.mediaUrl}
                      onChange={(e) => handleChange('mediaUrl', e.target.value)}
                      placeholder="https://... or /assets/campus-ads/hackathon-2026.jpg"
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 focus:border-[#F7931E] focus:ring-2 focus:ring-orange-200 text-xs sm:text-sm outline-hidden font-mono text-slate-700 transition-all"
                    />
                  </div>
                </div>

                {/* Local Poster Picker helper */}
                <div className="p-3 bg-amber-50/70 border border-amber-200/60 rounded-xl flex items-center justify-between gap-3 text-xs">
                  <div className="flex items-center gap-2 text-amber-900">
                    <UploadCloud className="w-4 h-4 text-amber-600 shrink-0" />
                    <span>
                      {localFilePreview
                        ? 'Local poster ready! It will be optimized and saved to Google Sheets.'
                        : 'Or choose local poster file from your device (Auto-optimized):'}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {localFilePreview && (
                      <button
                        type="button"
                        onClick={handleClearLocalFile}
                        className="px-2.5 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg font-bold text-[11px] cursor-pointer transition-colors"
                      >
                        Reset / Use URL
                      </button>
                    )}
                    <label className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg font-bold text-[11px] cursor-pointer shrink-0 transition-colors shadow-xs">
                      {localFilePreview ? 'Change File' : 'Browse File'}
                      <input
                        type="file"
                        accept="image/*,video/*"
                        onChange={handleFileUpload}
                        className="hidden"
                      />
                    </label>
                  </div>
                </div>

                {/* Action URL & Button Text */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Button Label
                    </label>
                    <input
                      type="text"
                      value={formData.buttonText}
                      onChange={(e) => handleChange('buttonText', e.target.value)}
                      placeholder="e.g. Register Free →, Join WhatsApp"
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 focus:border-[#F7931E] focus:ring-2 focus:ring-orange-200 text-xs sm:text-sm outline-hidden font-semibold transition-all"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Destination Link (Click URL)
                    </label>
                    <input
                      type="url"
                      value={formData.clickUrl}
                      onChange={(e) => handleChange('clickUrl', e.target.value)}
                      placeholder="https://forms.google.com/... or https://unstop.com/..."
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 focus:border-[#F7931E] focus:ring-2 focus:ring-orange-200 text-xs sm:text-sm outline-hidden font-mono text-slate-700 transition-all"
                    />
                  </div>
                </div>

                {/* Dates & Priority & Placement */}
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 pt-1">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Start Date
                    </label>
                    <input
                      type="date"
                      value={formData.startDate}
                      onChange={(e) => handleChange('startDate', e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:border-[#F7931E] text-xs outline-hidden font-medium"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      End Date
                    </label>
                    <input
                      type="date"
                      value={formData.endDate}
                      onChange={(e) => handleChange('endDate', e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:border-[#F7931E] text-xs outline-hidden font-medium"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Priority (1=Top)
                    </label>
                    <input
                      type="number"
                      min="1"
                      max="99"
                      value={formData.priority}
                      onChange={(e) => handleChange('priority', parseInt(e.target.value) || 1)}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:border-[#F7931E] text-xs outline-hidden font-bold"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Status
                    </label>
                    <select
                      value={formData.status}
                      onChange={(e) => handleChange('status', e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:border-[#F7931E] text-xs outline-hidden font-bold bg-white text-emerald-700"
                    >
                      <option value="approved">Approved (Live)</option>
                      <option value="pending">Pending (Draft)</option>
                    </select>
                  </div>
                </div>

                {/* Submission Result Notice */}
                {submitResult && (
                  <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={`p-4 rounded-2xl border text-xs sm:text-sm font-semibold flex items-start gap-3 ${
                      submitResult.success
                        ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                        : 'bg-rose-50 border-rose-200 text-rose-800'
                    }`}
                  >
                    {submitResult.success ? (
                      <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                    ) : (
                      <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
                    )}
                    <div className="flex-1">
                      <p className="font-bold">
                        {submitResult.success ? 'Success! Ad Published.' : 'Submission Error'}
                      </p>
                      <p className="text-xs opacity-90 mt-0.5">
                        {submitResult.message || submitResult.error}
                      </p>
                      {submitResult.success && (
                        <div className="mt-2 flex items-center gap-2">
                          <span className="font-mono bg-white px-2 py-0.5 rounded-md border border-emerald-300 text-emerald-700 font-bold text-xs">
                            ID: {submitResult.adId}
                          </span>
                          <span className="text-[11px] text-emerald-700 font-medium">
                            Saved in Google Sheet tab "XBuddy Ads"
                          </span>
                        </div>
                      )}
                    </div>
                  </motion.div>
                )}

                {/* Submit Button */}
                <div className="pt-3">
                  <button
                    type="submit"
                    disabled={submitting}
                    className="w-full py-3.5 px-6 rounded-2xl bg-gradient-to-r from-[#F7931E] via-[#FF6B00] to-[#EB740A] hover:from-[#FF9C26] hover:to-[#DE6000] text-white font-black text-sm sm:text-base shadow-xl shadow-orange-500/25 hover:shadow-orange-500/35 transition-all transform hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-50 disabled:pointer-events-none cursor-pointer flex items-center justify-center gap-2"
                  >
                    {submitting ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        <span>Saving to Google Sheets...</span>
                      </>
                    ) : (
                      <>
                        <Send className="w-4 h-4" />
                        <span>Publish Ad to XBuddy Website</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>

            {/* Right Column: Live Interactive Preview (5 cols) */}
            <div className="lg:col-span-5 space-y-4">
              <div className="bg-slate-900 rounded-3xl p-5 border border-slate-800 text-white shadow-xl shadow-black/10">
                <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-4">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
                    <span className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                      Live Student Screen Preview
                    </span>
                  </div>
                  <span className="px-2 py-0.5 rounded-md bg-orange-500/20 text-[#F7931E] text-[10px] font-bold">
                    Real-time
                  </span>
                </div>

                <p className="text-xs text-slate-400 mb-4 leading-relaxed">
                  This is the exact card rendered on the <strong>Student Waiting / Order Status</strong> screen while prints are running:
                </p>

                {/* Native Preview Card using CampusPromotionAd */}
                <div className="rounded-2xl overflow-hidden bg-white text-slate-900 shadow-lg">
                  <CampusPromotionAd customAd={previewAd} />
                </div>

                <div className="mt-4 pt-3 border-t border-slate-800/80 flex items-center justify-between text-[11px] text-slate-400">
                  <span>Target: Order Status Screen</span>
                  <span>Priority: #{formData.priority}</span>
                </div>
              </div>

              {/* Tips & Instructions Card */}
              <div className="bg-orange-50/70 rounded-3xl p-5 border border-orange-200/80 text-xs text-slate-700 space-y-2.5">
                <h4 className="font-bold text-slate-900 flex items-center gap-1.5 text-sm">
                  💡 How does XBuddy Ads work?
                </h4>
                <ul className="space-y-1.5 text-[11px] leading-relaxed text-slate-600">
                  <li className="flex items-start gap-1.5">
                    <span className="text-orange-500 font-bold">•</span>
                    <span><strong>Separate Sheet:</strong> Ads are saved strictly into the <code>XBuddy Ads</code> spreadsheet, keeping order data completely isolated.</span>
                  </li>
                  <li className="flex items-start gap-1.5">
                    <span className="text-orange-500 font-bold">•</span>
                    <span><strong>Live Instant Sync:</strong> When status is set to <strong>Approved</strong>, it is immediately fetched and shown to students who place Xerox orders.</span>
                  </li>
                  <li className="flex items-start gap-1.5">
                    <span className="text-orange-500 font-bold">•</span>
                    <span><strong>Priority Sorting:</strong> Priority 1 is shown before priority 2.</span>
                  </li>
                </ul>
              </div>
            </div>
          </div>
        ) : (
          /* Live Ads Tab */
          <div className="bg-white rounded-3xl p-6 border border-orange-100 shadow-xl shadow-orange-500/5">
            <div className="flex items-center justify-between mb-6 pb-4 border-b border-slate-100">
              <div>
                <h3 className="text-base font-black text-slate-900">
                  Active Advertisements in Google Sheet
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Fetched directly from spreadsheet tab <code className="text-[#F7931E]">XBuddy Ads</code>
                </p>
              </div>
              <button
                onClick={loadExistingAds}
                disabled={loadingLiveAds}
                className="px-3.5 py-1.5 rounded-xl bg-orange-50 hover:bg-orange-100 text-[#F7931E] border border-orange-200 text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-colors"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loadingLiveAds ? 'animate-spin' : ''}`} />
                <span>Reload Sheet</span>
              </button>
            </div>

            {loadingLiveAds ? (
              <div className="py-12 text-center text-slate-400">
                <RefreshCw className="w-8 h-8 mx-auto animate-spin text-[#F7931E] mb-2" />
                <p className="text-xs font-semibold">Fetching ads from Google Sheets...</p>
              </div>
            ) : liveAdsList.length === 0 ? (
              <div className="py-12 text-center text-slate-400">
                <p className="text-base font-bold text-slate-600 mb-1">No active ads returned</p>
                <p className="text-xs text-slate-400 mb-4">Use the form tab to publish the first campus advertisement!</p>
                <button
                  onClick={() => setActiveTab('create')}
                  className="px-4 py-2 bg-[#F7931E] text-white rounded-xl text-xs font-bold cursor-pointer"
                >
                  Create First Ad →
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {liveAdsList.map((item, idx) => (
                  <div
                    key={item.adId || idx}
                    className="p-4 rounded-2xl border border-slate-200/80 bg-slate-50/50 hover:bg-white hover:border-orange-200 transition-all flex flex-col justify-between gap-3 shadow-xs"
                  >
                    <div>
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <span className="font-mono text-xs font-black text-slate-700 bg-white px-2 py-0.5 rounded-md border border-slate-200">
                          {item.adId}
                        </span>
                        <div className="flex items-center gap-1.5">
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-700 uppercase">
                            {item.status || 'approved'}
                          </span>
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-orange-100 text-orange-700">
                            P-{item.priority || 1}
                          </span>
                        </div>
                      </div>

                      <p className="text-[11px] font-bold text-[#F7931E] uppercase tracking-wider">
                        {item.clubName}
                      </p>
                      <h4 className="text-sm font-black text-slate-900 line-clamp-1 mt-0.5">
                        {item.title}
                      </h4>
                      <p className="text-xs text-slate-600 line-clamp-2 mt-1 leading-relaxed">
                        {item.description}
                      </p>
                    </div>

                    <div className="pt-2 border-t border-slate-200/60 flex items-center justify-between text-[11px] text-slate-500">
                      <span>Valid: {item.startDate} to {item.endDate}</span>
                      {item.clickUrl && (
                        <a
                          href={item.clickUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[#F7931E] hover:underline font-semibold flex items-center gap-0.5"
                        >
                          Link <ExternalLink className="w-3 h-3" />
                        </a>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
