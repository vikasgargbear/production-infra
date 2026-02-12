/**
 * HR Letter Templates
 * HTML templates with merge fields for generating HR letters client-side.
 * Uses employee + salary + org data already available via existing APIs.
 */

export interface LetterData {
  // Employee
  employee_name: string;
  employee_code: string;
  designation: string;
  department: string;
  joining_date: string;
  last_working_date?: string;

  // Salary
  monthly_gross?: number;
  annual_ctc?: number;
  basic?: number;
  hra?: number;

  // Organization
  company_name: string;
  company_address: string;

  // Letter-specific
  letter_date: string;
  increment_percent?: number;
  new_salary?: number;
  old_salary?: number;
}

const COMMON_STYLES = `
  body { font-family: 'Segoe UI', Arial, sans-serif; padding: 50px 60px; color: #1a1a1a; line-height: 1.7; font-size: 14px; }
  .header { text-align: center; margin-bottom: 30px; padding-bottom: 20px; border-bottom: 2px solid #1a1a1a; }
  .company-name { font-size: 22px; font-weight: 700; color: #111827; letter-spacing: 1px; }
  .company-address { font-size: 12px; color: #6b7280; margin-top: 4px; }
  .ref-line { display: flex; justify-content: space-between; font-size: 13px; color: #6b7280; margin-bottom: 25px; }
  .subject { text-align: center; font-weight: 700; font-size: 15px; margin: 20px 0; text-decoration: underline; }
  .content p { margin: 10px 0; text-align: justify; }
  .salary-table { width: 100%; border-collapse: collapse; margin: 15px 0; }
  .salary-table th, .salary-table td { padding: 8px 12px; text-align: left; border: 1px solid #d1d5db; font-size: 13px; }
  .salary-table th { background: #f3f4f6; font-weight: 600; }
  .salary-table .amount { text-align: right; font-family: monospace; }
  .signature { margin-top: 60px; }
  .signature-line { margin-top: 40px; border-top: 1px solid #1a1a1a; width: 200px; }
  .footer { margin-top: 40px; padding-top: 15px; border-top: 1px solid #e5e7eb; font-size: 11px; color: #9ca3af; text-align: center; }
  @media print { body { padding: 30px 40px; } }
`;

const fmt = (val: number) => `₹${(val || 0).toLocaleString('en-IN')}`;
const fmtDate = (d: string) => {
  try { return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' }); }
  catch { return d; }
};

const wrapTemplate = (title: string, body: string, data: LetterData) => `
<!DOCTYPE html>
<html><head><title>${title} - ${data.employee_name}</title>
<style>${COMMON_STYLES}</style></head>
<body>
  <div class="header">
    <div class="company-name">${data.company_name}</div>
    <div class="company-address">${data.company_address}</div>
  </div>
  ${body}
  <div class="footer">This is a computer-generated document. | ${data.company_name}</div>
</body></html>`;

export const LETTER_TYPES = [
  { id: 'offer', label: 'Offer Letter' },
  { id: 'appointment', label: 'Appointment Letter' },
  { id: 'increment', label: 'Increment Letter' },
  { id: 'experience', label: 'Experience Certificate' },
  { id: 'relieving', label: 'Relieving Letter' },
  { id: 'salary_certificate', label: 'Salary Certificate' },
] as const;

export type LetterType = typeof LETTER_TYPES[number]['id'];

export const generateLetter = (type: LetterType, data: LetterData): string => {
  switch (type) {
    case 'offer':
      return wrapTemplate('Offer Letter', `
        <div class="ref-line"><span>Ref: ${data.company_name.substring(0, 3).toUpperCase()}/HR/OFFER/${new Date().getFullYear()}</span><span>Date: ${fmtDate(data.letter_date)}</span></div>
        <div class="subject">OFFER OF EMPLOYMENT</div>
        <div class="content">
          <p>Dear <strong>${data.employee_name}</strong>,</p>
          <p>We are pleased to offer you the position of <strong>${data.designation}</strong> in our organization. Based on your qualifications and experience, we believe you will be a valuable addition to our team.</p>
          <p>The details of your offer are as follows:</p>
          <table class="salary-table">
            <tr><th>Component</th><th class="amount">Monthly (₹)</th></tr>
            ${data.basic ? `<tr><td>Basic Salary</td><td class="amount">${fmt(data.basic)}</td></tr>` : ''}
            ${data.hra ? `<tr><td>House Rent Allowance</td><td class="amount">${fmt(data.hra)}</td></tr>` : ''}
            ${data.monthly_gross ? `<tr><th>Gross Salary</th><th class="amount">${fmt(data.monthly_gross)}</th></tr>` : ''}
            ${data.annual_ctc ? `<tr><th>Annual CTC</th><th class="amount">${fmt(data.annual_ctc)}</th></tr>` : ''}
          </table>
          <p>Your expected date of joining is <strong>${fmtDate(data.joining_date)}</strong>.</p>
          <p>This offer is valid for 15 days from the date of issue. Please confirm your acceptance by signing and returning a copy of this letter.</p>
          <p>We look forward to having you on board.</p>
        </div>
        <div class="signature">
          <p>Yours sincerely,</p>
          <div class="signature-line"></div>
          <p><strong>Authorized Signatory</strong><br/>${data.company_name}</p>
        </div>
      `, data);

    case 'appointment':
      return wrapTemplate('Appointment Letter', `
        <div class="ref-line"><span>Ref: ${data.company_name.substring(0, 3).toUpperCase()}/HR/APPT/${new Date().getFullYear()}</span><span>Date: ${fmtDate(data.letter_date)}</span></div>
        <div class="subject">LETTER OF APPOINTMENT</div>
        <div class="content">
          <p>Dear <strong>${data.employee_name}</strong>,</p>
          <p>With reference to your application and subsequent discussions, we are pleased to appoint you as <strong>${data.designation}</strong> in the <strong>${data.department}</strong> department of ${data.company_name}, effective from <strong>${fmtDate(data.joining_date)}</strong>.</p>
          <p>Your Employee Code is <strong>${data.employee_code}</strong>.</p>
          <p><strong>Compensation:</strong></p>
          <table class="salary-table">
            <tr><th>Component</th><th class="amount">Monthly (₹)</th></tr>
            ${data.basic ? `<tr><td>Basic Salary</td><td class="amount">${fmt(data.basic)}</td></tr>` : ''}
            ${data.hra ? `<tr><td>House Rent Allowance</td><td class="amount">${fmt(data.hra)}</td></tr>` : ''}
            ${data.monthly_gross ? `<tr><th>Gross Salary</th><th class="amount">${fmt(data.monthly_gross)}</th></tr>` : ''}
          </table>
          <p><strong>Terms & Conditions:</strong></p>
          <ul>
            <li>You will be on probation for a period of 6 months from the date of joining.</li>
            <li>Either party may terminate this appointment by giving one month's notice or salary in lieu thereof.</li>
            <li>You are expected to maintain confidentiality regarding company matters.</li>
            <li>You shall abide by all rules, regulations, and policies of the company.</li>
          </ul>
          <p>Please sign the duplicate copy of this letter as a token of your acceptance.</p>
        </div>
        <div class="signature">
          <p>For <strong>${data.company_name}</strong>,</p>
          <div class="signature-line"></div>
          <p><strong>Authorized Signatory</strong></p>
        </div>
      `, data);

    case 'increment':
      return wrapTemplate('Increment Letter', `
        <div class="ref-line"><span>Ref: ${data.company_name.substring(0, 3).toUpperCase()}/HR/INCR/${new Date().getFullYear()}</span><span>Date: ${fmtDate(data.letter_date)}</span></div>
        <div class="subject">SALARY REVISION LETTER</div>
        <div class="content">
          <p>Dear <strong>${data.employee_name}</strong> (${data.employee_code}),</p>
          <p>We are pleased to inform you that based on your performance and contribution to the organization, the management has decided to revise your compensation effective from <strong>${fmtDate(data.letter_date)}</strong>.</p>
          <table class="salary-table">
            <tr><th>Particulars</th><th class="amount">Amount (₹)</th></tr>
            ${data.old_salary ? `<tr><td>Previous Monthly Gross</td><td class="amount">${fmt(data.old_salary)}</td></tr>` : ''}
            ${data.new_salary ? `<tr><td>Revised Monthly Gross</td><td class="amount">${fmt(data.new_salary)}</td></tr>` : ''}
            ${data.increment_percent ? `<tr><td>Increment</td><td class="amount">${data.increment_percent}%</td></tr>` : ''}
          </table>
          <p>We appreciate your dedication and hard work, and hope you will continue to contribute to the growth of the organization.</p>
          <p>Congratulations!</p>
        </div>
        <div class="signature">
          <p>For <strong>${data.company_name}</strong>,</p>
          <div class="signature-line"></div>
          <p><strong>HR Department</strong></p>
        </div>
      `, data);

    case 'experience':
      return wrapTemplate('Experience Certificate', `
        <div class="ref-line"><span>Ref: ${data.company_name.substring(0, 3).toUpperCase()}/HR/EXP/${new Date().getFullYear()}</span><span>Date: ${fmtDate(data.letter_date)}</span></div>
        <div class="subject">EXPERIENCE CERTIFICATE</div>
        <div class="content">
          <p>To Whom It May Concern,</p>
          <p>This is to certify that <strong>${data.employee_name}</strong> (Employee Code: ${data.employee_code}) was employed with <strong>${data.company_name}</strong> as <strong>${data.designation}</strong> in the <strong>${data.department}</strong> department from <strong>${fmtDate(data.joining_date)}</strong>${data.last_working_date ? ` to <strong>${fmtDate(data.last_working_date)}</strong>` : ' till date'}.</p>
          <p>During the tenure with us, we found ${data.employee_name} to be sincere, hardworking, and dedicated. The conduct and character have been good throughout the period of employment.</p>
          <p>We wish all the best in future endeavors.</p>
        </div>
        <div class="signature">
          <p>For <strong>${data.company_name}</strong>,</p>
          <div class="signature-line"></div>
          <p><strong>Authorized Signatory</strong></p>
        </div>
      `, data);

    case 'relieving':
      return wrapTemplate('Relieving Letter', `
        <div class="ref-line"><span>Ref: ${data.company_name.substring(0, 3).toUpperCase()}/HR/REL/${new Date().getFullYear()}</span><span>Date: ${fmtDate(data.letter_date)}</span></div>
        <div class="subject">RELIEVING LETTER</div>
        <div class="content">
          <p>Dear <strong>${data.employee_name}</strong>,</p>
          <p>This is with reference to your resignation dated ${data.last_working_date ? fmtDate(data.last_working_date) : '___________'}.</p>
          <p>We hereby confirm that you have been relieved from your duties as <strong>${data.designation}</strong> in the <strong>${data.department}</strong> department of ${data.company_name}, effective <strong>${data.last_working_date ? fmtDate(data.last_working_date) : '___________'}</strong>.</p>
          <p>All dues have been settled and you have handed over all company property, documents, and materials in your possession.</p>
          <p>We thank you for your services and wish you all the best in your future career.</p>
        </div>
        <div class="signature">
          <p>For <strong>${data.company_name}</strong>,</p>
          <div class="signature-line"></div>
          <p><strong>HR Department</strong></p>
        </div>
      `, data);

    case 'salary_certificate':
      return wrapTemplate('Salary Certificate', `
        <div class="ref-line"><span>Ref: ${data.company_name.substring(0, 3).toUpperCase()}/HR/SAL/${new Date().getFullYear()}</span><span>Date: ${fmtDate(data.letter_date)}</span></div>
        <div class="subject">SALARY CERTIFICATE</div>
        <div class="content">
          <p>To Whom It May Concern,</p>
          <p>This is to certify that <strong>${data.employee_name}</strong> (Employee Code: ${data.employee_code}) is currently employed with <strong>${data.company_name}</strong> as <strong>${data.designation}</strong> since <strong>${fmtDate(data.joining_date)}</strong>.</p>
          <p>The salary details are as follows:</p>
          <table class="salary-table">
            <tr><th>Component</th><th class="amount">Monthly (₹)</th><th class="amount">Annual (₹)</th></tr>
            ${data.basic ? `<tr><td>Basic Salary</td><td class="amount">${fmt(data.basic)}</td><td class="amount">${fmt(data.basic * 12)}</td></tr>` : ''}
            ${data.hra ? `<tr><td>HRA</td><td class="amount">${fmt(data.hra)}</td><td class="amount">${fmt(data.hra * 12)}</td></tr>` : ''}
            ${data.monthly_gross ? `<tr><th>Gross Salary</th><th class="amount">${fmt(data.monthly_gross)}</th><th class="amount">${fmt(data.monthly_gross * 12)}</th></tr>` : ''}
            ${data.annual_ctc ? `<tr><th>Annual CTC</th><th class="amount" colspan="2">${fmt(data.annual_ctc)}</th></tr>` : ''}
          </table>
          <p>This certificate is issued at the request of the employee for the purpose of ${data.employee_name}'s personal use.</p>
        </div>
        <div class="signature">
          <p>For <strong>${data.company_name}</strong>,</p>
          <div class="signature-line"></div>
          <p><strong>HR Department</strong></p>
        </div>
      `, data);

    default:
      return '<p>Unknown letter type</p>';
  }
};
