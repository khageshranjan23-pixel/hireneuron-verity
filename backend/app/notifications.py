"""
RTPL HireNeuron Verity - Notification & Transactional Email Delivery System
Supports SMTP delivery (Resend, SendGrid, SES, generic TLS SMTP) with fallback to in-app invitations.
"""
import os
import smtplib
import logging
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from typing import Optional, Dict, Any

logger = logging.getLogger("rtpl.notifications")

SMTP_HOST = os.getenv("SMTP_HOST", "")
SMTP_PORT = int(os.getenv("SMTP_PORT", "587"))
SMTP_USER = os.getenv("SMTP_USER", "")
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD", "")
SMTP_FROM = os.getenv("SMTP_FROM", "interviews@rtpl.internal")
ORGANIZATION_NAME = os.getenv("ORGANIZATION_NAME", "RTPL")

def is_smtp_configured() -> bool:
    return bool(SMTP_HOST and SMTP_USER and SMTP_PASSWORD)

def send_email(to_email: str, subject: str, html_content: str, text_content: Optional[str] = None) -> Dict[str, Any]:
    """
    Sends an email using configured SMTP provider. If unconfigured, records event cleanly.
    """
    if not is_smtp_configured():
        logger.info(f"[In-App Notification Only] SMTP not configured. Recipient: {to_email}, Subject: '{subject}'")
        return {
            "delivered": False,
            "provider": "unconfigured",
            "reason": "SMTP credentials not configured in environment; invitation details accessible via Recruiter Dashboard",
            "subject": subject,
            "recipient": to_email
        }

    try:
        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"] = f"{ORGANIZATION_NAME} Recruitment <{SMTP_FROM}>"
        msg["To"] = to_email

        if text_content:
            msg.attach(MIMEText(text_content, "plain"))
        msg.attach(MIMEText(html_content, "html"))

        with smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=10) as server:
            server.starttls()
            server.login(SMTP_USER, SMTP_PASSWORD)
            server.sendmail(SMTP_FROM, [to_email], msg.as_string())

        logger.info(f"Successfully delivered email to {to_email}")
        return {"delivered": True, "provider": "smtp", "recipient": to_email}
    except Exception as e:
        logger.error(f"Failed to send email to {to_email}: {e}")
        return {"delivered": False, "provider": "smtp", "error": str(e), "recipient": to_email}

def send_candidate_credentials(candidate_email: str, candidate_name: str, candidate_code: str, temp_password: str, portal_url: str) -> Dict[str, Any]:
    subject = f"Your {ORGANIZATION_NAME} Candidate Portal Access Credentials"
    html = f"""
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 8px;">
        <h2 style="color: #0f172a; margin-top: 0;">Welcome to {ORGANIZATION_NAME} HireNeuron Verity</h2>
        <p>Dear {candidate_name},</p>
        <p>A candidate account has been created for your interview evaluation process at {ORGANIZATION_NAME}. Please find your login credentials below:</p>
        <div style="background-color: #f8fafc; border: 1px solid #cbd5e1; border-radius: 6px; padding: 16px; margin: 20px 0;">
            <p style="margin: 0 0 8px 0;"><strong>Candidate ID:</strong> <code style="font-size: 16px; color: #0284c7;">{candidate_code}</code></p>
            <p style="margin: 0;"><strong>Temporary Password:</strong> <code style="font-size: 16px; color: #334155;">{temp_password}</code></p>
        </div>
        <p>To access your dashboard and prepare for your interview:</p>
        <p><a href="{portal_url}" style="display: inline-block; background-color: #0f172a; color: #ffffff; padding: 10px 20px; border-radius: 6px; text-decoration: none; font-weight: bold;">Log In to Candidate Portal</a></p>
        <p style="font-size: 12px; color: #64748b; margin-top: 24px;">This is an automated notification from {ORGANIZATION_NAME}. Please do not reply directly to this email.</p>
    </div>
    """
    return send_email(candidate_email, subject, html)

def send_interview_invitation(candidate_email: str, candidate_name: str, job_title: str, scheduled_formatted: str, setup_url: str) -> Dict[str, Any]:
    subject = f"Interview Scheduled: {job_title} at {ORGANIZATION_NAME}"
    html = f"""
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 8px;">
        <h2 style="color: #0f172a; margin-top: 0;">AI Autonomous Interview Scheduled</h2>
        <p>Dear {candidate_name},</p>
        <p>Your interview for the position of <strong>{job_title}</strong> at {ORGANIZATION_NAME} has been scheduled.</p>
        <div style="background-color: #f8fafc; border: 1px solid #cbd5e1; border-radius: 6px; padding: 16px; margin: 20px 0;">
            <p style="margin: 0 0 8px 0;"><strong>Scheduled Time:</strong> {scheduled_formatted}</p>
            <p style="margin: 0;"><strong>Platform:</strong> {ORGANIZATION_NAME} HireNeuron Verity</p>
        </div>
        <p>You can join the pre-flight onboarding room 15 minutes before your scheduled start time:</p>
        <p><a href="{setup_url}" style="display: inline-block; background-color: #0284c7; color: #ffffff; padding: 10px 20px; border-radius: 6px; text-decoration: none; font-weight: bold;">Complete Pre-Flight Onboarding</a></p>
        <p style="font-size: 13px; color: #475569;">Requirements: A laptop with camera and microphone, Chrome or Edge browser, and a quiet, well-lit room.</p>
    </div>
    """
    return send_email(candidate_email, subject, html)
