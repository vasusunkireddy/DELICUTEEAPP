// utils/mailer.js
const nodemailer = require("nodemailer");
require("dotenv").config();

/**
 * Create a transporter. For Gmail:
 * - Turn on 2-Step Verification
 * - Create an App Password
 * - Put it in MAIL_PASS
 */
const transporter = nodemailer.createTransport({
  host: process.env.MAIL_HOST || "smtp.gmail.com",
  port: Number(process.env.MAIL_PORT || 465),
  secure: true, // 465 = SSL
  auth: {
    user: process.env.MAIL_USER,
    pass: process.env.MAIL_PASS,
  },
});

/** Optional: quick health check on boot (won’t crash the app). */
transporter.verify().then(
  () => console.log("✅ Mailer ready"),
  (err) => console.warn("⚠️ Mailer not ready:", err?.message)
);

/**
 * Send OTP email (10-minute validity copy).
 * @param {string} to
 * @param {string} otp - 6-digit string (keep leading zeros)
 */
async function sendOtpEmail(to, otp) {
  if (!to || !otp) throw new Error("sendOtpEmail: missing to/otp");

  const html = `
    <div style="font-family:Arial,Helvetica,sans-serif;line-height:1.6;color:#111">
      <h2 style="margin:0 0 8px 0">Your Delicute OTP</h2>
      <p>Use the code below to verify your login. It expires in <b>10 minutes</b>.</p>
      <div style="margin:16px 0;padding:12px 16px;background:#f3f3f3;border:1px solid #ddd;border-radius:8px;display:inline-block;">
        <span style="font-size:24px;letter-spacing:6px;font-weight:700">${otp}</span>
      </div>
      <p>If you didn’t request this, you can ignore this email.</p>
      <p style="margin-top:24px">— Team Delicute</p>
    </div>
  `;

  const info = await transporter.sendMail({
    from: `Delicute <${process.env.MAIL_USER}>`,
    to,
    subject: "Your Delicute OTP",
    html,
  });

  console.log("📧 OTP email sent:", info.messageId);
  return info;
}

/**
 * Send order status email (plain, professional)
 */
async function sendOrderStatusEmail({ to, name, orderId, status, reason }) {
  if (!to || !orderId || !status) {
    throw new Error("sendOrderStatusEmail: missing to/orderId/status");
  }

  const subject = `Update on your Delicute Order #${orderId}`;

  // Plain professional message for Delivered; simple for others
  const html =
    status === "Delivered"
      ? `
      <div style="font-family:Arial,Helvetica,sans-serif;line-height:1.6;color:#000">
        <p>Dear ${name || "Customer"},</p>
        <p>We are pleased to inform you that your order <b>#${orderId}</b> has been successfully delivered.</p>
        ${reason ? `<p><b>Note:</b> ${reason}</p>` : ""}
        <p>Thank you for choosing Delicute. We look forward to serving you again.</p>
        <p>Sincerely,<br/>Team Delicute</p>
        <hr style="border:none;border-top:1px solid #ccc"/>
        <small>You are receiving this email because you placed an order on Delicute.</small>
      </div>
    `
      : `
      <div style="font-family:Arial,Helvetica,sans-serif;line-height:1.6;color:#000">
        <p>Dear ${name || "Customer"},</p>
        <p>Your order <b>#${orderId}</b> status has been updated to <b>${status}</b>.</p>
        ${reason ? `<p><b>Reason:</b> ${reason}</p>` : ""}
        <p>Sincerely,<br/>Team Delicute</p>
        <hr style="border:none;border-top:1px solid #ccc"/>
        <small>You are receiving this email because you placed an order on Delicute.</small>
      </div>
    `;

  const info = await transporter.sendMail({
    from: `Delicute <${process.env.MAIL_USER}>`,
    to,
    subject,
    html,
  });

  console.log("✅ Status email sent:", info.messageId);
  return info;
}

module.exports = { sendOtpEmail, sendOrderStatusEmail };
