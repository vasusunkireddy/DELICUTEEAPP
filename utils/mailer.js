const nodemailer = require('nodemailer');
require('dotenv').config();

/**
 * Create a transporter.
 * For Gmail:
 * - Turn on 2-Step Verification
 * - Create an App Password
 * - Put it in MAIL_PASS
 */
const transporter = nodemailer.createTransport({
  host: process.env.MAIL_HOST || 'smtp.gmail.com',
  port: Number(process.env.MAIL_PORT || 465),
  secure: true, // SSL
  auth: {
    user: process.env.MAIL_USER,
    pass: process.env.MAIL_PASS,
  },
});

// Quick health check
transporter.verify().then(
  () => console.log('✅ Mailer ready'),
  (err) => console.error('❌ Mailer not ready:', err.message)
);

/**
 * Send OTP email (10-minute validity)
 */
async function sendOtpEmail(to, otp) {
  if (!to || !otp) throw new Error('sendOtpEmail: missing to/otp');

  const html = `
    <div style="font-family:Arial,Helvetica,sans-serif;line-height:1.6;color:#000">
      <p>Dear User,</p>
      <p>Your Delicute OTP for login is:</p>
      <p style="font-weight:700;font-size:20px;letter-spacing:4px;margin:10px 0;">${otp}</p>
      <p>This OTP is valid for 10 minutes. Do not share it with anyone.</p>
      <p>If you did not request this, please ignore this message.</p>
      <p>Sincerely,<br/>Team Delicute</p>
      <hr style="border:none;border-top:1px solid #ccc"/>
      <small>You are receiving this email because you requested a login OTP on Delicute.</small>
    </div>
  `;

  try {
    const info = await transporter.sendMail({
      from: `Delicute <${process.env.MAIL_USER}>`,
      to,
      subject: 'Delicute Login OTP',
      html,
    });
    console.log('📧 OTP email sent:', info.messageId);
    return info;
  } catch (error) {
    console.error('❌ OTP email failed:', error.message);
    throw error;
  }
}

/**
 * Send order status email (plain and professional)
 */
async function sendOrderStatusEmail({ to, name, orderId, status, reason }) {
  if (!to || !orderId || !status) {
    throw new Error('sendOrderStatusEmail: missing to/orderId/status');
  }

  const subject = `Delicute Order #${orderId} - Status Update`;

  const statusMessage = {
    Pending: `Your order #${orderId} has been received and is pending confirmation.`,
    Confirmed: `Your order #${orderId} has been confirmed and is being prepared.`,
    Shipped: `Your order #${orderId} has been shipped and is on the way.`,
    Delivered: `We are pleased to inform you that your order #${orderId} has been successfully delivered.`,
    Cancelled: `We regret to inform you that your order #${orderId} has been cancelled.`,
    Refunded: `Your order #${orderId} has been refunded.`,
  };

  const messageBody = statusMessage[status] || `Your order #${orderId} status has been updated to ${status}.`;

  const html = `
    <div style="font-family:Arial,Helvetica,sans-serif;line-height:1.6;color:#000">
      <p>Dear ${name || 'Customer'},</p>
      <p>${messageBody}</p>
      ${reason ? `<p><b>Note:</b> ${reason}</p>` : ''}
      <p>Thank you for choosing Delicute. We value your trust and look forward to serving you again.</p>
      <p>Sincerely,<br/>Team Delicute</p>
      <hr style="border:none;border-top:1px solid #ccc"/>
      <small>You are receiving this email because you placed an order on Delicute.</small>
    </div>
  `;

  try {
    const info = await transporter.sendMail({
      from: `Delicute <${process.env.MAIL_USER}>`,
      to,
      subject,
      html,
    });
    console.log('✅ Status email sent:', info.messageId);
    return info;
  } catch (error) {
    console.error('❌ Status email failed:', error.message);
    throw error;
  }
}

module.exports = { sendOtpEmail, sendOrderStatusEmail };