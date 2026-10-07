import React from 'react'
import { Phone, Mail, MapPin, Link, GitBranch, Globe } from 'lucide-react'
import EditableText from '../components/EditableText'
import { useResume } from '../resumeStore'

// Creative Modern Template — two-column sidebar layout

function SideSection({ title, children }) {
  return (
    <div style={{ marginBottom: '16px' }}>
      <div style={{
        fontSize: '9px', fontWeight: '800', letterSpacing: '2px',
        textTransform: 'uppercase', color: '#fff', background: '#5b21b6',
        padding: '3px 8px', borderRadius: '3px', marginBottom: '8px', display: 'inline-block',
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
        fontSize: '10px', fontWeight: '700', letterSpacing: '1.5px',
        textTransform: 'uppercase', color: '#5b21b6',
        borderLeft: '3px solid #5b21b6', paddingLeft: '8px',
        marginBottom: '8px',
      }}>
        {title}
      </div>
      {children}
    </div>
  )
}

export default function CreativeTemplate({ data, fontScale = 1 }) {
  const f = (n) => `${n * fontScale}px`
  const { updatePersonal, updateSkills, updateListItem, updateAchievements } = useResume()
  const { personal, education, skills, projects, experience, certifications, achievements } = data
  const edu = education[0] || {}

  return (
    <div style={{
      fontFamily: "'Arial', sans-serif", fontSize: f(10), color: '#1a1a2e',
      background: '#fff', minHeight: '297mm', width: '210mm',
      boxSizing: 'border-box', display: 'flex', flexDirection: 'column',
    }}>
      {/* Top header bar */}
      <div style={{ background: '#4c1d95', padding: '20px 24px', color: '#fff' }}>
        <div style={{ fontSize: f(24), fontWeight: '800', letterSpacing: '-0.5px' }}>
          <EditableText
            value={personal.name}
            placeholder="Your Name"
            onChange={v => updatePersonal('name', v)}
          />
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '14px', marginTop: '6px', fontSize: '9px', opacity: 0.9 }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}><Phone size={11} strokeWidth={2} /> <EditableText value={personal.phone} placeholder="Phone" onChange={v => updatePersonal('phone', v)} /></span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}><Mail size={11} strokeWidth={2} /> <EditableText value={personal.email} placeholder="Email" onChange={v => updatePersonal('email', v)} /></span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}><MapPin size={11} strokeWidth={2} /> <EditableText value={personal.location} placeholder="Location" onChange={v => updatePersonal('location', v)} /></span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}><Link size={11} strokeWidth={2} /> <EditableText value={personal.linkedin} placeholder="LinkedIn" onChange={v => updatePersonal('linkedin', v)} /></span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}><GitBranch size={11} strokeWidth={2} /> <EditableText value={personal.github} placeholder="GitHub" onChange={v => updatePersonal('github', v)} /></span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}><Globe size={11} strokeWidth={2} /> <EditableText value={personal.portfolio} placeholder="Portfolio" onChange={v => updatePersonal('portfolio', v)} /></span>
        </div>
      </div>

      {/* Two-column body */}
      <div style={{ display: 'flex', flex: 1 }}>
        {/* Left sidebar */}
        <div style={{ width: '38%', background: '#f5f3ff', padding: '18px 14px', borderRight: '1px solid #e9d5ff' }}>

          {/* Education */}
          {(edu.college || edu.degree) && (
            <SideSection title="Education">
              <div style={{ fontWeight: '700', fontSize: '10px' }}>
                <EditableText value={edu.college} placeholder="College" onChange={v => updateListItem('education', edu.id, 'college', v)} />
              </div>
              <div style={{ color: '#555', fontSize: '9.5px' }}>
                <EditableText value={edu.degree} placeholder="Degree" onChange={v => updateListItem('education', edu.id, 'degree', v)} />
              </div>
              <div style={{ color: '#666', fontSize: '9px' }}>
                <EditableText value={edu.department} placeholder="Department" onChange={v => updateListItem('education', edu.id, 'department', v)} />
              </div>
              <div style={{ color: '#5b21b6', fontWeight: '700', fontSize: '9.5px', marginTop: '2px' }}>
                CGPA: <EditableText value={edu.cgpa} placeholder="8.5" onChange={v => updateListItem('education', edu.id, 'cgpa', v)} />
              </div>
              <div style={{ color: '#666', fontSize: '9px' }}>
                <EditableText value={edu.year} placeholder="Year" onChange={v => updateListItem('education', edu.id, 'year', v)} />
              </div>
            </SideSection>
          )}

          {/* Skills */}
          <SideSection title="Skills & Tech">
            <div style={{ marginBottom: '6px' }}>
              <div style={{ fontSize: '8.5px', fontWeight: 'bold', color: '#5b21b6' }}>Languages:</div>
              <EditableText value={skills.languages} placeholder="Python, Java, JS" style={{ fontSize: '9px', color: '#444' }} onChange={v => updateSkills('languages', v)} />
            </div>
            <div style={{ marginBottom: '6px' }}>
              <div style={{ fontSize: '8.5px', fontWeight: 'bold', color: '#5b21b6' }}>Frameworks:</div>
              <EditableText value={skills.frameworks} placeholder="React, Node.js" style={{ fontSize: '9px', color: '#444' }} onChange={v => updateSkills('frameworks', v)} />
            </div>
            <div style={{ marginBottom: '6px' }}>
              <div style={{ fontSize: '8.5px', fontWeight: 'bold', color: '#5b21b6' }}>Tools:</div>
              <EditableText value={skills.tools} placeholder="Git, Docker, AWS" style={{ fontSize: '9px', color: '#444' }} onChange={v => updateSkills('tools', v)} />
            </div>
            <div>
              <div style={{ fontSize: '8.5px', fontWeight: 'bold', color: '#5b21b6' }}>Soft Skills:</div>
              <EditableText value={skills.soft} placeholder="Communication" style={{ fontSize: '9px', color: '#444' }} onChange={v => updateSkills('soft', v)} />
            </div>
          </SideSection>

          {/* Certifications */}
          {certifications.some(c => c.course) && (
            <SideSection title="Certifications">
              {certifications.filter(c => c.course).map(cert => (
                <div key={cert.id} style={{ marginBottom: '6px' }}>
                  <div style={{ fontWeight: '600', fontSize: '9.5px' }}>
                    <EditableText value={cert.course} placeholder="Course" onChange={v => updateListItem('certifications', cert.id, 'course', v)} />
                  </div>
                  <div style={{ color: '#666', fontSize: '9px' }}>
                    <EditableText value={cert.platform} placeholder="Platform" onChange={v => updateListItem('certifications', cert.id, 'platform', v)} />
                    {' · '}
                    <EditableText value={cert.year} placeholder="Year" onChange={v => updateListItem('certifications', cert.id, 'year', v)} />
                  </div>
                </div>
              ))}
            </SideSection>
          )}
        </div>

        {/* Right main */}
        <div style={{ flex: 1, padding: '18px 18px' }}>

          {/* Experience */}
          {experience.some(e => e.role || e.company) && (
            <MainSection title="Experience">
              {experience.filter(e => e.role || e.company).map(exp => (
                <div key={exp.id} style={{ marginBottom: '10px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <div style={{ fontWeight: '700', fontSize: '10.5px' }}>
                      <EditableText value={exp.role} placeholder="Role" onChange={v => updateListItem('experience', exp.id, 'role', v)} />
                    </div>
                    <div style={{ fontSize: '9px', color: '#666' }}>
                      <EditableText value={exp.duration} placeholder="Duration" onChange={v => updateListItem('experience', exp.id, 'duration', v)} />
                    </div>
                  </div>
                  <div style={{ color: '#5b21b6', fontSize: '9.5px', fontWeight: '600' }}>
                    <EditableText value={exp.company} placeholder="Company" onChange={v => updateListItem('experience', exp.id, 'company', v)} />
                  </div>
                  <div style={{ color: '#444', fontSize: '9.5px', marginTop: '3px' }}>
                    <EditableText value={exp.description} placeholder="Description..." multiline onChange={v => updateListItem('experience', exp.id, 'description', v)} />
                  </div>
                </div>
              ))}
            </MainSection>
          )}

          {/* Projects */}
          {projects.some(p => p.title) && (
            <MainSection title="Projects">
              {projects.filter(p => p.title).map(proj => (
                <div key={proj.id} style={{ marginBottom: '10px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                    <div style={{ fontWeight: '700', fontSize: '10.5px' }}>
                      <EditableText value={proj.title} placeholder="Title" onChange={v => updateListItem('projects', proj.id, 'title', v)} />
                    </div>
                    <div style={{ fontSize: '8.5px', color: '#5b21b6' }}>
                      <EditableText value={proj.link} placeholder="Link" onChange={v => updateListItem('projects', proj.id, 'link', v)} />
                    </div>
                  </div>
                  <div style={{ color: '#444', fontSize: '9.5px', marginTop: '2px' }}>
                    <EditableText value={proj.description} placeholder="Description..." multiline onChange={v => updateListItem('projects', proj.id, 'description', v)} />
                  </div>
                  <div style={{ marginTop: '4px' }}>
                    <strong style={{ fontSize: '8.5px', color: '#666' }}>Tech: </strong>
                    <EditableText value={proj.tech} placeholder="React, Node.js" style={{ fontSize: '8.5px', color: '#6d28d9' }} onChange={v => updateListItem('projects', proj.id, 'tech', v)} />
                  </div>
                </div>
              ))}
            </MainSection>
          )}

          {/* Achievements */}
          {achievements && (
            <MainSection title="Achievements">
              <div style={{ color: '#444', fontSize: '9.5px', whiteSpace: 'pre-line' }}>
                <EditableText value={achievements} placeholder="Achievements..." multiline onChange={v => updateAchievements(v)} />
              </div>
            </MainSection>
          )}
        </div>
      </div>
    </div>
  )
}
