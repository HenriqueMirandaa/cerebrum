const fs = require('fs').promises;
const path = require('path');
const nodemailer = require('nodemailer');

const DEFAULT_APP_NAME = process.env.APP_NAME || 'Cerebrum';
const DEFAULT_APP_URL = process.env.APP_URL || 'http://localhost:3000';

function createTransport() {
    const host = process.env.SMTP_HOST;
    const port = parseInt(process.env.SMTP_PORT || '587', 10);
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;

    return nodemailer.createTransport({
        host,
        port,
        secure: port === 465,
        auth: user && pass ? { user, pass } : undefined,
    });
}

async function readTemplate(templateFile, replacements) {
    const templatePath = path.join(__dirname, '..', 'templates', templateFile);
    let html = await fs.readFile(templatePath, 'utf8');

    for (const [key, value] of Object.entries(replacements)) {
        html = html.replace(new RegExp(`{{\\s*${key}\\s*}}`, 'g'), String(value ?? ''));
    }

    return html;
}

async function sendMail({ to, subject, templateFile, replacements }) {
    const transporter = createTransport();
    const html = await readTemplate(templateFile, replacements);

    await transporter.sendMail({
        from: process.env.FROM_EMAIL || process.env.SMTP_USER,
        to,
        subject,
        html,
    });
}

async function sendWelcomeEmail(name, email) {
    try {
        await sendMail({
            to: email,
            subject: `Bem-vindo(a) ao ${DEFAULT_APP_NAME}`,
            templateFile: 'welcomeEmail.html',
            replacements: {
                name,
                appUrl: DEFAULT_APP_URL,
                appName: DEFAULT_APP_NAME,
            },
        });
        return true;
    } catch (err) {
        console.error('Erro ao enviar email de boas-vindas:', err);
        return false;
    }
}

async function sendPasswordResetEmail(name, email, resetUrl, expiresMinutes) {
    try {
        await sendMail({
            to: email,
            subject: `Redefinicao de senha - ${DEFAULT_APP_NAME}`,
            templateFile: 'passwordResetEmail.html',
            replacements: {
                name: name || 'utilizador',
                resetUrl,
                appUrl: DEFAULT_APP_URL,
                appName: DEFAULT_APP_NAME,
                expiresMinutes,
            },
        });
        return true;
    } catch (err) {
        console.error('Erro ao enviar email de redefinicao de senha:', err);
        return false;
    }
}

module.exports = { sendWelcomeEmail, sendPasswordResetEmail };
