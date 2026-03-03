const fs = require('fs').promises;
const path = require('path');
const nodemailer = require('nodemailer');

async function sendWelcomeEmail(name, email) {
	try {
		const templatePath = path.join(__dirname, '..', 'templates', 'welcomeEmail.html');
		let html = await fs.readFile(templatePath, 'utf8');
		const appUrl = process.env.APP_URL || 'http://localhost:3000';
		html = html.replace(/{{\s*name\s*}}/g, name).replace(/{{\s*appUrl\s*}}/g, appUrl);

		const host = process.env.SMTP_HOST;
		const port = parseInt(process.env.SMTP_PORT || '587', 10);
		const user = process.env.SMTP_USER;
		const pass = process.env.SMTP_PASS;

		const transporter = nodemailer.createTransport({
			host,
			port,
			secure: port === 465, // true for 465, false for other ports (STARTTLS)
			auth: user && pass ? { user, pass } : undefined,
		});

		const mailOptions = {
			from: process.env.FROM_EMAIL || process.env.SMTP_USER,
			to: email,
			subject: 'Bem‑vindo(a) à Nome da Plataforma',
			html,
		};

		await transporter.sendMail(mailOptions);
		return true;
	} catch (err) {
		console.error('Erro ao enviar email de boas-vindas:', err);
		return false;
	}
}

module.exports = { sendWelcomeEmail };