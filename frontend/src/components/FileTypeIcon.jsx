import React from 'react'
import {
  FileText,
  FileEdit,
  Presentation,
  FileSpreadsheet,
  FileCode,
  Image as ImageIcon,
  Palette,
  Globe,
} from 'lucide-react'

export default function FileTypeIcon({ typeInfo, className = 'w-6 h-6' }) {
  if (!typeInfo) {
    return <FileText className={className} />
  }

  const label = (typeInfo.label || '').toUpperCase()
  const category = typeInfo.category || ''

  if (label === 'PDF' || label === 'RTF') {
    return <FileText className={className} />
  }
  if (label === 'DOC' || label === 'DOCX') {
    return <FileEdit className={className} />
  }
  if (label === 'PPT' || label === 'PPTX') {
    return <Presentation className={className} />
  }
  if (label === 'XLS' || label === 'XLSX') {
    return <FileSpreadsheet className={className} />
  }
  if (label === 'TXT') {
    return <FileCode className={className} />
  }
  if (label === 'SVG') {
    return <Palette className={className} />
  }
  if (label === 'HTML') {
    return <Globe className={className} />
  }
  if (category === 'image') {
    return <ImageIcon className={className} />
  }

  return <FileText className={className} />
}
