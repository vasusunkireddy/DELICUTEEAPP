const nodemailer = require("nodemailer");
require("dotenv").config();

/**
 * Configure transporter with Gmail SMTP
 */
const transporter = nodemailer.createTransport({
  host: process.env.MAIL_HOST || "smtp.gmail.com",
  port: Number(process.env.MAIL_PORT || 465),
  secure: true,
  auth: {
    user: process.env.MAIL_USER,
    pass: process.env.MAIL_PASS,
  },
});

// Health check
transporter.verify().then(
  () => console.log("✅ Mailer ready"),
  (err) => console.warn("⚠️ Mailer not ready:", err?.message)
);

/**
 * ✅ Send OTP Email (valid for 10 minutes)
 */
async function sendOtpEmail(to, otp) {
  if (!to || !otp) throw new Error("sendOtpEmail: missing to/otp");

  const subject = "Your Delicute Login OTP";

  const text = `Dear User,\n\nYour OTP for login is: ${otp}\nThis code is valid for 10 minutes. Do not share it with anyone.\n\nIf you did not request this, please ignore this message.\n\nRegards,\nTeam Delicute`;

  const html = `
  <!DOCTYPE html>
  <html>
    <body style="font-family: Arial, Helvetica, sans-serif; font-size: 16px; color: #000; background: #fff; padding: 20px;">
      <div style="max-width: 600px; margin: 0 auto;">
        <h2 style="margin-bottom: 15px;">Delicute Login OTP</h2>
        <p>Dear User,</p>
        <p>Your OTP for login is:</p>
        <p style="font-size: 22px; font-weight: bold; letter-spacing: 4px; margin: 20px 0;">${otp}</p>
        <p>This OTP is valid for 10 minutes. Do not share it with anyone.</p>
        <p>If you did not request this, please ignore this message.</p>
        <p style="margin-top: 30px;">Regards,<br/>Team Delicute</p>
        <hr style="border: none; border-top: 1px solid #ccc; margin: 20px 0;" />
        <p style="font-size: 12px; color: #555;">You are receiving this email because you requested a login OTP on Delicute.</p>
      </div>
    </body>
  </html>
  `;

  const info = await transporter.sendMail({
    from: `Delicute <${process.env.MAIL_USER}>`,
    to,
    subject,
    text,
    html,
  });

  console.log("📧 OTP email sent:", info.messageId);
  return info;
}

/**
 * ✅ Send Order Status Email (Delivered, Cancelled, Shipped, Processing)
 */
async function sendOrderStatusEmail({ to, name, orderId, status, reason }) {
  if (!to || !orderId || !status) {
    throw new Error("sendOrderStatusEmail: missing to/orderId/status");
  }

  const subject = `Delicute Order #${orderId} - Status Update`;

  // Define messages for each status
  const statusMessage = {
    Delivered: `Your order #${orderId} has been successfully delivered.`,
    Cancelled: `We regret to inform you that your order #${orderId} has been cancelled.`,
    Processing: `Your order #${orderId} is currently being processed.`,
    Shipped: `Your order #${orderId} has been shipped and is on its way.`,
  };

  const messageBody = statusMessage[status] || `Your order #${orderId} status has been updated to ${status}.`;

  const text = `Dear ${name || "Customer"},\n\n${messageBody}\n${reason ? `Note: ${reason}\n` : ""}\nThank you for choosing Delicute.\n\nRegards,\nTeam Delicute`;

  const html = `
  <!DOCTYPE html>
  <html>
    <body style="font-family: Arial, Helvetica, sans-serif; font-size: 16px; color: #000; background: #fff; padding: 20px;">
      <div style="max-width: 600px; margin: 0 auto;">
        <h2 style="margin-bottom: 15px;">Order Update - #${orderId}</h2>
        <p>Dear ${name || "Customer"},</p>
        <p>${messageBody}</p>
        ${reason ? `<p><strong>Note:</strong> ${reason}</p>` : ""}
        <p>Thank you for choosing Delicute. We appreciate your trust and look forward to serving you again.</p>
        <p style="margin-top: 30px;">Regards,<br/>Team Delicute</p>
        <hr style="border: none; border-top: 1px solid #ccc; margin: 20px 0;" />
        <p style="font-size: 12px; color: #555;">You are receiving this email because you placed an order on Delicute.</p>
      </div>
    </body>
  </html>
  `;

  const info = await transporter.sendMail({
    from: `Delicute <${process.env.MAIL_USER}>`,
    to,
    subject,
    text,
    html,
  });

  console.log("✅ Order status email sent:", info.messageId);
  return info;
}

module.exports = { sendOtpEmail, sendOrderStatusEmail };
