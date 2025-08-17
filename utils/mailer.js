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
      <h2 style="margin:0 0 8px 0;color:#6B46C1">Your Delicute OTP</h2>
      <p>Use the code below to verify your login. It expires in <b>10 minutes</b>.</p>
      <div style="margin:16px 0;padding:12px 16px;background:#F3E8FF;border:1px solid #E9D8FD;border-radius:8px;display:inline-block;">
        <span style="font-size:24px;letter-spacing:6px;font-weight:700;color:#4C1D95">${otp}</span>
      </div>
      <p>If you didn’t request this, you can ignore this email.</p>
      <p style="margin-top:24px;color:#555">— Team Delicute</p>
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
 * Order status email (your original, slightly polished).
 */
async function sendOrderStatusEmail({ to, name, orderId, status, reason }) {
  if (!to || !orderId || !status) {
    throw new Error("sendOrderStatusEmail: missing to/orderId/status");
  }

  const subject = `Update on your Delicute Order #${orderId}`;

  const statusLine =
    status === "Cancelled"
      ? `We’re sorry to let you know that your order <b>#${orderId}</b> has been <b>cancelled</b>.`
      : `Great news! Your order <b>#${orderId}</b> is now <b>${status}</b>.`;

  const couponBlock =
    status === "Delivered"
      ? `
      <p style="background:#FDF2E9;padding:12px;border-radius:8px">
        We hope every bite brings a smile 😊.<br/>
        As a thank-you, enjoy <b>₹50 off</b> your next order with code:<br/>
        <span style="display:inline-block;background:#ff6b6b;color:#fff;
              padding:6px 12px;border-radius:6px;font-weight:600;letter-spacing:1px">
          TASTY50
        </span><br/>
        Valid for 7 days — don’t miss it!
      </p>`
      : "";

  const html = `
    <div style="font-family:Arial,Helvetica,sans-serif;line-height:1.6;color:#1f2937">
      <h2 style="color:#ff6b6b;margin-bottom:0">
        Hey ${name || "Foodie"}! 🍲
      </h2>
      <p style="margin-top:4px">${statusLine}</p>
      ${reason ? `<p><b>Reason:</b> ${reason}</p>` : ""}
      ${couponBlock}
      <p>
        Got feedback or cravings we should know about? Just reply to this email
        — we love chatting with fellow food lovers.
      </p>
      <p style="margin-top:24px">
        Stay hungry, stay happy!<br/>
        <b style="color:#ff6b6b">Team Delicute</b>
      </p>
      <hr style="margin-top:32px;border:none;border-top:1px solid #e5e7eb"/>
      <small style="color:#6b7280">
        You're receiving this email because you placed an order on Delicute.
        If you didn’t make this request, please contact support.
      </small>
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
