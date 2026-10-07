const fs   = require('fs')
const path = require('path')

// We'll use a pure-JS PDF writer (no dependencies needed)
// Generates minimal valid PDF files with proper formatting

const OUT = path.join(__dirname, 'public', 'forms')
if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true })

const today = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' })

// ── Minimal PDF builder ───────────────────────────────────────────────────────
function buildPdf(lines) {
  // lines: array of { text, size, bold, gap }
  const objects = []
  let objCount  = 0

  function addObj(content) {
    objCount++
    objects.push({ id: objCount, content })
    return objCount
  }

  // Object 1: catalog (added last, ref to pages)
  // Object 2: pages
  // Object 3: page
  // Object 4: font
  // Object 5: content stream

  const fontId    = addObj('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>')
  const fontBold  = addObj('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>')

  // Build stream content
  const margin  = 60
  const pageH   = 841  // A4 height in points
  let   y       = pageH - margin
  const streamLines = []

  streamLines.push('BT')
  for (const line of lines) {
    const size = line.size || 11
    const font = line.bold ? '/F2' : '/F1'
    streamLines.push(`${font} ${size} Tf`)
    const safe = (line.text || '')
      .replace(/\\/g, '\\\\')
      .replace(/\(/g, '\\(')
      .replace(/\)/g, '\\)')
    streamLines.push(`${margin} ${y} Td`)
    streamLines.push(`(${safe}) Tj`)
    streamLines.push('0 0 Td')
    y -= (line.gap || (size * 1.6))
    if (y < 60) {
      // new page marker — simplified: just stop (single page forms)
      break
    }
  }
  streamLines.push('ET')

  const streamContent = streamLines.join('\n')
  const streamId = addObj(`<< /Length ${streamContent.length} >>\nstream\n${streamContent}\nendstream`)

  const pageId  = addObj(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 ${pageH}] /Contents ${streamId} 0 R /Resources << /Font << /F1 ${fontId} 0 R /F2 ${fontBold} 0 R >> >> >>`)
  const pagesId = addObj(`<< /Type /Pages /Kids [${pageId} 0 R] /Count 1 >>`)
  const catId   = addObj(`<< /Type /Catalog /Pages ${pagesId} 0 R >>`)

  // Build PDF bytes
  let pdf    = '%PDF-1.4\n'
  const offsets = {}

  // Re-order: write in id order
  const sorted = objects.sort((a, b) => a.id - b.id)
  for (const obj of sorted) {
    offsets[obj.id] = pdf.length
    pdf += `${obj.id} 0 obj\n${obj.content}\nendobj\n`
  }

  const xrefOffset = pdf.length
  pdf += 'xref\n'
  pdf += `0 ${objCount + 1}\n`
  pdf += '0000000000 65535 f \n'
  for (let i = 1; i <= objCount; i++) {
    pdf += String(offsets[i]).padStart(10, '0') + ' 00000 n \n'
  }
  pdf += 'trailer\n'
  pdf += `<< /Size ${objCount + 1} /Root ${catId} 0 R >>\n`
  pdf += 'startxref\n'
  pdf += `${xrefOffset}\n`
  pdf += '%%EOF'

  return pdf
}

function write(filename, lines) {
  const pdf = buildPdf(lines)
  fs.writeFileSync(path.join(OUT, filename), pdf, 'utf8')
  console.log(`✓ Generated: ${filename}`)
}

// ── 1. Leave Letter ───────────────────────────────────────────────────────────
write('leave-letter.pdf', [
  { text: 'LEAVE APPLICATION', size: 16, bold: true, gap: 30 },
  { text: `Date: ${today}`, size: 11, gap: 20 },
  { text: 'To,', size: 11, gap: 16 },
  { text: 'The Class Teacher / HOD,', size: 11, gap: 16 },
  { text: 'Department of ___________________________,', size: 11, gap: 16 },
  { text: '[College Name]', size: 11, gap: 24 },
  { text: 'Sub: Application for Leave', size: 11, bold: true, gap: 24 },
  { text: 'Respected Sir/Madam,', size: 11, gap: 20 },
  { text: 'I am _________________________, a student of _______ Year,', size: 11, gap: 16 },
  { text: 'Roll No: _____________, Department of _____________________.', size: 11, gap: 20 },
  { text: 'I am writing to respectfully request leave for _______ day(s)', size: 11, gap: 16 },
  { text: 'from _____________ to _____________.', size: 11, gap: 20 },
  { text: 'Reason: ___________________________________________________', size: 11, gap: 16 },
  { text: '___________________________________________________________', size: 11, gap: 24 },
  { text: 'I assure you that I will complete all pending academic work', size: 11, gap: 16 },
  { text: 'upon my return. Kindly grant me the leave and oblige.', size: 11, gap: 32 },
  { text: 'Thank you for your kind consideration.', size: 11, gap: 32 },
  { text: 'Yours obediently,', size: 11, gap: 32 },
  { text: 'Name:    _______________________', size: 11, gap: 16 },
  { text: 'Roll No: _______________________', size: 11, gap: 16 },
  { text: 'Year:    _______________________', size: 11, gap: 16 },
  { text: 'Date:    _______________________', size: 11, gap: 16 },
])

// ── 2. Bonafide Form ──────────────────────────────────────────────────────────
write('bonafide-form.pdf', [
  { text: 'BONAFIDE CERTIFICATE REQUEST', size: 16, bold: true, gap: 30 },
  { text: `Date: ${today}`, size: 11, gap: 20 },
  { text: 'To,', size: 11, gap: 16 },
  { text: 'The Principal / HOD,', size: 11, gap: 16 },
  { text: 'Department of ___________________________,', size: 11, gap: 16 },
  { text: '[College Name]', size: 11, gap: 24 },
  { text: 'Sub: Request for Bonafide Certificate', size: 11, bold: true, gap: 24 },
  { text: 'Respected Sir/Madam,', size: 11, gap: 20 },
  { text: 'I am _________________________, a student of _______ Year,', size: 11, gap: 16 },
  { text: 'Roll No: _____________, Department of _____________________.', size: 11, gap: 20 },
  { text: 'I am writing to request a Bonafide Certificate for the purpose of', size: 11, gap: 16 },
  { text: '___________________________________________________________', size: 11, gap: 16 },
  { text: '___________________________________________________________', size: 11, gap: 24 },
  { text: 'I kindly request you to issue the certificate at the earliest.', size: 11, gap: 16 },
  { text: 'I shall be highly grateful for your support.', size: 11, gap: 32 },
  { text: 'Thank you for your kind consideration.', size: 11, gap: 32 },
  { text: 'Yours obediently,', size: 11, gap: 32 },
  { text: 'Name:    _______________________', size: 11, gap: 16 },
  { text: 'Roll No: _______________________', size: 11, gap: 16 },
  { text: 'Year:    _______________________', size: 11, gap: 16 },
  { text: 'Contact: _______________________', size: 11, gap: 16 },
])

// ── 3. Resume Template ────────────────────────────────────────────────────────
write('resume-template.pdf', [
  { text: 'YOUR FULL NAME', size: 18, bold: true, gap: 14 },
  { text: 'Email: your@email.com  |  Phone: +91 XXXXX XXXXX  |  City, State', size: 10, gap: 28 },
  { text: 'OBJECTIVE', size: 13, bold: true, gap: 14 },
  { text: 'A motivated and dedicated student seeking opportunities to apply', size: 11, gap: 14 },
  { text: 'academic knowledge and develop professional skills.', size: 11, gap: 24 },
  { text: 'EDUCATION', size: 13, bold: true, gap: 14 },
  { text: 'B.Tech / B.E. in [Branch]  —  [College Name]', size: 11, bold: true, gap: 12 },
  { text: '20XX – 20XX  |  CGPA: X.X / 10', size: 10, gap: 20 },
  { text: '12th Standard  —  [School Name]  |  20XX  |  XX%', size: 11, gap: 20 },
  { text: 'SKILLS', size: 13, bold: true, gap: 14 },
  { text: 'Technical:  [Skill 1], [Skill 2], [Skill 3], [Skill 4]', size: 11, gap: 14 },
  { text: 'Soft Skills: Communication, Teamwork, Problem Solving', size: 11, gap: 24 },
  { text: 'PROJECTS', size: 13, bold: true, gap: 14 },
  { text: '[Project Name]  —  [Tech Stack Used]', size: 11, bold: true, gap: 12 },
  { text: 'Brief description of the project and your role.', size: 11, gap: 20 },
  { text: '[Project Name 2]  —  [Tech Stack Used]', size: 11, bold: true, gap: 12 },
  { text: 'Brief description of the project and your role.', size: 11, gap: 24 },
  { text: 'INTERNSHIPS / EXPERIENCE', size: 13, bold: true, gap: 14 },
  { text: '[Company Name]  —  [Role]  |  [Duration]', size: 11, bold: true, gap: 12 },
  { text: 'Description of work done during internship.', size: 11, gap: 24 },
  { text: 'ACHIEVEMENTS & CERTIFICATIONS', size: 13, bold: true, gap: 14 },
  { text: '- [Achievement / Certification 1]', size: 11, gap: 12 },
  { text: '- [Achievement / Certification 2]', size: 11, gap: 24 },
  { text: 'DECLARATION', size: 13, bold: true, gap: 14 },
  { text: 'I hereby declare that the above information is true to the best', size: 11, gap: 14 },
  { text: 'of my knowledge and belief.', size: 11, gap: 28 },
  { text: 'Date: ___________          Signature: ___________________', size: 11, gap: 16 },
])

// ── 4. Assignment Cover Page ──────────────────────────────────────────────────
write('assignment-cover.pdf', [
  { text: '[COLLEGE NAME]', size: 16, bold: true, gap: 14 },
  { text: 'Department of _______________________________', size: 12, gap: 40 },
  { text: 'ASSIGNMENT', size: 22, bold: true, gap: 20 },
  { text: 'Subject: ___________________________________', size: 13, gap: 20 },
  { text: 'Subject Code: ______________________________', size: 13, gap: 40 },
  { text: 'Topic: _____________________________________', size: 13, gap: 16 },
  { text: '____________________________________________', size: 13, gap: 50 },
  { text: 'Submitted by:', size: 12, bold: true, gap: 16 },
  { text: 'Name:    ___________________________________', size: 12, gap: 16 },
  { text: 'Roll No: ___________________________________', size: 12, gap: 16 },
  { text: 'Year & Section: ____________________________', size: 12, gap: 16 },
  { text: 'Semester: __________________________________', size: 12, gap: 40 },
  { text: 'Submitted to:', size: 12, bold: true, gap: 16 },
  { text: 'Faculty Name: ______________________________', size: 12, gap: 16 },
  { text: 'Designation: _______________________________', size: 12, gap: 40 },
  { text: `Date of Submission: ${today}`, size: 12, gap: 16 },
])

// ── 5. Internship Request ─────────────────────────────────────────────────────
write('internship-request.pdf', [
  { text: 'INTERNSHIP PERMISSION REQUEST', size: 16, bold: true, gap: 30 },
  { text: `Date: ${today}`, size: 11, gap: 20 },
  { text: 'To,', size: 11, gap: 16 },
  { text: 'The HOD / Principal,', size: 11, gap: 16 },
  { text: 'Department of ___________________________,', size: 11, gap: 16 },
  { text: '[College Name]', size: 11, gap: 24 },
  { text: 'Sub: Request for Permission to Attend Internship', size: 11, bold: true, gap: 24 },
  { text: 'Respected Sir/Madam,', size: 11, gap: 20 },
  { text: 'I am _________________________, a student of _______ Year,', size: 11, gap: 16 },
  { text: 'Roll No: _____________, Department of _____________________.', size: 11, gap: 20 },
  { text: 'I have been offered an internship opportunity at', size: 11, gap: 16 },
  { text: 'Company: __________________________________________________', size: 11, gap: 16 },
  { text: 'Duration: _________________________________________________', size: 11, gap: 16 },
  { text: 'Role:     _________________________________________________', size: 11, gap: 24 },
  { text: 'I humbly request your permission and necessary leave to attend', size: 11, gap: 16 },
  { text: 'this internship, which will greatly contribute to my professional', size: 11, gap: 16 },
  { text: 'development.', size: 11, gap: 32 },
  { text: 'Thank you for your kind consideration.', size: 11, gap: 32 },
  { text: 'Yours obediently,', size: 11, gap: 32 },
  { text: 'Name:    _______________________', size: 11, gap: 16 },
  { text: 'Roll No: _______________________', size: 11, gap: 16 },
  { text: 'Year:    _______________________', size: 11, gap: 16 },
])

// ── 6. Scholarship Form ───────────────────────────────────────────────────────
write('scholarship-form.pdf', [
  { text: 'SCHOLARSHIP APPLICATION FORM', size: 16, bold: true, gap: 30 },
  { text: `Date: ${today}`, size: 11, gap: 24 },
  { text: 'PERSONAL DETAILS', size: 12, bold: true, gap: 16 },
  { text: 'Full Name:       ___________________________________', size: 11, gap: 16 },
  { text: 'Roll Number:     ___________________________________', size: 11, gap: 16 },
  { text: 'Year / Semester: ___________________________________', size: 11, gap: 16 },
  { text: 'Department:      ___________________________________', size: 11, gap: 16 },
  { text: 'Contact Number:  ___________________________________', size: 11, gap: 16 },
  { text: 'Email Address:   ___________________________________', size: 11, gap: 24 },
  { text: 'ACADEMIC DETAILS', size: 12, bold: true, gap: 16 },
  { text: 'CGPA / Percentage:  ________________________________', size: 11, gap: 16 },
  { text: 'Previous Year %:    ________________________________', size: 11, gap: 24 },
  { text: 'SCHOLARSHIP DETAILS', size: 12, bold: true, gap: 16 },
  { text: 'Scholarship Name:   ________________________________', size: 11, gap: 16 },
  { text: 'Reason for Applying: _______________________________', size: 11, gap: 16 },
  { text: '____________________________________________________', size: 11, gap: 16 },
  { text: 'Annual Family Income: ______________________________', size: 11, gap: 24 },
  { text: 'DECLARATION', size: 12, bold: true, gap: 16 },
  { text: 'I hereby declare that all the above information is true', size: 11, gap: 16 },
  { text: 'and correct to the best of my knowledge.', size: 11, gap: 32 },
  { text: 'Signature: ___________________  Date: _______________', size: 11, gap: 16 },
])

// ── 7. Lab Record Cover ───────────────────────────────────────────────────────
write('lab-record.pdf', [
  { text: '[COLLEGE NAME]', size: 16, bold: true, gap: 14 },
  { text: 'Department of _______________________________', size: 12, gap: 50 },
  { text: 'LAB RECORD', size: 22, bold: true, gap: 20 },
  { text: 'Subject: ___________________________________', size: 13, gap: 16 },
  { text: 'Subject Code: ______________________________', size: 13, gap: 50 },
  { text: 'Name:          _____________________________', size: 12, gap: 16 },
  { text: 'Roll Number:   _____________________________', size: 12, gap: 16 },
  { text: 'Year & Branch: _____________________________', size: 12, gap: 16 },
  { text: 'Section:       _____________________________', size: 12, gap: 16 },
  { text: 'Semester:      _____________________________', size: 12, gap: 50 },
  { text: 'Faculty In-charge: _________________________', size: 12, gap: 16 },
  { text: 'Academic Year: _____________________________', size: 12, gap: 50 },
  { text: 'Lab In-charge Signature: ___________________', size: 12, gap: 16 },
])

// ── 8. Exam Application ───────────────────────────────────────────────────────
write('exam-application.pdf', [
  { text: 'EXAMINATION APPLICATION FORM', size: 16, bold: true, gap: 30 },
  { text: `Date: ${today}`, size: 11, gap: 24 },
  { text: 'STUDENT DETAILS', size: 12, bold: true, gap: 16 },
  { text: 'Full Name:         _________________________________', size: 11, gap: 16 },
  { text: 'Roll Number:       _________________________________', size: 11, gap: 16 },
  { text: 'Register Number:   _________________________________', size: 11, gap: 16 },
  { text: 'Year / Semester:   _________________________________', size: 11, gap: 16 },
  { text: 'Department:        _________________________________', size: 11, gap: 16 },
  { text: 'Section:           _________________________________', size: 11, gap: 16 },
  { text: 'Contact Number:    _________________________________', size: 11, gap: 24 },
  { text: 'EXAMINATION DETAILS', size: 12, bold: true, gap: 16 },
  { text: 'Exam Name / Type:  _________________________________', size: 11, gap: 16 },
  { text: 'Exam Date:         _________________________________', size: 11, gap: 16 },
  { text: 'Subjects Applying: _________________________________', size: 11, gap: 16 },
  { text: '____________________________________________________', size: 11, gap: 24 },
  { text: 'Fees Paid:  Yes / No     Receipt No: _______________', size: 11, gap: 24 },
  { text: 'DECLARATION', size: 12, bold: true, gap: 16 },
  { text: 'I hereby declare that the information provided is true', size: 11, gap: 16 },
  { text: 'and I fulfill all eligibility criteria for this examination.', size: 11, gap: 32 },
  { text: 'Signature: ___________________  Date: _______________', size: 11, gap: 16 },
])

console.log('\n✅ All 8 PDFs generated in public/forms/')
