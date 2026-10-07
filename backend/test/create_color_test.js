import { jsPDF } from 'jspdf';
import fs from 'fs';

const doc = new jsPDF();
doc.setFillColor(255, 0, 0); // Bright Red
doc.rect(20, 20, 160, 30, 'F');
doc.setTextColor(255, 255, 255);
doc.setFontSize(16);
doc.text('RED HEADER - COLOR TEST', 30, 40);

doc.setFillColor(0, 150, 0); // Green
doc.rect(20, 60, 160, 30, 'F');
doc.setTextColor(255, 255, 255);
doc.text('GREEN SECTION', 30, 80);

doc.setFillColor(0, 100, 255); // Blue
doc.rect(20, 100, 160, 30, 'F');
doc.setTextColor(255, 255, 255);
doc.text('BLUE SECTION', 30, 120);

doc.setTextColor(0, 0, 0);
doc.setFontSize(14);
doc.text('Black text: If Black & White mode is active,', 20, 150);
doc.text('all colored boxes above MUST appear in grayscale/monochrome,', 20, 160);
doc.text('with NO color ink used on paper.', 20, 170);

const buf = Buffer.from(doc.output('arraybuffer'));
fs.writeFileSync('f:\\xerox buddy\\test\\color_test.pdf', buf);
console.log('Created color_test.pdf');
