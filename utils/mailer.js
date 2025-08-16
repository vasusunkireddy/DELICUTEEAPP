const nodemailer = require("nodemailer");
require("dotenv").config();

/**
 * Nodemailer transporter
 * Gmail requires App Passwords (not your normal password).
 * Enable 2FA → Generate an App Password → paste into MAIL_PASS in Render.
 */
const transporter = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 465,
  secure: true, // true = SSL
  auth: {
    user: process.env.MAIL_USER,
    pass: process.env.MAIL_PASS,
  },
});

/**
 * Sends a polished HTML e-mail when order status changes.
 * @param {Object} param0
 * @param {string} param0.to - Recipient email
 * @param {string} param0.name - Customer name
 * @param {string} param0.orderId - Order ID
 * @param {string} param0.status - Order status (Delivered, Cancelled, etc.)
 * @param {string} [param0.reason] - Optional reason (for cancelled orders)
 */
async function sendOrderStatusEmail({ to, name, orderId, status, reason }) {
  try {
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

    console.log("✅ Email sent:", info.messageId);
    return info;
  } catch (err) {
    console.error("❌ Email sending failed:", err.message);
    throw err;
  }
}

module.exports = { sendOrderStatusEmail };
