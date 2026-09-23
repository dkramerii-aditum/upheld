// Staff email. Staff facing only; members are reached by text message.
//
// console: development only. Prints the email to the terminal running
//          npm run dev. Refused in production.
// resend:  sends through Resend's HTTP API.
// disabled: sends nothing and reports failure.

import { config } from '@/lib/config';

export type OutgoingEmail = { to: string; subject: string; text: string };

export async function sendEmail(msg: OutgoingEmail): Promise<boolean> {
  const provider = config.emailProvider();

  if (provider === 'console') {
    if (config.isProduction()) {
      console.error('EMAIL_PROVIDER=console is not allowed in production. No email sent.');
      return false;
    }
    console.log(
      ['', '==== Upheld development email ====', `To: ${msg.to}`, `Subject: ${msg.subject}`, '', msg.text, '==================================', ''].join('\n')
    );
    return true;
  }

  if (provider === 'resend') {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.resendApiKey()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ from: config.emailFrom(), to: [msg.to], subject: msg.subject, text: msg.text }),
    });
    if (!res.ok) {
      console.error(`Email provider returned status ${res.status}. No content logged.`);
      return false;
    }
    return true;
  }

  console.error('Email is disabled (EMAIL_PROVIDER=disabled). No email sent.');
  return false;
}
