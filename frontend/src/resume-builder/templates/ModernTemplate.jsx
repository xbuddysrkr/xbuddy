import React from 'react'
import { Phone, Mail, MapPin, Link, GitBranch, Globe } from 'lucide-react'
import EditableText from '../components/EditableText'
import { useResume } from '../resumeStore'

// Modern Professional Template

function Section({ title, children }) {
  return (
    <div style={{ marginBottom: '18px' }}>
      <div style={{
        fontSize: '11px', fontWeight: '700', letterSpacing: '1.5px',
        textTransform: 'uppercase', color: '#7c3aed',
        borderBottom: '1.5px solid #7c3aed', paddingBottom: '3px',
        marginBottom: '10px',
      }}>
        {title}
      </div>
      {children}
    </div>
  )
}

function Tag({ children }) {
  return (
    <span style={{
      display: 'inline-block', background: '#f3f0ff', color: '#6d28d9',
      borderRadius: '4px', padding: '2px 8px', fontSize: '9px',
      fontWeight: '600', marginRight: '5px', marginBottom: '4px',
    }}>
      {children}
    </span>
  )
}

export default function ModernTemplate({ data, fontScale = 1 }) {
  const { updatePersonal, updateSkills, updateListItem, updateAchievements } = useResume()
  const { personal, education, skills, projects, experience, certifications, achievements } = data
  const edu = education[0] || {}

  const allSkills = [
    ...skills.languages.split(','),
    ...skills.frameworks.split(','),
    ...skills.tools.split(','),
  ].map(s => s.trim()).filter(Boolean)

  const f = (n) => `${n * fontScale}px`

  return (
    <div style={{
      fontFamily: "'Georgia', serif", fontSize: f(10.5), color: '#1a1a2e',
      lineHeight: '1.6', padding: '28mm 22mm', background: '#fff',
      minHeight: '297mm', width: '210mm', boxSizing: 'border-box',
    }}>
      {/* Header */}
      <div style={{ marginBottom: '20px', borderBottom: '2px solid #7c3aed', paddingBottom: '14px' }}>
        <div style={{ fontSize: f(26), fontWeight: '800', color: '#1a1a2e', letterSpacing: '-0.5px', fontFamily: 'Arial, sans-serif' }}>
          <EditableText
            value={personal.name}
            placeholder="Your Name"
            onChange={v => updatePersonal('name', v)}
          />
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', marginTop: '6px', fontSize: '9.5px', color: '#555' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}><Phone size={10} strokeWidth={2} /> <EditableText value={personal.phone} placeholder="+91 9876543210" onChange={v => updatePersonal('phone', v)} /></span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}><Mail size={10} strokeWidth={2} /> <EditableText value={personal.email} placeholder="your.email@example.com" onChange={v => updatePersonal('email', v)} /></span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}><MapPin size={10} strokeWidth={2} /> <EditableText value={personal.location} placeholder="City, Country" onChange={v => updatePersonal('location', v)} /></span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}><Link size={10} strokeWidth={2} /> <EditableText value={personal.linkedin} placeholder="linkedin.com/in/you" onChange={v => updatePersonal('linkedin', v)} /></span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}><GitBranch size={10} strokeWidth={2} /> <EditableText value={personal.github} placeholder="github.com/you" onChange={v => updatePersonal('github', v)} /></span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}><Globe size={10} strokeWidth={2} /> <EditableText value={personal.portfolio} placeholder="yourportfolio.com" onChange={v => updatePersonal('portfolio', v)} /></span>
        </div>
      </div>

      {/* Education */}
      {(edu.college || edu.degree) && (
        <Section title="Education">
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontWeight: '700', fontSize: '11px' }}>
                <EditableText value={edu.college} placeholder="College Name" onChange={v => updateListItem('education', edu.id, 'college', v)} />
              </div>
              <div style={{ color: '#444', fontSize: '10px' }}>
                <EditableText value={edu.degree} placeholder="Degree" onChange={v => updateListItem('education', edu.id, 'degree', v)} />
                {edu.department ? ' — ' : ''}
                <EditableText value={edu.department} placeholder="Department" onChange={v => updateListItem('education', edu.id, 'department', v)} />
              </div>
              {edu.intermediate && (
                <div style={{ color: '#666', fontSize: '9.5px', marginTop: '2px' }}>
                  Intermediate: <EditableText value={edu.intermediate} placeholder="Intermediate details" onChange={v => updateListItem('education', edu.id, 'intermediate', v)} />
                </div>
              )}
              {edu.schooling && (
                <div style={{ color: '#666', fontSize: '9.5px' }}>
                  Schooling: <EditableText value={edu.schooling} placeholder="Schooling details" onChange={v => updateListItem('education', edu.id, 'schooling', v)} />
                </div>
              )}
            </div>
            <div style={{ textAlign: 'right', fontSize: '9.5px', color: '#666' }}>
              <div><EditableText value={edu.year} placeholder="2021 – 2025" onChange={v => updateListItem('education', edu.id, 'year', v)} /></div>
              <div style={{ fontWeight: '700', color: '#7c3aed' }}>
                CGPA: <EditableText value={edu.cgpa} placeholder="8.5" onChange={v => updateListItem('education', edu.id, 'cgpa', v)} />
              </div>
            </div>
          </div>
        </Section>
      )}

      {/* Skills */}
      {(skills.languages || skills.frameworks || skills.tools || skills.soft || allSkills.length > 0) && (
        <Section title="Technical Skills">
          <div>
            <div style={{ marginBottom: '4px' }}>
              <strong style={{ fontSize: '9.5px' }}>Languages: </strong>
              <EditableText value={skills.languages} placeholder="Python, Java, JavaScript" style={{ color: '#444', fontSize: '9.5px' }} onChange={v => updateSkills('languages', v)} />
            </div>
            <div style={{ marginBottom: '4px' }}>
              <strong style={{ fontSize: '9.5px' }}>Frameworks: </strong>
              <EditableText value={skills.frameworks} placeholder="React, Node.js, Express" style={{ color: '#444', fontSize: '9.5px' }} onChange={v => updateSkills('frameworks', v)} />
            </div>
            <div style={{ marginBottom: '4px' }}>
              <strong style={{ fontSize: '9.5px' }}>Tools: </strong>
              <EditableText value={skills.tools} placeholder="Git, Docker, AWS" style={{ color: '#444', fontSize: '9.5px' }} onChange={v => updateSkills('tools', v)} />
            </div>
            <div>
              <strong style={{ fontSize: '9.5px' }}>Soft Skills: </strong>
              <EditableText value={skills.soft} placeholder="Communication, Teamwork" style={{ color: '#444', fontSize: '9.5px' }} onChange={v => updateSkills('soft', v)} />
            </div>
          </div>
        </Section>
      )}

      {/* Experience */}
      {experience.some(e => e.role || e.company) && (
        <Section title="Experience">
          {experience.filter(e => e.role || e.company).map(exp => (
            <div key={exp.id} style={{ marginBottom: '10px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <div style={{ fontWeight: '700', fontSize: '11px' }}>
                  <EditableText value={exp.role} placeholder="Role / Title" onChange={v => updateListItem('experience', exp.id, 'role', v)} />
                </div>
                <div style={{ fontSize: '9.5px', color: '#666' }}>
                  <EditableText value={exp.duration} placeholder="Duration" onChange={v => updateListItem('experience', exp.id, 'duration', v)} />
                </div>
              </div>
              <div style={{ color: '#7c3aed', fontSize: '10px', fontWeight: '600' }}>
                <EditableText value={exp.company} placeholder="Company Name" onChange={v => updateListItem('experience', exp.id, 'company', v)} />
              </div>
              <div style={{ color: '#444', fontSize: '9.5px', marginTop: '3px' }}>
                <EditableText value={exp.description} placeholder="Key responsibilities and achievements..." multiline onChange={v => updateListItem('experience', exp.id, 'description', v)} />
              </div>
            </div>
          ))}
        </Section>
      )}

      {/* Projects */}
      {projects.some(p => p.title) && (
        <Section title="Projects">
          {projects.filter(p => p.title).map(proj => (
            <div key={proj.id} style={{ marginBottom: '10px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <div style={{ fontWeight: '700', fontSize: '11px' }}>
                  <EditableText value={proj.title} placeholder="Project Title" onChange={v => updateListItem('projects', proj.id, 'title', v)} />
                </div>
                <div style={{ fontSize: '9px', color: '#7c3aed' }}>
                  <EditableText value={proj.link} placeholder="github.com/project" onChange={v => updateListItem('projects', proj.id, 'link', v)} />
                </div>
              </div>
              <div style={{ color: '#444', fontSize: '9.5px', marginTop: '2px' }}>
                <EditableText value={proj.description} placeholder="Project description..." multiline onChange={v => updateListItem('projects', proj.id, 'description', v)} />
              </div>
              <div style={{ marginTop: '4px' }}>
                <strong style={{ fontSize: '9px', color: '#666' }}>Stack: </strong>
                <EditableText value={proj.tech} placeholder="React, Node.js, MongoDB" style={{ fontSize: '9px', color: '#6d28d9' }} onChange={v => updateListItem('projects', proj.id, 'tech', v)} />
              </div>
            </div>
          ))}
        </Section>
      )}

      {/* Certifications */}
      {certifications.some(c => c.course) && (
        <Section title="Certifications">
          {certifications.filter(c => c.course).map(cert => (
            <div key={cert.id} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
              <div>
                <span style={{ fontWeight: '600', fontSize: '10px' }}>
                  <EditableText value={cert.course} placeholder="Course Name" onChange={v => updateListItem('certifications', cert.id, 'course', v)} />
                </span>
                <span style={{ color: '#666', fontSize: '9.5px' }}>
                  {' — '}
                  <EditableText value={cert.platform} placeholder="Platform / Issuer" onChange={v => updateListItem('certifications', cert.id, 'platform', v)} />
                </span>
              </div>
              <span style={{ fontSize: '9.5px', color: '#666' }}>
                <EditableText value={cert.year} placeholder="2024" onChange={v => updateListItem('certifications', cert.id, 'year', v)} />
              </span>
            </div>
          ))}
        </Section>
      )}

      {/* Achievements */}
      {achievements && (
        <Section title="Achievements">
          <div style={{ color: '#444', fontSize: '9.5px', whiteSpace: 'pre-line' }}>
            <EditableText value={achievements} placeholder="Key awards and recognitions..." multiline onChange={v => updateAchievements(v)} />
          </div>
        </Section>
      )}
    </div>
  )
}
