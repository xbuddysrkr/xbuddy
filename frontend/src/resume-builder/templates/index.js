import ModernTemplate       from './ModernTemplate'
import MinimalTemplate      from './MinimalTemplate'
import CreativeTemplate     from './CreativeTemplate'
import ExecutiveTemplate    from './ExecutiveTemplate'
import AtsElegantTemplate   from './AtsElegantTemplate'
import TwoColumnTechTemplate from './TwoColumnTechTemplate'

export const TEMPLATES = [
  {
    id: 'modern',
    label: 'Modern Professional',
    desc: 'Purple accents, clean sections, great for CS/IT roles',
    component: ModernTemplate,
    accent: '#7c3aed',
  },
  {
    id: 'minimal',
    label: 'Minimal ATS',
    desc: 'Black & white, maximum ATS compatibility, no frills',
    component: MinimalTemplate,
    accent: '#111111',
  },
  {
    id: 'creative',
    label: 'Creative Modern',
    desc: 'Two-column sidebar, bold header, stands out visually',
    component: CreativeTemplate,
    accent: '#4c1d95',
  },
  {
    id: 'executive',
    label: 'Executive Corporate',
    desc: 'Classic conservative layout with navy accents, ideal for corporate & consulting',
    component: ExecutiveTemplate,
    accent: '#1e3a8a',
  },
  {
    id: 'ats-elegant',
    label: 'ATS-Safe Elegant',
    desc: 'Refined single-column text layout optimized for ATS scanners with zero emojis',
    component: AtsElegantTemplate,
    accent: '#334155',
  },
  {
    id: 'two-column-tech',
    label: 'Two-Column Technical',
    desc: 'Sidebar for skills & education, main column for experience & projects',
    component: TwoColumnTechTemplate,
    accent: '#0f766e',
  },
]

export function getTemplate(id) {
  return TEMPLATES.find(t => t.id === id) || TEMPLATES[0]
}
