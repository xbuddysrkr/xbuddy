import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { CircleDot, Palette, FileText, Copy, Check, Settings, ChevronDown, ArrowUpDown, ArrowLeftRight } from 'lucide-react'
import FileTypeIcon from './FileTypeIcon'
import { parsePageRange } from '../utils/pageRangeParser'
import { calcPriceBreakdown } from '../utils/pricing'

function OptionButton({ active, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`
        flex-1 py-2.5 px-3 rounded-xl font-medium text-sm transition-all duration-200
        ${active
          ? 'bg-[#F78C25] text-white shadow-sm'
          : 'bg-white text-gray-500 hover:bg-orange-50 border border-orange-100'
        }
      `}
    >
      {children}
    </button>
  )
}

function SettingCard({ title, children }) {
  return (
    <div className="bg-white border border-orange-100 rounded-2xl p-5 shadow-sm">
      <p className="text-gray-500 text-xs font-semibold uppercase tracking-wider mb-3">{title}</p>
      {children}
    </div>
  )
}

export default function PrintSettings({ fileInfo, settings, onChange }) {
  const { colorMode, sideMode, copies, pageSize, orientation, margins, pageRange, customPages, imageFit } = settings
  const [showMoreOptions, setShowMoreOptions] = useState(false)

  const isImage = fileInfo?.typeInfo?.category === 'image'
  const isDocument = fileInfo?.typeInfo?.category === 'document'

  function set(key, value) {
    onChange(prev => ({ ...prev, [key]: value }))
  }

  // Check if custom page range is valid
  const customParse = parsePageRange(customPages, fileInfo.totalPages)

  // Has non-default advanced options selected
  const hasCustomAdvanced = pageSize !== 'A4' || orientation !== 'portrait' || margins !== 'normal' || (pageRange === 'custom' && customPages.trim().length > 0)

  // Calculate live breakdown for custom range preview
  const customBreakdown = customParse.valid && customPages.trim().length > 0
    ? calcPriceBreakdown({
        totalPages: fileInfo.totalPages,
        colorMode,
        isDoubleSide: sideMode === 'double',
        copies,
        pageRange: 'custom',
        selectedPages: customParse.selectedPages,
      })
    : null

  return (
    <motion.section initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="max-w-2xl mx-auto px-4 py-4">
      {/* File info card */}
      <div className="bg-white border border-orange-100 rounded-2xl p-4 mb-6 flex items-center gap-4 shadow-sm">
        <div className="w-12 h-14 rounded-xl border border-orange-200 bg-orange-50 flex-shrink-0 overflow-hidden flex items-center justify-center">
          {fileInfo.thumbnail
            ? <img src={fileInfo.thumbnail} alt="preview" className="w-full h-full object-cover" />
            : <FileTypeIcon typeInfo={fileInfo.typeInfo} className="w-6 h-6 text-[#F78C25]" />
          }
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span className="px-1.5 py-0.5 rounded bg-orange-100 text-[#F78C25] text-xs font-bold">
              {fileInfo.typeInfo?.label || 'FILE'}
            </span>
            {fileInfo.requiresAgent && (
              <span className="px-1.5 py-0.5 rounded bg-yellow-100 text-yellow-600 text-xs">Agent Required</span>
            )}
          </div>
          <p className="text-[#222222] font-medium truncate text-sm">{fileInfo.name}</p>
          <p className="text-gray-400 text-xs">{fileInfo.size}</p>
        </div>
        <div className="text-right flex-shrink-0">
          <p className="text-[#F78C25] font-bold text-xl">{fileInfo.totalPages}</p>
          <p className="text-gray-400 text-xs">pages</p>
        </div>
      </div>

      <h2 className="text-2xl font-bold text-[#222222] mb-5">Print Settings</h2>

      <div className="space-y-4">
        {/* Color Mode */}
        <SettingCard title="Print Type">
          <div className="flex gap-2">
            <OptionButton active={colorMode === 'bw'} onClick={() => set('colorMode', 'bw')}>
              <span className="inline-flex items-center justify-center gap-1.5">
                <CircleDot className="w-3.5 h-3.5" /> B&amp;W — ₹2/page
              </span>
            </OptionButton>
            <OptionButton active={colorMode === 'color'} onClick={() => set('colorMode', 'color')}>
              <span className="inline-flex items-center justify-center gap-1.5">
                <Palette className="w-3.5 h-3.5" /> Color — ₹5/page
              </span>
            </OptionButton>
          </div>
        </SettingCard>

        {/* Side Mode */}
        <SettingCard title="Print Side">
          <div className="flex gap-2">
            <OptionButton active={sideMode === 'single'} onClick={() => set('sideMode', 'single')}>
              <span className="inline-flex items-center justify-center gap-1.5">
                <FileText className="w-3.5 h-3.5" /> Single Side
              </span>
            </OptionButton>
            <OptionButton active={sideMode === 'double'} onClick={() => set('sideMode', 'double')}>
              <span className="inline-flex items-center justify-center gap-1.5">
                <Copy className="w-3.5 h-3.5" /> Double Side
              </span>
            </OptionButton>
          </div>
          {sideMode === 'double' && (
            <p className="text-[#F78C25] text-xs mt-2 flex items-center gap-1.5">
              <Check className="w-3.5 h-3.5 shrink-0" />
              <span>Double side prints both sides — halves paper sheets!</span>
            </p>
          )}
        </SettingCard>

        {/* Copies */}
        <SettingCard title="Number of Copies">
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={() => set('copies', Math.max(1, copies - 1))}
              className="w-10 h-10 rounded-xl bg-orange-50 hover:bg-orange-100 border border-orange-200 text-[#F78C25] font-bold text-lg transition-all flex items-center justify-center"
            >−</button>
            <span className="text-3xl font-bold text-[#222222] w-12 text-center">{copies}</span>
            <button
              type="button"
              onClick={() => set('copies', Math.min(99, copies + 1))}
              className="w-10 h-10 rounded-xl bg-orange-50 hover:bg-orange-100 border border-orange-200 text-[#F78C25] font-bold text-lg transition-all flex items-center justify-center"
            >+</button>
            <span className="text-gray-400 text-sm ml-2">{copies > 1 ? `${copies} copies` : '1 copy'}</span>
          </div>
        </SettingCard>

        {/* Toggle Button for More Options */}
        <button
          type="button"
          onClick={() => setShowMoreOptions(prev => !prev)}
          className="w-full py-3.5 px-5 rounded-2xl bg-white border border-orange-200 text-[#F78C25] font-bold text-sm flex items-center justify-between shadow-xs hover:bg-orange-50/70 transition-all duration-200"
        >
          <span className="flex items-center gap-2">
            <Settings className="w-4 h-4 text-[#F78C25]" /> More Options
            {hasCustomAdvanced && (
              <span className="px-2 py-0.5 rounded-full bg-orange-100 text-[#F78C25] text-[10px] font-extrabold uppercase tracking-wide">
                Custom
              </span>
            )}
          </span>
          <ChevronDown
            className={`w-4 h-4 text-gray-400 transition-transform duration-200 ${showMoreOptions ? 'rotate-180' : ''}`}
          />
        </button>

        {/* Collapsible Advanced Options */}
        <AnimatePresence>
          {showMoreOptions && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.25, ease: 'easeInOut' }}
              className="space-y-4 overflow-hidden pt-1"
            >
              {/* Page Size + Orientation */}
              <div className="grid grid-cols-2 gap-4">
                <SettingCard title="Page Size">
                  <div className="flex flex-col gap-2">
                    {['A4', 'Letter', 'Legal'].map(s => (
                      <OptionButton key={s} active={pageSize === s} onClick={() => set('pageSize', s)}>{s}</OptionButton>
                    ))}
                  </div>
                </SettingCard>
                <SettingCard title="Orientation">
                  <div className="flex flex-col gap-2">
                    <OptionButton active={orientation === 'portrait'} onClick={() => set('orientation', 'portrait')}>
                      <span className="inline-flex items-center justify-center gap-1.5">
                        <ArrowUpDown className="w-3.5 h-3.5" /> Portrait
                      </span>
                    </OptionButton>
                    <OptionButton active={orientation === 'landscape'} onClick={() => set('orientation', 'landscape')}>
                      <span className="inline-flex items-center justify-center gap-1.5">
                        <ArrowLeftRight className="w-3.5 h-3.5" /> Landscape
                      </span>
                    </OptionButton>
                  </div>
                </SettingCard>
              </div>

              {/* Margins */}
              <SettingCard title="Margins">
                <div className="flex gap-2">
                  {[
                    { key: 'normal',  label: 'Normal' },
                    { key: 'narrow',  label: 'Narrow' },
                    { key: 'wide',    label: 'Wide'   },
                    { key: 'none',    label: 'None'   },
                  ].map(m => (
                    <OptionButton key={m.key} active={margins === m.key} onClick={() => set('margins', m.key)}>{m.label}</OptionButton>
                  ))}
                </div>
              </SettingCard>

              {/* Image Fit — only for images */}
              {isImage && (
                <SettingCard title="Image Fit">
                  <div className="flex gap-2">
                    <OptionButton active={imageFit === 'fit'}     onClick={() => set('imageFit', 'fit')}>Fit to Page</OptionButton>
                    <OptionButton active={imageFit === 'fill'}    onClick={() => set('imageFit', 'fill')}>Crop to Fill</OptionButton>
                    <OptionButton active={imageFit === 'stretch'} onClick={() => set('imageFit', 'stretch')}>Stretch</OptionButton>
                  </div>
                </SettingCard>
              )}

              {/* Page Range */}
              {(Number(fileInfo?.totalPages) || 1) >= 1 && (
                <SettingCard title="Page Range">
                  <div className="flex gap-2 mb-3">
                    <OptionButton active={pageRange === 'all'}    onClick={() => set('pageRange', 'all')}>All Pages</OptionButton>
                    <OptionButton active={pageRange === 'custom'} onClick={() => set('pageRange', 'custom')}>Custom Range</OptionButton>
                  </div>
                  {pageRange === 'custom' && (
                    <div className="space-y-2">
                      <input
                        type="text"
                        value={customPages}
                        onChange={e => set('customPages', e.target.value)}
                        placeholder="e.g. 1-3, 5, 7-9"
                        className={`w-full bg-[#FFF8F2] border rounded-xl px-4 py-2.5 text-sm text-[#222222] focus:outline-none transition-colors ${
                          customPages.trim() && !customParse.valid
                            ? 'border-rose-400 focus:border-rose-500'
                            : 'border-orange-200 focus:border-[#F78C25]'
                        }`}
                      />
                      {customPages.trim().length === 0 && (
                        <p className="text-amber-600 text-xs font-medium">Enter a valid page number or range.</p>
                      )}
                      {customPages.trim().length > 0 && !customParse.valid && (
                        <p className="text-rose-500 text-xs font-medium">{customParse.error}</p>
                      )}
                      {customPages.trim().length > 0 && customParse.valid && customBreakdown && (
                        <div className="p-3.5 bg-orange-50/80 border border-orange-200 rounded-xl text-xs space-y-1.5 text-gray-700 mt-2">
                          <div className="flex justify-between">
                            <span className="text-gray-500">Selected Pages:</span>
                            <span className="font-semibold text-gray-800">{customParse.selectedPages.length}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-500">Copies:</span>
                            <span className="font-semibold text-gray-800">× {copies}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-500">Printable Pages:</span>
                            <span className="font-semibold text-gray-800">{customParse.selectedPages.length} × {copies} = {customParse.selectedPages.length * copies}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-500">Printing Cost:</span>
                            <span className="font-semibold text-gray-800">₹{customBreakdown.printingCost}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-500">Digital Processing Fee:</span>
                            <span className="font-semibold text-gray-800">+₹{customBreakdown.digitalProcessingFee}</span>
                          </div>
                          <div className="flex justify-between border-t border-orange-200 pt-2 mt-1">
                            <span className="font-medium text-gray-800 font-bold">Total:</span>
                            <span className="font-bold text-[#F78C25] text-sm">₹{customBreakdown.totalAmount}</span>
                          </div>
                        </div>
                      )}
                      <p className="text-gray-400 text-xs mt-1">Enter page numbers or ranges separated by commas (e.g. 1-5, 8, 10-12)</p>
                    </div>
                  )}
                </SettingCard>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.section>
  )
}

