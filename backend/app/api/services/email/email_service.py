"""
Email Service for User Invites
Simple email service using SMTP for sending invite notifications
"""
import os
import logging
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from typing import Optional

logger = logging.getLogger(__name__)


class EmailService:
    """
    Email service for sending notifications.
    Configure via environment variables:
    - SMTP_HOST
    - SMTP_PORT
    - SMTP_USER
    - SMTP_PASSWORD
    - SMTP_FROM_EMAIL
    - SMTP_FROM_NAME
    """
    
    def __init__(self):
        self.host = os.getenv("SMTP_HOST", "smtp.gmail.com")
        self.port = int(os.getenv("SMTP_PORT", "587"))
        self.user = os.getenv("SMTP_USER")
        self.password = os.getenv("SMTP_PASSWORD")
        self.from_email = os.getenv("SMTP_FROM_EMAIL", self.user)
        self.from_name = os.getenv("SMTP_FROM_NAME", "Pharma ERP")
        self.enabled = bool(self.user and self.password)
        
        if not self.enabled:
            logger.warning("Email service not configured. Set SMTP_USER and SMTP_PASSWORD env variables.")

    def send_invite_email(
        self,
        to_email: str,
        user_name: str,
        org_name: str,
        role_name: str,
        app_url: Optional[str] = None,
        temp_password: Optional[str] = None
    ) -> bool:
        """
        Send an invite email to a new user.
        
        Args:
            to_email: Recipient email
            user_name: Name of the new user
            org_name: Organization name
            role_name: Role assigned to the user
            app_url: URL to access the app
            temp_password: Temporary password if using password auth
            
        Returns:
            True if sent successfully, False otherwise
        """
        if not self.enabled:
            logger.info(f"Email service disabled. Would have sent invite to {to_email}")
            return False
        
        app_url = app_url or os.getenv("APP_URL", "https://pharma.up.railway.app")
        
        # HTML email template
        html_content = f"""
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <style>
                body {{ font-family: 'Segoe UI', Arial, sans-serif; line-height: 1.6; color: #333; }}
                .container {{ max-width: 600px; margin: 0 auto; padding: 20px; }}
                .header {{ background: linear-gradient(135deg, #2563eb, #4f46e5); color: white; padding: 30px; border-radius: 12px 12px 0 0; text-align: center; }}
                .content {{ background: #f9fafb; padding: 30px; border: 1px solid #e5e7eb; }}
                .footer {{ background: #f3f4f6; padding: 20px; border-radius: 0 0 12px 12px; text-align: center; font-size: 12px; color: #6b7280; }}
                .button {{ display: inline-block; background: #4f46e5; color: white; padding: 12px 30px; text-decoration: none; border-radius: 8px; font-weight: 600; }}
                .info-box {{ background: white; border: 1px solid #e5e7eb; border-radius: 8px; padding: 15px; margin: 20px 0; }}
                .info-row {{ display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #f3f4f6; }}
                .info-label {{ color: #6b7280; }}
                .info-value {{ font-weight: 600; }}
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1 style="margin: 0;">Welcome to Pharma ERP! 🎉</h1>
                </div>
                <div class="content">
                    <p>Hi <strong>{user_name}</strong>,</p>
                    <p>You've been invited to join <strong>{org_name}</strong> on Pharma ERP.</p>
                    
                    <div class="info-box">
                        <div class="info-row">
                            <span class="info-label">Your Role:</span>
                            <span class="info-value">{role_name}</span>
                        </div>
                        <div class="info-row">
                            <span class="info-label">Email:</span>
                            <span class="info-value">{to_email}</span>
                        </div>
                        {"<div class='info-row'><span class='info-label'>Temporary Password:</span><span class='info-value'>" + temp_password + "</span></div>" if temp_password else ""}
                    </div>
                    
                    <p>To get started, click the button below:</p>
                    
                    <p style="text-align: center; margin: 30px 0;">
                        <a href="{app_url}" class="button">Login to Pharma ERP</a>
                    </p>
                    
                    <p><strong>Login Options:</strong></p>
                    <ul>
                        <li>Use <strong>Sign in with Google</strong> if your email is a Google account</li>
                        {"<li>Or use your email and the temporary password above</li>" if temp_password else ""}
                    </ul>
                    
                    <p style="color: #6b7280; font-size: 14px;">
                        If you didn't expect this invite, please ignore this email or contact your administrator.
                    </p>
                </div>
                <div class="footer">
                    <p>© 2024 Pharma ERP - Enterprise Pharmaceutical Management</p>
                    <p>This is an automated message. Please do not reply.</p>
                </div>
            </div>
        </body>
        </html>
        """
        
        # Plain text fallback
        text_content = f"""
        Welcome to Pharma ERP!
        
        Hi {user_name},
        
        You've been invited to join {org_name} on Pharma ERP.
        
        Your Role: {role_name}
        Email: {to_email}
        {"Temporary Password: " + temp_password if temp_password else ""}
        
        Login at: {app_url}
        
        You can use "Sign in with Google" if your email is a Google account.
        
        If you didn't expect this invite, please ignore this email.
        """
        
        try:
            msg = MIMEMultipart("alternative")
            msg["Subject"] = f"You're invited to {org_name} on Pharma ERP"
            msg["From"] = f"{self.from_name} <{self.from_email}>"
            msg["To"] = to_email
            
            msg.attach(MIMEText(text_content, "plain"))
            msg.attach(MIMEText(html_content, "html"))
            
            with smtplib.SMTP(self.host, self.port) as server:
                server.starttls()
                server.login(self.user, self.password)
                server.send_message(msg)
            
            logger.info(f"Invite email sent successfully to {to_email}")
            return True
            
        except Exception as e:
            logger.error(f"Failed to send invite email to {to_email}: {e}")
            return False


# Singleton instance
email_service = EmailService()


def send_user_invite(
    to_email: str,
    user_name: str,
    org_name: str,
    role_name: str,
    temp_password: Optional[str] = None
) -> bool:
    """
    Convenience function to send user invite.
    Returns True if sent, False otherwise.
    """
    return email_service.send_invite_email(
        to_email=to_email,
        user_name=user_name,
        org_name=org_name,
        role_name=role_name,
        temp_password=temp_password
    )
