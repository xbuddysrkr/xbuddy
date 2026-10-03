import React from 'react'
import EditableText from '../components/EditableText'
import { useResume } from '../resumeStore'

// Two-Column Technical Template — Sidebar for skills/edu/certs, main column for experience/projects

function SideSection({ title, children }) {
  return (
    <div style={{ marginBottom: '16px' }}>
      <div style={{
        fontSize: '10px',
        fontWeight: '700',
        letterSpacing: '1.2px',
        textTransform: 'uppercase',
        color: '#0f766e', // Deep Teal Accent
        borderBottom: '1.5px solid #0f766e',
        paddingBottom: '3px',
        marginBottom: '8px',
      }}>
        {title}
      </div>
      {children}
    </div>
  )
}

function MainSection({ title, children }) {
  return (
    <div style={{ marginBottom: '16px' }}>
      <div style={{
        fontSize: '11px',
        fontWeight: '700',
        letterSpacing: '1.4px',
        textTransform: 'uppercase',
        color: '#0f766e',
        borderBottom: '1.5px solid #e2e8f0',
        paddingBottom: '3px',
        marginBottom: '9px',
      }}>
        {title}
      </div>
      {children}
    </div>
  )
}

export default function TwoColumnTechTemplate({ data, fontScale = 1 }) {
  const f = (n) => `${n * fontScale}px`
  const { updatePersonal, updateSkills, updateListItem, updateAchievements } = useResume()
  const { personal, education, skills, projects, experience, certifications, achievements } = data
  const edu = education[0] || {}

  const hasSidebarSkills = Boolean(skills.languages || skills.frameworks || skills.tools || skills.soft)
  const hasSidebarEdu = Boolean(edu.college || edu.degree)
  const hasSidebarCerts = certifications.some(c => c.course)
  const hasSidebarContent = hasSidebarSkills || hasSidebarEdu || hasSidebarCerts

  const hasMainExp = experience.some(e => e.role || e.company)
  const hasMainProjects = projects.some(p => p.title)
  const hasMainAchievements = Boolean(achievements)

  return (
    <div style={{
      fontFamily: "'Inter', -apple-system, sans-serif",
      fontSize: f(10),
      color: '#1e293b',
      lineHeight: '1.55',
      padding: '22mm 18mm',
      background: '#fff',
      minHeight: '297mm',
      width: '210mm',
      boxSizing: 'border-box',
    }}>
      {/* Top Header */}
      <div style={{ marginBottom: '18px', borderBottom: '2.5px solid #0f766e', paddingBottom: '12px' }}>
        <div style={{ fontSize: f(24), fontWeight: '800', color: '#0f766e', letterSpacing: '-0.3px' }}>
          <EditableText
            value={personal.name}
            placeholder="YOUR NAME"
            onChange={v => updatePersonal('name', v)}
          />
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', marginTop: '6px', fontSize: '9px', color: '#475569' }}>
          <span>📞 <EditableText value={personal.phone} placeholder="Phone" onChange={v => updatePersonal('phone', v)} /></span>
          <span>✉ <EditableText value={personal.email} placeholder="Email" onChange={v => updatePersonal('email', v)} /></span>
          <span>📍 <EditableText value={personal.location} placeholder="Location" onChange={v => updatePersonal('location', v)} /></span>
          <span>🔗 <EditableText value={personal.linkedin} placeholder="LinkedIn" onChange={v => updatePersonal('linkedin', v)} /></span>
          <span>⌥ <EditableText value={personal.github} placeholder="GitHub" onChange={v => updatePersonal('github', v)} /></span>
          <span>🌐 <EditableText value={personal.portfolio} placeholder="Portfolio" onChange={v => updatePersonal('portfolio', v)} /></span>
        </div>
      </div>

      {/* Two-Column Body */}
      <div style={{ display: 'flex', gap: '22px' }}>
        {/* Left Sidebar (~32% width) */}
        {hasSidebarContent && (
          <div style={{ width: '32%', flexShrink: 0, borderRight: '1px solid #f1f5f9', paddingRight: '14px' }}>
            {/* Skills */}
            <SideSection title="Technical Skills">
              <div style={{ marginBottom: '7px' }}>
                <div style={{ fontWeight: '700', fontSize: '9px', color: '#334155', marginBottom: '2px' }}>Languages</div>
                <EditableText value={skills.languages} placeholder="Languages" style={{ color: '#475569', fontSize: '8.5px', lineHeight: '1.4' }} onChange={v => updateSkills('languages', v)} />
              </div>
              <div style={{ marginBottom: '7px' }}>
                <div style={{ fontWeight: '700', fontSize: '9px', color: '#334155', marginBottom: '2px' }}>Frameworks</div>
                <EditableText value={skills.frameworks} placeholder="Frameworks" style={{ color: '#475569', fontSize: '8.5px', lineHeight: '1.4' }} onChange={v => updateSkills('frameworks', v)} />
              </div>
              <div style={{ marginBottom: '7px' }}>
                <div style={{ fontWeight: '700', fontSize: '9px', color: '#334155', marginBottom: '2px' }}>Tools & DevOps</div>
                <EditableText value={skills.tools} placeholder="Tools" style={{ color: '#475569', fontSize: '8.5px', lineHeight: '1.4' }} onChange={v => updateSkills('tools', v)} />
              </div>
              <div>
                <div style={{ fontWeight: '700', fontSize: '9px', color: '#334155', marginBottom: '2px' }}>Soft Skills</div>
                <EditableText value={skills.soft} placeholder="Soft skills" style={{ color: '#475569', fontSize: '8.5px', lineHeight: '1.4' }} onChange={v => updateSkills('soft', v)} />
              </div>
            </SideSection>

            {/* Education in Sidebar */}
            {(edu.college || edu.degree) && (
              <SideSection title="Education">
                <div style={{ fontWeight: '700', fontSize: '9.5px', color: '#0f172a' }}>
                  <EditableText value={edu.college} placeholder="College" onChange={v => updateListItem('education', edu.id, 'college', v)} />
                </div>
                <div style={{ color: '#0f766e', fontSize: '9px', fontWeight: '600' }}>
                  <EditableText value={edu.degree} placeholder="Degree" onChange={v => updateListItem('education', edu.id, 'degree', v)} />
                  {edu.department ? ' (' : ''}
                  {edu.department ? <EditableText value={edu.department} placeholder="Dept" onChange={v => updateListItem('education', edu.id, 'department', v)} /> : null}
                  {edu.department ? ')' : ''}
                </div>
                <div style={{ color: '#64748b', fontSize: '8.5px', marginTop: '2px' }}>
                  <EditableText value={edu.year} placeholder="Year" onChange={v => updateListItem('education', edu.id, 'year', v)} />
                </div>
                <div style={{ color: '#0f766e', fontSize: '8.5px', fontWeight: '700' }}>
                  CGPA: <EditableText value={edu.cgpa} placeholder="8.5" onChange={v => updateListItem('education', edu.id, 'cgpa', v)} />
                </div>
              </SideSection>
            )}

            {/* Certifications in Sidebar */}
            {hasSidebarCerts && (
              <SideSection title="Certifications">
                {certifications.filter(c => c.course).map(cert => (
                  <div key={cert.id} style={{ marginBottom: '6px' }}>
                    <div style={{ fontWeight: '600', fontSize: '9px', color: '#0f172a' }}>
                      <EditableText value={cert.course} placeholder="Course" onChange={v => updateListItem('certifications', cert.id, 'course', v)} />
                    </div>
                    <div style={{ color: '#64748b', fontSize: '8.5px' }}>
                      <EditableText value={cert.platform} placeholder="Platform" onChange={v => updateListItem('certifications', cert.id, 'platform', v)} />
                    </div>
                    <div style={{ color: '#94a3b8', fontSize: '8px' }}>
                      <EditableText value={cert.year} placeholder="Year" onChange={v => updateListItem('certifications', cert.id, 'year', v)} />
                    </div>
                  </div>
                ))}
              </SideSection>
            )}
          </div>
        )}

        {/* Right Main Column */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Work Experience */}
          {hasMainExp && (
            <MainSection title="Work Experience">
              {experience.filter(e => e.role || e.company).map(exp => (
                <div key={exp.id} style={{ marginBottom: '10px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                    <span style={{ fontWeight: '700', fontSize: '10.5px', color: '#0f172a' }}>
                      <EditableText value={exp.role} placeholder="Role" onChange={v => updateListItem('experience', exp.id, 'role', v)} />
                    </span>
                    <span style={{ fontSize: '8.5px', color: '#64748b' }}>
                      <EditableText value={exp.duration} placeholder="Duration" onChange={v => updateListItem('experience', exp.id, 'duration', v)} />
                    </span>
                  </div>
                  <div style={{ color: '#0f766e', fontSize: '9.5px', fontWeight: '600' }}>
                    <EditableText value={exp.company} placeholder="Company" onChange={v => updateListItem('experience', exp.id, 'company', v)} />
                  </div>
                  {exp.description && (
                    <div style={{ color: '#334155', fontSize: '9px', marginTop: '2px', lineHeight: '1.45', whiteSpace: 'pre-line' }}>
                      <EditableText value={exp.description} placeholder="Description..." multiline onChange={v => updateListItem('experience', exp.id, 'description', v)} />
                    </div>
                  )}
                </div>
              ))}
            </MainSection>
          )}

          {/* Key Technical Projects */}
          {hasMainProjects && (
            <MainSection title="Technical Projects">
              {projects.filter(p => p.title).map(proj => (
                <div key={proj.id} style={{ marginBottom: '11px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                    <span style={{ fontWeight: '700', fontSize: '10.5px', color: '#0f172a' }}>
                      <EditableText value={proj.title} placeholder="Title" onChange={v => updateListItem('projects', proj.id, 'title', v)} />
                    </span>
                    <span style={{ fontSize: '8.5px', color: '#0f766e' }}>
                      <EditableText value={proj.link} placeholder="Link" onChange={v => updateListItem('projects', proj.id, 'link', v)} />
                    </span>
                  </div>
                  <div style={{ color: '#334155', fontSize: '9px', marginTop: '2px', lineHeight: '1.45' }}>
                    <EditableText value={proj.description} placeholder="Description..." multiline onChange={v => updateListItem('projects', proj.id, 'description', v)} />
                  </div>
                  <div style={{ marginTop: '4px' }}>
                    <strong style={{ fontSize: '8.5px', color: '#64748b' }}>Stack: </strong>
                    <EditableText value={proj.tech} placeholder="React, Node.js" style={{ fontSize: '8.5px', color: '#0f766e' }} onChange={v => updateListItem('projects', proj.id, 'tech', v)} />
                  </div>
                </div>
              ))}
            </MainSection>
          )}

          {/* Achievements */}
          {hasMainAchievements && (
            <MainSection title="Key Achievements">
              <div style={{ color: '#334155', fontSize: '9px', whiteSpace: 'pre-line', lineHeight: '1.45' }}>
                <EditableText value={achievements} placeholder="Achievements..." multiline onChange={v => updateAchievements(v)} />
              </div>
            </MainSection>
          )}
        </div>
      </div>
    </div>
  )
}
