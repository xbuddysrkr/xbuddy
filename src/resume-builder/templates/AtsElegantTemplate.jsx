import React from 'react'
import EditableText from '../components/EditableText'
import { useResume } from '../resumeStore'

// ATS-Safe Elegant Template — High ATS parse rate, clean typography, zero emoji icons

function Section({ title, children }) {
  return (
    <div style={{ marginBottom: '15px' }}>
      <div style={{
        fontSize: '10.5px',
        fontWeight: '700',
        letterSpacing: '1.8px',
        textTransform: 'uppercase',
        color: '#1e293b',
        borderBottom: '1px solid #cbd5e1',
        paddingBottom: '3px',
        marginBottom: '8px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}>
        <span>{title}</span>
      </div>
      {children}
    </div>
  )
}

export default function AtsElegantTemplate({ data, fontScale = 1 }) {
  const f = (n) => `${n * fontScale}px`
  const { updatePersonal, updateSkills, updateListItem, updateAchievements } = useResume()
  const { personal, education, skills, projects, experience, certifications, achievements } = data
  const edu = education[0] || {}

  const hasSkills = Boolean(skills.languages || skills.frameworks || skills.tools || skills.soft)

  return (
    <div style={{
      fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif",
      fontSize: f(10),
      color: '#1e293b',
      lineHeight: '1.55',
      padding: '24mm 20mm',
      background: '#fff',
      minHeight: '297mm',
      width: '210mm',
      boxSizing: 'border-box',
    }}>
      {/* Refined ATS Header - Plain text, no emoji icons */}
      <div style={{ textAlign: 'center', marginBottom: '18px', borderBottom: '1px solid #e2e8f0', paddingBottom: '12px' }}>
        <div style={{
          fontSize: f(23),
          fontWeight: '800',
          color: '#0f172a',
          letterSpacing: '0.8px',
          textTransform: 'uppercase',
          marginBottom: '5px',
        }}>
          <EditableText
            value={personal.name}
            placeholder="YOUR NAME"
            onChange={v => updatePersonal('name', v)}
          />
        </div>

        <div style={{
          fontSize: '9px',
          color: '#475569',
          display: 'flex',
          justifyContent: 'center',
          flexWrap: 'wrap',
          gap: '8px',
          lineHeight: '1.4',
        }}>
          <span><EditableText value={personal.phone} placeholder="Phone" onChange={v => updatePersonal('phone', v)} /></span>
          <span style={{ color: '#94a3b8' }}>•</span>
          <span><EditableText value={personal.email} placeholder="Email" onChange={v => updatePersonal('email', v)} /></span>
          <span style={{ color: '#94a3b8' }}>•</span>
          <span><EditableText value={personal.location} placeholder="Location" onChange={v => updatePersonal('location', v)} /></span>
          <span style={{ color: '#94a3b8' }}>•</span>
          <span><EditableText value={personal.linkedin} placeholder="LinkedIn" onChange={v => updatePersonal('linkedin', v)} /></span>
          <span style={{ color: '#94a3b8' }}>•</span>
          <span><EditableText value={personal.github} placeholder="GitHub" onChange={v => updatePersonal('github', v)} /></span>
        </div>
      </div>

      {/* Education Section */}
      {(edu.college || edu.degree) && (
        <Section title="Education">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <div>
              <div style={{ fontWeight: '700', fontSize: '10.5px', color: '#0f172a' }}>
                <EditableText value={edu.college} placeholder="College Name" onChange={v => updateListItem('education', edu.id, 'college', v)} />
              </div>
              <div style={{ color: '#334155', fontSize: '9.5px' }}>
                <EditableText value={edu.degree} placeholder="Degree" onChange={v => updateListItem('education', edu.id, 'degree', v)} />
                {edu.department ? ' — ' : ''}
                <EditableText value={edu.department} placeholder="Department" onChange={v => updateListItem('education', edu.id, 'department', v)} />
              </div>
              {edu.intermediate && (
                <div style={{ color: '#64748b', fontSize: '9px', marginTop: '1px' }}>
                  Intermediate: <EditableText value={edu.intermediate} placeholder="Intermediate details" onChange={v => updateListItem('education', edu.id, 'intermediate', v)} />
                </div>
              )}
              {edu.schooling && (
                <div style={{ color: '#64748b', fontSize: '9px' }}>
                  Schooling: <EditableText value={edu.schooling} placeholder="Schooling details" onChange={v => updateListItem('education', edu.id, 'schooling', v)} />
                </div>
              )}
            </div>
            <div style={{ textAlign: 'right', fontSize: '9px', color: '#475569' }}>
              <div><EditableText value={edu.year} placeholder="Year" onChange={v => updateListItem('education', edu.id, 'year', v)} /></div>
              <div style={{ fontWeight: '700', color: '#0f172a' }}>
                CGPA: <EditableText value={edu.cgpa} placeholder="CGPA" onChange={v => updateListItem('education', edu.id, 'cgpa', v)} />
              </div>
            </div>
          </div>
        </Section>
      )}

      {/* Technical Skills Section */}
      {hasSkills && (
        <Section title="Technical Skills">
          <div style={{ fontSize: '9.5px', color: '#334155' }}>
            <div style={{ marginBottom: '3px' }}>
              <strong style={{ color: '#0f172a' }}>Languages: </strong>
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
              <strong style={{ color: '#0f172a' }}>Soft Skills: </strong>
              <EditableText value={skills.soft} placeholder="Soft skills" onChange={v => updateSkills('soft', v)} />
            </div>
          </div>
        </Section>
      )}

      {/* Experience Section */}
      {experience.some(e => e.role || e.company) && (
        <Section title="Work Experience">
          {experience.filter(e => e.role || e.company).map(exp => (
            <div key={exp.id} style={{ marginBottom: '10px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <span style={{ fontWeight: '700', fontSize: '10.5px', color: '#0f172a' }}>
                  <EditableText value={exp.role} placeholder="Role" onChange={v => updateListItem('experience', exp.id, 'role', v)} />
                  {' | '}
                  <EditableText value={exp.company} placeholder="Company" onChange={v => updateListItem('experience', exp.id, 'company', v)} />
                </span>
                <span style={{ fontSize: '9px', color: '#64748b' }}>
                  <EditableText value={exp.duration} placeholder="Duration" onChange={v => updateListItem('experience', exp.id, 'duration', v)} />
                </span>
              </div>
              {exp.description && (
                <div style={{ color: '#334155', fontSize: '9.5px', marginTop: '2px', whiteSpace: 'pre-line' }}>
                  <EditableText value={exp.description} placeholder="Description..." multiline onChange={v => updateListItem('experience', exp.id, 'description', v)} />
                </div>
              )}
            </div>
          ))}
        </Section>
      )}

      {/* Projects Section */}
      {projects.some(p => p.title) && (
        <Section title="Projects">
          {projects.filter(p => p.title).map(proj => (
            <div key={proj.id} style={{ marginBottom: '10px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <span style={{ fontWeight: '700', fontSize: '10.5px', color: '#0f172a' }}>
                  <EditableText value={proj.title} placeholder="Title" onChange={v => updateListItem('projects', proj.id, 'title', v)} />
                </span>
                <span style={{ fontSize: '9px', color: '#475569' }}>
                  <EditableText value={proj.link} placeholder="Link" onChange={v => updateListItem('projects', proj.id, 'link', v)} />
                </span>
              </div>
              {proj.description && (
                <div style={{ color: '#334155', fontSize: '9.5px', marginTop: '2px' }}>
                  <EditableText value={proj.description} placeholder="Description..." multiline onChange={v => updateListItem('projects', proj.id, 'description', v)} />
                </div>
              )}
              <div style={{ fontSize: '9px', color: '#64748b', marginTop: '2px' }}>
                <strong style={{ color: '#475569' }}>Technologies used: </strong>
                <EditableText value={proj.tech} placeholder="React, Node.js" onChange={v => updateListItem('projects', proj.id, 'tech', v)} />
              </div>
            </div>
          ))}
        </Section>
      )}

      {/* Certifications Section */}
      {certifications.some(c => c.course) && (
        <Section title="Certifications">
          {certifications.filter(c => c.course).map(cert => (
            <div key={cert.id} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px', fontSize: '9.5px' }}>
              <span>
                <strong style={{ color: '#0f172a' }}>
                  <EditableText value={cert.course} placeholder="Course" onChange={v => updateListItem('certifications', cert.id, 'course', v)} />
                </strong>
                {' — '}
                <EditableText value={cert.platform} placeholder="Platform" onChange={v => updateListItem('certifications', cert.id, 'platform', v)} />
              </span>
              <span style={{ fontSize: '9px', color: '#64748b' }}>
                <EditableText value={cert.year} placeholder="Year" onChange={v => updateListItem('certifications', cert.id, 'year', v)} />
              </span>
            </div>
          ))}
        </Section>
      )}

      {/* Achievements Section */}
      {achievements && (
        <Section title="Achievements & Honors">
          <div style={{ color: '#334155', fontSize: '9.5px', whiteSpace: 'pre-line' }}>
            <EditableText value={achievements} placeholder="Achievements..." multiline onChange={v => updateAchievements(v)} />
          </div>
        </Section>
      )}
    </div>
  )
}
