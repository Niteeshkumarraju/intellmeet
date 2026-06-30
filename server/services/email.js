const nodemailer = require('nodemailer');

// ── Create transporter ─────────────────────────────────────────────────────
// Supports Gmail, SMTP, or any email provider via env vars
const createTransporter = () => {
  const service = process.env.EMAIL_SERVICE || 'gmail';
  const user    = process.env.EMAIL_USER;
  const pass    = process.env.EMAIL_PASS;

  if (!user || !pass) {
    console.warn('[Email] EMAIL_USER or EMAIL_PASS not set — email sending disabled.');
    return null;
  }

  return nodemailer.createTransport({
    service,
    auth: { user, pass },
  });
};

const transporter = createTransporter();

// ── Base email template ────────────────────────────────────────────────────
const baseTemplate = (content) => `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Segoe UI', Arial, sans-serif; background: #0a0f1e; color: #e2e8f0; }
    .container { max-width: 560px; margin: 0 auto; background: #111827; border-radius: 16px; overflow: hidden; border: 1px solid rgba(99,102,241,0.2); }
    .header { background: linear-gradient(135deg, #4f46e5, #7c3aed); padding: 32px 40px; text-align: center; }
    .logo { font-size: 26px; font-weight: 800; color: white; letter-spacing: -0.5px; }
    .logo span { opacity: 0.7; font-size: 13px; display: block; margin-top: 4px; font-weight: 400; }
    .body { padding: 36px 40px; }
    .greeting { font-size: 20px; font-weight: 700; margin-bottom: 14px; color: white; }
    p { font-size: 14px; color: rgba(255,255,255,0.7); line-height: 1.7; margin-bottom: 16px; }
    .btn { display: inline-block; background: linear-gradient(135deg, #4f46e5, #6366f1); color: white; padding: 12px 28px; border-radius: 10px; text-decoration: none; font-weight: 700; font-size: 14px; margin: 8px 0; }
    .code-box { background: rgba(99,102,241,0.12); border: 1px dashed rgba(99,102,241,0.4); border-radius: 10px; padding: 16px 20px; text-align: center; margin: 16px 0; }
    .code { font-size: 28px; font-weight: 900; font-family: monospace; letter-spacing: 6px; color: #818cf8; }
    .divider { height: 1px; background: rgba(255,255,255,0.07); margin: 24px 0; }
    .footer { background: rgba(255,255,255,0.02); padding: 20px 40px; text-align: center; font-size: 12px; color: rgba(255,255,255,0.3); border-top: 1px solid rgba(255,255,255,0.05); }
    .highlight { color: #818cf8; font-weight: 600; }
  </style>
</head>
<body>
  <div style="padding: 24px; background: #0a0f1e;">
    <div class="container">
      <div class="header">
        <div class="logo">🤖 IntellMeet<span>AI-Powered Meeting Platform</span></div>
      </div>
      <div class="body">${content}</div>
      <div class="footer">
        © 2026 IntellMeet. Built for modern teams.<br>
        You received this because you have an IntellMeet account.
      </div>
    </div>
  </div>
</body>
</html>
`;

// ── Send helper ────────────────────────────────────────────────────────────
const sendEmail = async ({ to, subject, html }) => {
  if (!transporter) return; // silently skip if not configured

  await transporter.sendMail({
    from: `"IntellMeet" <${process.env.EMAIL_USER}>`,
    to,
    subject,
    html,
  });
};

// ── Welcome Email ──────────────────────────────────────────────────────────
const sendWelcomeEmail = async (email, name) => {
  const html = baseTemplate(`
    <div class="greeting">Welcome to IntellMeet, ${name}! 👋</div>
    <p>We're thrilled to have you on board. IntellMeet brings you <span class="highlight">AI-powered meetings</span>, real-time collaboration, and smart summaries — all in one place.</p>
    <p>Here's what you can do right now:</p>
    <p>✨ <strong>Start a meeting</strong> — instant video call with your team<br>
       📝 <strong>AI Summaries</strong> — let AI capture key decisions<br>
       ✅ <strong>Action items</strong> — never miss a follow-up<br>
       👥 <strong>Teams & Projects</strong> — Kanban boards for your whole team</p>
    <div class="divider"></div>
    <p style="color: rgba(255,255,255,0.4); font-size: 12px;">If you didn't sign up for IntellMeet, you can safely ignore this email.</p>
  `);

  await sendEmail({ to: email, subject: '🎉 Welcome to IntellMeet!', html });
};

// ── Meeting Scheduled Email ────────────────────────────────────────────────
const sendMeetingScheduledEmail = async (email, name, meeting) => {
  const scheduledDate = new Date(meeting.scheduledTime).toLocaleString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });

  const html = baseTemplate(`
    <div class="greeting">Meeting Scheduled 📅</div>
    <p>Hi ${name}, a new meeting has been scheduled for you.</p>
    <p><strong style="color:white;">📌 ${meeting.title}</strong></p>
    ${meeting.description ? `<p style="color:rgba(255,255,255,0.5);font-size:13px;">${meeting.description}</p>` : ''}
    <p>🗓️ <span class="highlight">${scheduledDate}</span></p>
    <p>Use this code to join the meeting:</p>
    <div class="code-box"><div class="code">${meeting.meetingCode}</div><p style="font-size:12px;margin-top:8px;color:rgba(255,255,255,0.4);">Share this code with participants</p></div>
    <p>Need to join the meeting? Just enter the code above on the IntellMeet dashboard.</p>
  `);

  await sendEmail({ to: email, subject: `📅 Meeting Scheduled: ${meeting.title}`, html });
};

// ── Action Items Email ─────────────────────────────────────────────────────
const sendActionItemsEmail = async (email, name, meeting, actionItems) => {
  const itemsHtml = actionItems.map(item => `
    <p style="padding: 8px 12px; background: rgba(255,255,255,0.03); border-left: 3px solid #6366f1; border-radius: 4px; margin: 8px 0;">
      ${item.completed ? '✅' : '🔲'} <strong style="color:white;">${item.task}</strong>
      ${item.assignee ? `<br><span style="font-size:12px;color:rgba(255,255,255,0.4);margin-left:24px;">Assigned to: ${item.assignee}</span>` : ''}
    </p>
  `).join('');

  const html = baseTemplate(`
    <div class="greeting">Meeting Summary — ${meeting.title}</div>
    <p>Hi ${name}, here are the action items from your recent meeting.</p>
    ${meeting.summary ? `<p style="background:rgba(99,102,241,0.08);border-radius:10px;padding:14px;border:1px solid rgba(99,102,241,0.15);">✨ <strong style="color:#818cf8;">AI Summary:</strong><br>${meeting.summary}</p>` : ''}
    <div class="divider"></div>
    <p><strong style="color:white;">✅ Action Items (${actionItems.length})</strong></p>
    ${itemsHtml || '<p>No action items were recorded for this meeting.</p>'}
  `);

  await sendEmail({ to: email, subject: `✅ Action Items: ${meeting.title}`, html });
};

// ── Password Reset Email ───────────────────────────────────────────────────
const sendPasswordResetEmail = async (email, name, resetUrl) => {
  const html = baseTemplate(`
    <div class="greeting">Reset Your Password 🔐</div>
    <p>Hi ${name}, we received a request to reset your password.</p>
    <p>Click the button below to set a new password. This link expires in <span class="highlight">1 hour</span>.</p>
    <p style="text-align:center;"><a href="${resetUrl}" class="btn">Reset Password</a></p>
    <div class="divider"></div>
    <p style="color: rgba(255,255,255,0.4); font-size: 12px;">If you didn't request this, please ignore this email. Your password will remain unchanged.</p>
  `);

  await sendEmail({ to: email, subject: '🔐 Reset Your IntellMeet Password', html });
};

// ── Email Verification Email ───────────────────────────────────────────────
const sendVerificationEmail = async (email, name, code) => {
  const html = baseTemplate(`
    <div class="greeting">Verify Your Email Address ✉️</div>
    <p>Hi ${name}, thank you for registering with IntellMeet!</p>
    <p>Please use the following verification code to complete your signup process. This code is valid for <span class="highlight">15 minutes</span>.</p>
    <div class="code-box">
      <div class="code">${code}</div>
      <p style="font-size:12px;margin-top:8px;color:rgba(255,255,255,0.4);">Enter this code on the verification screen</p>
    </div>
    <div class="divider"></div>
    <p style="color: rgba(255,255,255,0.4); font-size: 12px;">If you did not request this verification, you can safely ignore this email.</p>
  `);

  await sendEmail({ to: email, subject: '✉️ Verify your IntellMeet Email', html });
};

module.exports = {
  sendWelcomeEmail,
  sendMeetingScheduledEmail,
  sendActionItemsEmail,
  sendPasswordResetEmail,
  sendVerificationEmail,
};
