import React from 'react'
import { Phone, Mail, MapPin, Link, Globe } from 'lucide-react'
import EditableText from '../components/EditableText'
import { useResume } from '../resumeStore'

// Executive / Corporate Template — Traditional single-column, serif typography, navy accents

function Section({ title, children }) {
  return (
    <div style={{ marginBottom: '16px' }}>
      <div style={{
        fontSize: '11px',
        fontWeight: '700',
        letterSpacing: '1.2px',
        textTransform: 'uppercase',
        color: '#1e3a8a', // Navy accent
        borderBottom: '1.5px solid #1e3a8a',
        paddingBottom: '3px',
        marginBottom: '9px',
        fontFamily: "'Georgia', 'Garamond', serif",
      }}>
        {title}
      </div>
      {children}
    </div>
  )
}

export default function ExecutiveTemplate({ data, fontScale = 1 }) {
  const f = (n) => `${n * fontScale}px`
  const { updatePersonal, updateSkills, updateListItem, updateAchievements } = useResume()
  const { personal, education, skills, projects, experience, certifications, achievements } = data
  const edu = education[0] || {}

  const hasSkills = Boolean(skills.languages || skills.frameworks || skills.tools || skills.soft)

  return (
    <div style={{
      fontFamily: "'Georgia', 'Garamond', 'Times New Roman', serif",
      fontSize: f(10.5),
      color: '#1e293b',
      lineHeight: '1.6',
      padding: '24mm 20mm',
      background: '#fff',
      minHeight: '297mm',
      width: '210mm',
      boxSizing: 'border-box',
    }}>
      {/* Conservative Header */}
      <div style={{ textAlign: 'center', marginBottom: '20px', borderBottom: '2px solid #1e3a8a', paddingBottom: '14px' }}>
        <div style={{
          fontSize: f(24),
          fontWeight: '700',
          color: '#1e3a8a',
          letterSpacing: '0.5px',
          textTransform: 'uppercase',
          marginBottom: '6px',
        }}>
          <EditableText
            value={personal.name}
            placeholder="YOUR NAME"
            onChange={v => updatePersonal('name', v)}
          />
        </div>

        <div style={{
          fontSize: '9.5px',
          color: '#475569',
          fontFamily: "'Arial', 'Helvetica', sans-serif",
          display: 'flex',
          justifyContent: 'center',
          flexWrap: 'wrap',
          gap: '12px',
        }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}><Phone size={10} strokeWidth={2} /> <EditableText value={personal.phone} placeholder="Phone" onChange={v => updatePersonal('phone', v)} /></span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}><Mail size={10} strokeWidth={2} /> <EditableText value={personal.email} placeholder="Email" onChange={v => updatePersonal('email', v)} /></span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}><MapPin size={10} strokeWidth={2} /> <EditableText value={personal.location} placeholder="Location" onChange={v => updatePersonal('location', v)} /></span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}><Link size={10} strokeWidth={2} /> <EditableText value={personal.linkedin} placeholder="LinkedIn" onChange={v => updatePersonal('linkedin', v)} /></span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}><Globe size={10} strokeWidth={2} /> <EditableText value={personal.portfolio} placeholder="Portfolio" onChange={v => updatePersonal('portfolio', v)} /></span>
        </div>
      </div>

      {/* Education */}
      {(edu.college || edu.degree) && (
        <Section title="Education">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <div style={{ fontWeight: '700', fontSize: '11px', color: '#0f172a' }}>
                <EditableText value={edu.college} placeholder="College Name" onChange={v => updateListItem('education', edu.id, 'college', v)} />
              </div>
              <div style={{ color: '#334155', fontSize: '10px', fontStyle: 'italic' }}>
                <EditableText value={edu.degree} placeholder="Degree" onChange={v => updateListItem('education', edu.id, 'degree', v)} />
                {edu.department ? ' in ' : ''}
                <EditableText value={edu.department} placeholder="Department" onChange={v => updateListItem('education', edu.id, 'department', v)} />
              </div>
              {edu.intermediate && (
                <div style={{ color: '#64748b', fontSize: '9.5px', marginTop: '2px' }}>
                  Intermediate: <EditableText value={edu.intermediate} placeholder="Intermediate" onChange={v => updateListItem('education', edu.id, 'intermediate', v)} />
                </div>
              )}
              {edu.schooling && (
                <div style={{ color: '#64748b', fontSize: '9.5px' }}>
                  Schooling: <EditableText value={edu.schooling} placeholder="Schooling" onChange={v => updateListItem('education', edu.id, 'schooling', v)} />
                </div>
              )}
            </div>
            <div style={{ textAlign: 'right', fontSize: '9.5px', color: '#475569', fontFamily: "'Arial', sans-serif" }}>
              <div><EditableText value={edu.year} placeholder="Year" onChange={v => updateListItem('education', edu.id, 'year', v)} /></div>
              <div style={{ fontWeight: '700', color: '#1e3a8a' }}>
                CGPA / Score: <EditableText value={edu.cgpa} placeholder="Score" onChange={v => updateListItem('education', edu.id, 'cgpa', v)} />
              </div>
            </div>
          </div>
        </Section>
      )}

      {/* Professional Experience */}
      {experience.some(e => e.role || e.company) && (
        <Section title="Professional Experience">
          {experience.filter(e => e.role || e.company).map(exp => (
            <div key={exp.id} style={{ marginBottom: '12px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <span style={{ fontWeight: '700', fontSize: '11px', color: '#0f172a' }}>
                  <EditableText value={exp.role} placeholder="Role" onChange={v => updateListItem('experience', exp.id, 'role', v)} />
                </span>
                <span style={{ fontSize: '9.5px', color: '#64748b', fontFamily: "'Arial', sans-serif" }}>
                  <EditableText value={exp.duration} placeholder="Duration" onChange={v => updateListItem('experience', exp.id, 'duration', v)} />
                </span>
              </div>
              <div style={{ color: '#1e3a8a', fontSize: '10px', fontWeight: '600', fontStyle: 'italic', marginBottom: '3px' }}>
                <EditableText value={exp.company} placeholder="Company" onChange={v => updateListItem('experience', exp.id, 'company', v)} />
              </div>
              {exp.description && (
                <div style={{ color: '#334155', fontSize: '9.5px', lineHeight: '1.5', whiteSpace: 'pre-line' }}>
                  <EditableText value={exp.description} placeholder="Responsibilities and impact..." multiline onChange={v => updateListItem('experience', exp.id, 'description', v)} />
                </div>
              )}
            </div>
          ))}
        </Section>
      )}

      {/* Key Projects */}
      {projects.some(p => p.title) && (
        <Section title="Key Projects & Initiatives">
          {projects.filter(p => p.title).map(proj => (
            <div key={proj.id} style={{ marginBottom: '11px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <span style={{ fontWeight: '700', fontSize: '11px', color: '#0f172a' }}>
                  <EditableText value={proj.title} placeholder="Title" onChange={v => updateListItem('projects', proj.id, 'title', v)} />
                </span>
                <span style={{ fontSize: '9px', color: '#1e3a8a', fontFamily: "'Arial', sans-serif" }}>
                  <EditableText value={proj.link} placeholder="Link" onChange={v => updateListItem('projects', proj.id, 'link', v)} />
                </span>
              </div>
              <div style={{ color: '#334155', fontSize: '9.5px', marginTop: '2px', lineHeight: '1.5' }}>
                <EditableText value={proj.description} placeholder="Description..." multiline onChange={v => updateListItem('projects', proj.id, 'description', v)} />
              </div>
              <div style={{ fontSize: '9px', color: '#64748b', marginTop: '2.5px', fontStyle: 'italic' }}>
                Focus: <EditableText value={proj.tech} placeholder="Technologies" onChange={v => updateListItem('projects', proj.id, 'tech', v)} />
              </div>
            </div>
          ))}
        </Section>
      )}

      {/* Skills & Competencies */}
      {hasSkills && (
        <Section title="Technical & Functional Competencies">
          <div style={{ fontSize: '9.5px', color: '#334155', lineHeight: '1.6' }}>
            <div style={{ marginBottom: '3px' }}>
              <strong style={{ color: '#0f172a' }}>Core Languages: </strong>
              <EditableText value={skills.languages} placeholder="Languages" onChange={v => updateSkills('languages', v)} />
            </div>
            <div style={{ marginBottom: '3px' }}>
              <strong style={{ color: '#0f172a' }}>Frameworks & Libraries: </strong>
              <EditableText value={skills.frameworks} placeholder="Frameworks" onChange={v => updateSkills('frameworks', v)} />
            </div>
            <div style={{ marginBottom: '3px' }}>
              <strong style={{ color: '#0f172a' }}>Tools & Platforms: </strong>
              <EditableText value={skills.tools} placeholder="Tools" onChange={v => updateSkills('tools', v)} />
            </div>
            <div>
              <strong style={{ color: '#0f172a' }}>Management & Leadership: </strong>
              <EditableText value={skills.soft} placeholder="Competencies" onChange={v => updateSkills('soft', v)} />
            </div>
          </div>
        </Section>
      )}

      {/* Certifications */}
      {certifications.some(c => c.course) && (
        <Section title="Certifications & Training">
          {certifications.filter(c => c.course).map(cert => (
            <div key={cert.id} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px', fontSize: '9.5px' }}>
              <div>
                <strong style={{ color: '#0f172a' }}>
                  <EditableText value={cert.course} placeholder="Course" onChange={v => updateListItem('certifications', cert.id, 'course', v)} />
                </strong>
                <span style={{ color: '#475569' }}>
                  {' — '}
                  <EditableText value={cert.platform} placeholder="Platform" onChange={v => updateListItem('certifications', cert.id, 'platform', v)} />
                </span>
              </div>
              <span style={{ color: '#64748b', fontFamily: "'Arial', sans-serif" }}>
                <EditableText value={cert.year} placeholder="Year" onChange={v => updateListItem('certifications', cert.id, 'year', v)} />
              </span>
            </div>
          ))}
        </Section>
      )}

      {/* Achievements */}
      {achievements && (
        <Section title="Honors & Achievements">
          <div style={{ color: '#334155', fontSize: '9.5px', whiteSpace: 'pre-line', lineHeight: '1.5' }}>
            <EditableText value={achievements} placeholder="Achievements..." multiline onChange={v => updateAchievements(v)} />
          </div>
        </Section>
      )}
    </div>
  )
}
