// utils/mailer.js
const nodemailer = require('nodemailer');
require('dotenv').config(); // fine to keep, but ideally call once in server.js

const {
  MAIL_USER,        // e.g. your Gmail address
  MAIL_PASS,        // Gmail App Password (NOT your normal password)
  MAIL_DISABLE,     // "1" to disable real sending (logs OTP instead)
} = process.env;

// Single reusable transporter (Gmail SMTP).
// If you use a different provider later, just change these lines.
const transporter = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 465,
  secure: true, // SSL
  auth: { user: MAIL_USER, pass: MAIL_PASS },
});

/** ─────────────────────────────────────────────────
 * Send OTP email (used by /auth/send-otp)
 * - If MAIL_DISABLE=1 OR creds missing, it will just log the OTP and NOT throw
 * ───────────────────────────────────────────────── */
async function sendOtpEmail(to, otp) {
  // Safe fallback: don’t crash in dev/staging if SMTP missing
  if (MAIL_DISABLE === '1' || !MAIL_USER || !MAIL_PASS) {
    console.log(`📬 [OTP MOCK] to=${to} otp=${otp}`);
    return { mocked: true };
  }

  const subject = 'Your Delicute OTP';
  const html = `
    <div style="font-family:Arial,Helvetica,sans-serif;line-height:1.6;color:#111827">
      <h2 style="margin:0 0 8px 0;color:#6B46C1">One-Time Password</h2>
      <p>Use the code below to sign in. It expires in <b>10 minutes</b>.</p>
      <div style="font-size:28px;font-weight:700;letter-spacing:6px;margin:16px 0">
        ${otp}
      </div>
      <p>If you didn’t request this, you can ignore this email.</p>
      <p style="margin-top:24px;color:#6b7280">— Team Delicute</p>
    </div>
  `;

  const info = await transporter.sendMail({
    from: `Delicute <${MAIL_USER}>`,
    to,
    subject,
    html,
  });
  console.log('✅ OTP email sent:', info.messageId);
  return info;
}

/** ─────────────────────────────────────────────────
 * Send order status email (your existing function)
 * ───────────────────────────────────────────────── */
async function sendOrderStatusEmail({ to, name, orderId, status, reason }) {
  // Safe fallback as well
  if (MAIL_DISABLE === '1' || !MAIL_USER || !MAIL_PASS) {
    console.log(`📬 [ORDER MAIL MOCK] to=${to} order=${orderId} status=${status} reason=${reason || '-'}`);
    return { mocked: true };
  }

  const subject = `Update on your Delicute Order #${orderId}`;
  const statusLine =
    status === 'Cancelled'
      ? `We’re sorry to let you know that your order <b>#${orderId}</b> has been <b>cancelled</b>.`
      : `Great news! Your order <b>#${orderId}</b> is now <b>${status}</b>.`;

  const couponBlock =
    status === 'Delivered'
      ? `
      <p style="background:#FDF2E9;padding:12px;border-radius:8px">
        Enjoy <b>₹50 off</b> your next order with code:
        <span style="display:inline-block;background:#ff6b6b;color:#fff;
              padding:6px 12px;border-radius:6px;font-weight:600;letter-spacing:1px">
          TASTY50
        </span><br/>Valid for 7 days.
      </p>`
      : '';

  const html = `
    <div style="font-family:Arial,Helvetica,sans-serif;line-height:1.6;color:#1f2937">
      <h2 style="color:#ff6b6b;margin-bottom:0">Hey ${name || 'Foodie'}! 🍲</h2>
      <p style="margin-top:4px">${statusLine}</p>
      ${reason ? `<p><b>Reason:</b> ${reason}</p>` : ''}
      ${couponBlock}
      <p>Got feedback? Just reply to this email.</p>
      <p style="margin-top:24px"><b style="color:#ff6b6b">Team Delicute</b></p>
      <hr style="margin-top:32px;border:none;border-top:1px solid #e5e7eb"/>
      <small style="color:#6b7280">
        You’re receiving this because you placed an order on Delicute.
      </small>
    </div>
  `;

  const info = await transporter.sendMail({
    from: `Delicute <${MAIL_USER}>`,
    to,
    subject,
    html,
  });

  console.log('✅ Order email sent:', info.messageId);
  return info;
}

module.exports = { sendOtpEmail, sendOrderStatusEmail };
