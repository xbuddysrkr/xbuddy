import React from 'react'
import { Check, Trash2 } from 'lucide-react'
import { useResume, SECTIONS, getSectionCompletion } from '../resumeStore.jsx'

const inputCls = 'w-full bg-white border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-[#F78C25] focus:ring-2 focus:ring-orange-500/20 transition-all shadow-2xs'
const labelCls = 'text-xs font-semibold text-slate-700 mb-1.5 flex items-center justify-between'

function Field({ label, field, section, placeholder, type = 'text', hint }) {
  const { resume, updatePersonal, updateSkills } = useResume()
  const value = section === 'personal' ? (resume.personal?.[field] || '') : (resume.skills?.[field] || '')
  const onChange = section === 'personal'
    ? e => updatePersonal(field, e.target.value)
    : e => updateSkills(field, e.target.value)

  return (
    <div className="flex flex-col">
      <label className={labelCls}>
        <span>{label}</span>
        {hint && <span className="text-[10px] text-slate-400 font-normal">{hint}</span>}
      </label>
      <input
        type={type}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        className={inputCls}
        autoComplete="off"
      />
    </div>
  )
}

function ListSection({ section, items = [], template, renderItem, addLabel }) {
  const { addListItem, removeListItem } = useResume()

  return (
    <div className="space-y-3.5">
      {items.map((item, idx) => (
        <div
          key={item.id}
          className="relative border border-slate-200/90 rounded-xl p-3.5 sm:p-4 bg-slate-50/50 hover:bg-slate-50 transition-colors shadow-2xs space-y-3"
        >
          <div className="flex items-center justify-between pb-1 border-b border-slate-200/60">
            <span className="text-xs font-bold text-slate-600">
              #{idx + 1} {section === 'experience' ? 'Experience' : section === 'projects' ? 'Project' : section === 'education' ? 'Education Entry' : 'Certification'}
            </span>
            {items.length > 1 && (
              <button
                type="button"
                onClick={() => removeListItem(section, item.id)}
                className="px-2 py-0.5 rounded-lg bg-red-50 hover:bg-red-100 text-red-500 text-xs font-semibold flex items-center gap-1 transition-all active:scale-95"
                title="Remove entry"
              >
                <Trash2 className="w-3 h-3" /> Remove
              </button>
            )}
          </div>
          {renderItem(item, idx)}
        </div>
      ))}

      <button
        type="button"
        onClick={() => addListItem(section, template)}
        className="w-full py-2.5 px-4 border border-dashed border-orange-300 hover:border-[#F78C25] bg-orange-50/40 hover:bg-orange-50 rounded-xl text-xs font-bold text-[#F78C25] flex items-center justify-center gap-1.5 transition-all active:scale-[0.99] cursor-pointer"
      >
        <span className="text-base leading-none">+</span>
        <span>{addLabel}</span>
      </button>
    </div>
  )
}

export default function ResumeForm({ activeSection = 'personal', onSelectSection }) {
  const { resume, updateListItem } = useResume()

  const currentIndex = SECTIONS.findIndex(s => s.id === activeSection)
  const prevSection = currentIndex > 0 ? SECTIONS[currentIndex - 1] : null
  const nextSection = currentIndex < SECTIONS.length - 1 ? SECTIONS[currentIndex + 1] : null
  const currentSectionMeta = SECTIONS[currentIndex] || SECTIONS[0]
  const currentStatus = getSectionCompletion(resume, activeSection)

  function li(section, id, field) {
    return {
      value: resume[section]?.find(i => i.id === id)?.[field] || '',
      onChange: e => updateListItem(section, id, field, e.target.value),
    }
  }

  const SectionIcon = currentSectionMeta?.icon

  return (
    <div className="space-y-4">
      {/* Current Section Banner */}
      <div className="flex items-center justify-between p-3 rounded-xl bg-orange-50/80 border border-orange-100">
        <div className="flex items-center gap-2.5">
          {SectionIcon && <SectionIcon className="w-5 h-5 text-[#F78C25]" />}
          <div>
            <span className="text-[11px] font-bold text-orange-600 block leading-tight">
              Section {currentIndex + 1} of {SECTIONS.length}
            </span>
            <span className="text-xs sm:text-sm font-bold text-slate-800">
              {currentSectionMeta.label}
            </span>
          </div>
        </div>
        <div>
          {currentStatus.status === 'complete' ? (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-700">
              <Check className="w-3 h-3" /> Complete
            </span>
          ) : currentStatus.status === 'in-progress' ? (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-100 text-amber-700">
              • In progress
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium bg-slate-100 text-slate-500">
              ○ Not started
            </span>
          )}
        </div>
      </div>

      {/* 1. PERSONAL DETAILS */}
      {activeSection === 'personal' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
          <div className="sm:col-span-2">
            <Field label="Full Name" field="name" section="personal" placeholder="Rahul Sharma" />
          </div>
          <Field label="Phone Number" field="phone" section="personal" placeholder="+91 98765 43210" type="tel" />
          <Field label="Email Address" field="email" section="personal" placeholder="rahul@example.com" type="email" />
          <Field label="Location" field="location" section="personal" placeholder="Hyderabad, India" />
          <Field label="LinkedIn Profile" field="linkedin" section="personal" placeholder="linkedin.com/in/rahul" />
          <Field label="GitHub Profile" field="github" section="personal" placeholder="github.com/rahul" />
          <Field label="Portfolio / Website" field="portfolio" section="personal" placeholder="rahul.dev" />
        </div>
      )}

      {/* 2. EDUCATION */}
      {activeSection === 'education' && (
        <ListSection
          section="education"
          items={resume.education}
          template={{ college: '', degree: '', department: '', cgpa: '', year: '', intermediate: '', schooling: '' }}
          addLabel="Add Another Degree / School"
          renderItem={(item) => (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="sm:col-span-2">
                <label className={labelCls}>College / University Name</label>
                <input className={inputCls} placeholder="ABC Engineering College" {...li('education', item.id, 'college')} />
              </div>
              <div>
                <label className={labelCls}>Degree</label>
                <input className={inputCls} placeholder="B.Tech / B.E / B.Sc" {...li('education', item.id, 'degree')} />
              </div>
              <div>
                <label className={labelCls}>Department / Branch</label>
                <input className={inputCls} placeholder="Computer Science & Engineering" {...li('education', item.id, 'department')} />
              </div>
              <div>
                <label className={labelCls}>CGPA / Percentage</label>
                <input className={inputCls} placeholder="8.5 / 10 or 85%" {...li('education', item.id, 'cgpa')} />
              </div>
              <div>
                <label className={labelCls}>Graduation Year / Duration</label>
                <input className={inputCls} placeholder="2021 – 2025" {...li('education', item.id, 'year')} />
              </div>
              <div>
                <label className={labelCls}>Intermediate / 12th</label>
                <input className={inputCls} placeholder="95% — XYZ Junior College" {...li('education', item.id, 'intermediate')} />
              </div>
              <div>
                <label className={labelCls}>Secondary School / 10th</label>
                <input className={inputCls} placeholder="92% — ABC High School" {...li('education', item.id, 'schooling')} />
              </div>
            </div>
          )}
        />
      )}

      {/* 3. SKILLS */}
      {activeSection === 'skills' && (
        <div className="space-y-3.5">
          <Field
            label="Programming Languages"
            field="languages"
            section="skills"
            placeholder="Python, Java, C++, JavaScript, TypeScript"
            hint="Comma separated"
          />
          <Field
            label="Frameworks & Libraries"
            field="frameworks"
            section="skills"
            placeholder="React, Node.js, Express, Tailwind CSS, Django"
            hint="Comma separated"
          />
          <Field
            label="Tools & Platforms"
            field="tools"
            section="skills"
            placeholder="Git, Docker, AWS, Linux, VS Code, Postman"
            hint="Comma separated"
          />
          <Field
            label="Soft Skills & Competencies"
            field="soft"
            section="skills"
            placeholder="Leadership, Teamwork, Critical Thinking, Public Speaking"
            hint="Comma separated"
          />
        </div>
      )}

      {/* 4. EXPERIENCE */}
      {activeSection === 'experience' && (
        <ListSection
          section="experience"
          items={resume.experience}
          template={{ role: '', company: '', duration: '', description: '' }}
          addLabel="Add Another Experience / Internship"
          renderItem={(item) => (
            <div className="space-y-2.5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div>
                  <label className={labelCls}>Role / Title</label>
                  <input className={inputCls} placeholder="Frontend Developer Intern" {...li('experience', item.id, 'role')} />
                </div>
                <div>
                  <label className={labelCls}>Company / Organization</label>
                  <input className={inputCls} placeholder="TechCorp Solutions" {...li('experience', item.id, 'company')} />
                </div>
              </div>
              <div>
                <label className={labelCls}>Duration</label>
                <input className={inputCls} placeholder="Jun 2024 – Aug 2024" {...li('experience', item.id, 'duration')} />
              </div>
              <div>
                <label className={labelCls}>Key Responsibilities & Impact</label>
                <textarea
                  rows={3}
                  className={`${inputCls} resize-none`}
                  placeholder="• Developed high-speed responsive UI components using React..."
                  {...li('experience', item.id, 'description')}
                />
              </div>
            </div>
          )}
        />
      )}

      {/* 5. PROJECTS */}
      {activeSection === 'projects' && (
        <ListSection
          section="projects"
          items={resume.projects}
          template={{ title: '', description: '', tech: '', link: '' }}
          addLabel="Add Another Project"
          renderItem={(item) => (
            <div className="space-y-2.5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div>
                  <label className={labelCls}>Project Title</label>
                  <input className={inputCls} placeholder="X Buddy Campus Print" {...li('projects', item.id, 'title')} />
                </div>
                <div>
                  <label className={labelCls}>Project / GitHub Link</label>
                  <input className={inputCls} placeholder="github.com/username/project" {...li('projects', item.id, 'link')} />
                </div>
              </div>
              <div>
                <label className={labelCls}>Tech Stack (Comma separated)</label>
                <input className={inputCls} placeholder="React, Node.js, Tailwind CSS, Vite" {...li('projects', item.id, 'tech')} />
              </div>
              <div>
                <label className={labelCls}>Description & Outcomes</label>
                <textarea
                  rows={3}
                  className={`${inputCls} resize-none`}
                  placeholder="• Built a full-stack automated printing system serving 2,000+ campus students..."
                  {...li('projects', item.id, 'description')}
                />
              </div>
            </div>
          )}
        />
      )}

      {/* 6. CERTIFICATIONS */}
      {activeSection === 'certifications' && (
        <ListSection
          section="certifications"
          items={resume.certifications}
          template={{ course: '', platform: '', year: '' }}
          addLabel="Add Another Certification"
          renderItem={(item) => (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              <div className="sm:col-span-1">
                <label className={labelCls}>Course / Certificate Name</label>
                <input className={inputCls} placeholder="AWS Certified Cloud Practitioner" {...li('certifications', item.id, 'course')} />
              </div>
              <div>
                <label className={labelCls}>Issuing Platform / Authority</label>
                <input className={inputCls} placeholder="Amazon Web Services / Coursera" {...li('certifications', item.id, 'platform')} />
              </div>
              <div>
                <label className={labelCls}>Year Issued</label>
                <input className={inputCls} placeholder="2024" {...li('certifications', item.id, 'year')} />
              </div>
            </div>
          )}
        />
      )}

      {/* 7. ACHIEVEMENTS */}
      {activeSection === 'achievements' && (
        <AchievementsField />
      )}

      {/* Stepper Navigation Buttons */}
      <div className="flex items-center justify-between gap-3 pt-3 border-t border-slate-200/80">
        {prevSection ? (
          <button
            type="button"
            onClick={() => onSelectSection && onSelectSection(prevSection.id)}
            className="flex-1 sm:flex-initial px-4 py-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold transition-all active:scale-95 cursor-pointer flex items-center justify-center gap-1.5"
          >
            <span>←</span>
            <span>{prevSection.label}</span>
          </button>
        ) : <div />}

        {nextSection && (
          <button
            type="button"
            onClick={() => onSelectSection && onSelectSection(nextSection.id)}
            className="flex-1 sm:flex-initial px-5 py-2.5 rounded-xl bg-gradient-to-r from-[#F7931E] to-[#FF6B00] hover:from-[#FF9C26] hover:to-[#EB740A] text-white text-xs font-bold shadow-md shadow-orange-500/20 transition-all active:scale-95 cursor-pointer flex items-center justify-center gap-1.5 ml-auto"
          >
            <span>Next: {nextSection.label}</span>
            <span>→</span>
          </button>
        )}
      </div>
    </div>
  )
}

function AchievementsField() {
  const { resume, updateAchievements } = useResume()
  return (
    <div className="space-y-1.5">
      <label className={labelCls}>
        <span>Hackathons, Honors, Competitions & Leadership</span>
        <span className="text-[10px] text-slate-400 font-normal">Bullet points recommended</span>
      </label>
      <textarea
        rows={5}
        value={resume.achievements || ''}
        onChange={e => updateAchievements(e.target.value)}
        placeholder={"• Winner — Smart India Hackathon 2024 (Team Lead)\n• Top 10 Finalist — HackWithInfy National Coding Challenge\n• Best Project Award — Annual College Technical Symposium"}
        className={`${inputCls} resize-none leading-relaxed`}
      />
    </div>
  )
}
