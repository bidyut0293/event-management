const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST,
  port: Number(process.env.EMAIL_PORT),
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

async function sendWelcomeEmail(to, name) {
  await transporter.sendMail({
    from: process.env.EMAIL_FROM,
    to,
    subject: 'Welcome to Event Manager!',
    text: `Hi ${name}, welcome! Your account has been created successfully.`,
  });
}

async function sendEventConfirmation(to, name, event) {
  await transporter.sendMail({
    from: process.env.EMAIL_FROM,
    to,
    subject: `Registration Confirmed: ${event.title}`,
    text: `Hi ${name}, you are registered for "${event.title}" on ${event.date} at ${event.time}.`,
  });
}

module.exports = { sendWelcomeEmail, sendEventConfirmation };
