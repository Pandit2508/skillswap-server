/**
 * Sends transactional email via Brevo's HTTPS REST API instead of SMTP.
 *
 * Render's free tier blocks outbound traffic on SMTP ports (25, 465,
 * 587) as of Sept 2025, which broke the previous nodemailer/Gmail
 * SMTP setup with ETIMEDOUT errors. Brevo's API runs over standard
 * HTTPS (port 443), which isn't blocked, and its free tier (300
 * emails/day) supports single-sender verification without owning a
 * custom domain — no DNS/SPF/DKIM setup required to get started.
 *
 * Setup:
 *   1. Create a free account at https://www.brevo.com
 *   2. Verify a sender email (can be your existing Gmail address)
 *   3. Generate an API key under SMTP & API > API Keys
 *   4. Set BREVO_API_KEY and EMAIL_USER (the verified sender) in .env
 */

const BREVO_API_URL = "https://api.brevo.com/v3/smtp/email";

export const sendMail = async ({ to, subject, html }) => {
  const apiKey = process.env.BREVO_API_KEY;
  const senderEmail = process.env.EMAIL_USER;

  if (!apiKey || !senderEmail) {
    throw new Error(
      "Email is not configured: BREVO_API_KEY and EMAIL_USER must be set"
    );
  }

  const response = await fetch(BREVO_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "api-key": apiKey,
    },
    body: JSON.stringify({
      sender: { email: senderEmail, name: "SkillSwap Support" },
      to: [{ email: to }],
      subject,
      htmlContent: html,
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Brevo send failed (${response.status}): ${errorBody}`);
  }

  return response.json();
};

export default { sendMail };
