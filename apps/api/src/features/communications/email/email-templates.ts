import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function getTemplate(type: 'welcome' | 'verification', data: any) {
  switch (type) {
    case 'welcome':
      return {
        subject: `Welcome to Accountable, ${data.name}!`,
        html: `<p>Hi ${data.name}, welcome to <strong>Accountable</strong> 🎉</p>`,
        text: `Hi ${data.name}, welcome to Accountable!`,
      };
    case 'verification':
      return {
        subject: 'Verify Your Email',
        html: `
            <p>Your verification code is: <strong>${data.code}</strong></p>
            <p>It expires in 24 hours.</p>
          `,
        text: `Your verification code is: ${data.code}. It expires in 24 hours.`,
      };
    default:
      throw new Error('Unknown email type');
  }
}

export function getVerifyEmailTemplate(name: string, url: string) {
  return {
    subject: 'Verify your email',
    html: `<p>Hello ${name},</p><p>Please verify your email by clicking <a href="${url}">here</a>.</p>`,
    text: `Hello ${name},\n\nPlease verify your email using this link: ${url}`,
  };
}

export function getUserInviteTemplate(
  url: string,
  invitedByUser: any,
  invitedByOrg: any,
) {
  const templatePath = path.join(__dirname, 'invitation.html');
  console.log(templatePath);
  let template = fs.readFileSync(templatePath, 'utf-8');

  const inviteSenderName = invitedByUser.firstname || invitedByUser.email;
  const inviteSenderOrganizationName = invitedByOrg.name || '';

  template = template
    .replace(/{{action_url}}/g, url)
    .replace(/[Product Name]/g, 'Accountable')
    .replace(/{{support_email}}/g, 'support@getaccountable.com')
    .replace(/{{invite_sender_name}}/g, inviteSenderName)
    .replace(
      /{{invite_sender_organization_name}}/g,
      inviteSenderOrganizationName,
    );

  return {
    subject: 'Invitation to Accountable',
    html: template,
  };
}
