import nodemailer from 'nodemailer';

// Global transporter instance reusing the same connection pool
export const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: Number(process.env.SMTP_PORT) || 587,
  secure: process.env.SMTP_SECURE === 'true', // true for 465, false for other ports
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS, // Use App Password if using Gmail
  },
});

// Helper for the default "From" address
export const defaultFrom = process.env.SMTP_FROM || `"CloudSync Admin" <${process.env.SMTP_USER}>`;
