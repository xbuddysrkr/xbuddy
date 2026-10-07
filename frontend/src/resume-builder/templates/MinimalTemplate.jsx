import React from 'react'
import EditableText from '../components/EditableText'
import { useResume } from '../resumeStore'

// Minimal ATS Template — clean, no colors, maximum ATS compatibility

function Section({ title, children }) {
  return (
    <div style={{ marginBottom: '16px' }}>
      <div style={{
        fontSize: '10px', fontWeight: '700', letterSpacing: '2px',
        textTransform: 'uppercase', color: '#111',
        borderBottom: '1px solid #111', paddingBottom: '2px', marginBottom: '8px',
      }}>
        {title}
      </div>
      {children}
    </div>
  )
}

export default function MinimalTemplate({ data, fontScale = 1 }) {
  const f = (n) => `${n * fontScale}px`
  const { updatePersonal, updateSkills, updateListItem, updateAchievements } = useResume()
  const { personal, education, skills, projects, experience, certifications, achievements } = data
  const edu = education[0] || {}

  return (
    <div style={{
      fontFamily: "'Arial', sans-serif", fontSize: f(10.5), color: '#111',
      lineHeight: '1.55', padding: '25mm 20mm', background: '#fff',
      minHeight: '297mm', width: '210mm', boxSizing: 'border-box',
    }}>
      {/* Header */}
      <div style={{ textAlign: 'center', marginBottom: '16px', borderBottom: '1px solid #111', paddingBottom: '12px' }}>
        <div style={{ fontSize: f(22), fontWeight: '800', letterSpacing: '1px' }}>
          <EditableText
            value={personal.name}
            placeholder="YOUR NAME"
            onChange={v => updatePersonal('name', v)}
          />
        </div>
        <div style={{ fontSize: '9px', color: '#333', marginTop: '5px', display: 'flex', justifyContent: 'center', flexWrap: 'wrap', gap: '10px' }}>
          <span><EditableText value={personal.phone} placeholder="Phone" onChange={v => updatePersonal('phone', v)} /></span>
          <span><EditableText value={personal.email} placeholder="Email" onChange={v => updatePersonal('email', v)} /></span>
          <span><EditableText value={personal.location} placeholder="Location" onChange={v => updatePersonal('location', v)} /></span>
          <span><EditableText value={personal.linkedin} placeholder="LinkedIn" onChange={v => updatePersonal('linkedin', v)} /></span>
          <span><EditableText value={personal.github} placeholder="GitHub" onChange={v => updatePersonal('github', v)} /></span>
        </div>
      </div>

      {/* Education */}
      {(edu.college || edu.degree) && (
        <Section title="Education">
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontWeight: '700' }}>
                <EditableText value={edu.college} placeholder="College Name" onChange={v => updateListItem('education', edu.id, 'college', v)} />
              </div>
              <div style={{ color: '#333', fontSize: '10px' }}>
                <EditableText value={edu.degree} placeholder="Degree" onChange={v => updateListItem('education', edu.id, 'degree', v)} />
                {edu.department ? ', ' : ''}
                <EditableText value={edu.department} placeholder="Department" onChange={v => updateListItem('education', edu.id, 'department', v)} />
              </div>
              {edu.intermediate && (
                <div style={{ fontSize: '9.5px', color: '#555' }}>
                  Intermediate: <EditableText value={edu.intermediate} placeholder="Intermediate" onChange={v => updateListItem('education', edu.id, 'intermediate', v)} />
                </div>
              )}
              {edu.schooling && (
                <div style={{ fontSize: '9.5px', color: '#555' }}>
                  Schooling: <EditableText value={edu.schooling} placeholder="Schooling" onChange={v => updateListItem('education', edu.id, 'schooling', v)} />
                </div>
              )}
            </div>
            <div style={{ textAlign: 'right', fontSize: '9.5px' }}>
              <div><EditableText value={edu.year} placeholder="Year" onChange={v => updateListItem('education', edu.id, 'year', v)} /></div>
              <div>
                <strong>CGPA: <EditableText value={edu.cgpa} placeholder="8.5" onChange={v => updateListItem('education', edu.id, 'cgpa', v)} /></strong>
              </div>
            </div>
          </div>
        </Section>
      )}

      {/* Skills */}
      {(skills.languages || skills.frameworks || skills.tools || skills.soft) && (
        <Section title="Skills">
          <div style={{ marginBottom: '3px' }}>
            <strong>Languages: </strong>
            <EditableText value={skills.languages} placeholder="C++, Java, Python" onChange={v => updateSkills('languages', v)} />
          </div>
          <div style={{ marginBottom: '3px' }}>
            <strong>Frameworks: </strong>
            <EditableText value={skills.frameworks} placeholder="React, Node.js" onChange={v => updateSkills('frameworks', v)} />
          </div>
          <div style={{ marginBottom: '3px' }}>
            <strong>Tools: </strong>
            <EditableText value={skills.tools} placeholder="Git, Linux, Docker" onChange={v => updateSkills('tools', v)} />
          </div>
          <div>
            <strong>Soft Skills: </strong>
            <EditableText value={skills.soft} placeholder="Communication, Teamwork" onChange={v => updateSkills('soft', v)} />
          </div>
        </Section>
      )}

      {/* Experience */}
      {experience.some(e => e.role || e.company) && (
        <Section title="Experience">
          {experience.filter(e => e.role || e.company).map(exp => (
            <div key={exp.id} style={{ marginBottom: '9px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <strong>
                  <EditableText value={exp.role} placeholder="Role" onChange={v => updateListItem('experience', exp.id, 'role', v)} />
                  {' | '}
                  <EditableText value={exp.company} placeholder="Company" onChange={v => updateListItem('experience', exp.id, 'company', v)} />
                </strong>
                <span style={{ fontSize: '9.5px' }}>
                  <EditableText value={exp.duration} placeholder="Duration" onChange={v => updateListItem('experience', exp.id, 'duration', v)} />
                </span>
              </div>
              <div style={{ color: '#333', fontSize: '9.5px', marginTop: '2px' }}>
                <EditableText value={exp.description} placeholder="Description..." multiline onChange={v => updateListItem('experience', exp.id, 'description', v)} />
              </div>
            </div>
          ))}
        </Section>
      )}

      {/* Projects */}
      {projects.some(p => p.title) && (
        <Section title="Projects">
          {projects.filter(p => p.title).map(proj => (
            <div key={proj.id} style={{ marginBottom: '9px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <strong>
                  <EditableText value={proj.title} placeholder="Title" onChange={v => updateListItem('projects', proj.id, 'title', v)} />
                </strong>
                <span style={{ fontSize: '9px' }}>
                  <EditableText value={proj.link} placeholder="Link" onChange={v => updateListItem('projects', proj.id, 'link', v)} />
                </span>
              </div>
              <div style={{ color: '#333', fontSize: '9.5px', marginTop: '2px' }}>
                <EditableText value={proj.description} placeholder="Description..." multiline onChange={v => updateListItem('projects', proj.id, 'description', v)} />
              </div>
              <div style={{ fontSize: '9px', color: '#555', marginTop: '2px' }}>
                Tech: <EditableText value={proj.tech} placeholder="React, Node.js" onChange={v => updateListItem('projects', proj.id, 'tech', v)} />
              </div>
            </div>
          ))}
        </Section>
      )}

      {/* Certifications */}
      {certifications.some(c => c.course) && (
        <Section title="Certifications">
          {certifications.filter(c => c.course).map(cert => (
            <div key={cert.id} style={{ marginBottom: '4px', display: 'flex', justifyContent: 'space-between' }}>
              <span>
                <strong>
                  <EditableText value={cert.course} placeholder="Course" onChange={v => updateListItem('certifications', cert.id, 'course', v)} />
                </strong>
                {' — '}
                <EditableText value={cert.platform} placeholder="Platform" onChange={v => updateListItem('certifications', cert.id, 'platform', v)} />
              </span>
              <span style={{ fontSize: '9.5px' }}>
                <EditableText value={cert.year} placeholder="Year" onChange={v => updateListItem('certifications', cert.id, 'year', v)} />
              </span>
            </div>
          ))}
        </Section>
      )}

      {/* Achievements */}
      {achievements && (
        <Section title="Achievements">
          <div style={{ color: '#333', fontSize: '9.5px', whiteSpace: 'pre-line' }}>
            <EditableText value={achievements} placeholder="Achievements..." multiline onChange={v => updateAchievements(v)} />
          </div>
        </Section>
      )}
    </div>
  )
}
