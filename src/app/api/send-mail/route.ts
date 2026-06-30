import { NextResponse } from 'next/server';
import { transporter, defaultFrom } from '@/lib/mail';
import { logger } from '@/lib/logger';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { to, subject = 'CloudSync Notification', template } = body;

    // Validate request
    if (!to || !template) {
      logger.warn('Send Mail attempt failed: Missing fields', { to, hasTemplate: !!template });
      return NextResponse.json(
        { error: 'Missing required fields: to, template (HTML string).' },
        { status: 400 }
      );
    }

    // Setup email data
    const mailOptions = {
      from: defaultFrom,
      to,
      cc: 'manish@cstech.in',
      subject,
      html: template, // the template string is directly used as HTML
    };

    // Send email
    const info = await transporter.sendMail(mailOptions);

    logger.info('Email dispatched successfully', { to, subject, messageId: info.messageId });

    return NextResponse.json({ 
      success: true, 
      messageId: info.messageId, 
      message: 'Email dispatched successfully.' 
    });
    
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Error sending email via nodemailer', { error: message });
    return NextResponse.json(
      { error: message || 'An unexpected error occurred while sending the email.' }, 
      { status: 500 }
    );
  }
}
