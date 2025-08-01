"""
Messaging Services for SMS, WhatsApp, and Email
"""
import os
import logging
from typing import Dict, Optional, List
import requests
from twilio.rest import Client as TwilioClient
import boto3
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

logger = logging.getLogger(__name__)

class SMSService:
    """Service for sending SMS messages"""
    
    def __init__(self):
        self.provider = os.getenv("SMS_PROVIDER", "twilio")
        
        if self.provider == "twilio":
            self.client = TwilioClient(
                os.getenv("TWILIO_ACCOUNT_SID"),
                os.getenv("TWILIO_AUTH_TOKEN")
            )
            self.from_number = os.getenv("TWILIO_PHONE_NUMBER")
            
        elif self.provider == "msg91":
            self.api_key = os.getenv("MSG91_API_KEY")
            self.sender_id = os.getenv("MSG91_SENDER_ID", "AASOPH")
            
    def send(self, to_phone: str, message: str, **kwargs) -> Dict:
        """Send SMS message"""
        try:
            if self.provider == "twilio":
                return self._send_twilio(to_phone, message, **kwargs)
            elif self.provider == "msg91":
                return self._send_msg91(to_phone, message, **kwargs)
            else:
                logger.warning(f"SMS provider {self.provider} not configured")
                return {"status": "error", "message": "SMS provider not configured"}
                
        except Exception as e:
            logger.error(f"Error sending SMS: {e}")
            return {"status": "error", "message": str(e)}
            
    def _send_twilio(self, to_phone: str, message: str, **kwargs) -> Dict:
        """Send SMS via Twilio"""
        try:
            message = self.client.messages.create(
                body=message,
                from_=self.from_number,
                to=to_phone
            )
            
            return {
                "status": "success",
                "message_id": message.sid,
                "provider": "twilio"
            }
        except Exception as e:
            raise Exception(f"Twilio error: {e}")
            
    def _send_msg91(self, to_phone: str, message: str, **kwargs) -> Dict:
        """Send SMS via MSG91"""
        try:
            url = "https://api.msg91.com/api/v5/flow/"
            
            payload = {
                "sender": self.sender_id,
                "route": "4",  # Transactional route
                "country": "91",
                "sms": [
                    {
                        "message": message,
                        "to": [to_phone.replace("+91", "")]
                    }
                ]
            }
            
            headers = {
                "authkey": self.api_key,
                "Content-Type": "application/json"
            }
            
            response = requests.post(url, json=payload, headers=headers)
            response.raise_for_status()
            
            result = response.json()
            
            return {
                "status": "success",
                "message_id": result.get("request_id"),
                "provider": "msg91"
            }
        except Exception as e:
            raise Exception(f"MSG91 error: {e}")


class WhatsAppService:
    """Service for sending WhatsApp messages"""
    
    def __init__(self):
        self.provider = os.getenv("WHATSAPP_PROVIDER", "twilio")
        
        if self.provider == "twilio":
            self.client = TwilioClient(
                os.getenv("TWILIO_ACCOUNT_SID"),
                os.getenv("TWILIO_AUTH_TOKEN")
            )
            self.from_number = os.getenv("TWILIO_WHATSAPP_NUMBER", "whatsapp:+14155238886")
            
        elif self.provider == "wati":
            self.api_key = os.getenv("WATI_API_KEY")
            self.base_url = os.getenv("WATI_BASE_URL", "https://api.wati.io")
            
    def send(self, to_phone: str, message: str, template_name: Optional[str] = None, **kwargs) -> Dict:
        """Send WhatsApp message"""
        try:
            # Ensure phone number has WhatsApp prefix
            if not to_phone.startswith("whatsapp:"):
                to_phone = f"whatsapp:{to_phone}"
                
            if self.provider == "twilio":
                return self._send_twilio(to_phone, message, **kwargs)
            elif self.provider == "wati":
                return self._send_wati(to_phone, message, template_name, **kwargs)
            else:
                logger.warning(f"WhatsApp provider {self.provider} not configured")
                return {"status": "error", "message": "WhatsApp provider not configured"}
                
        except Exception as e:
            logger.error(f"Error sending WhatsApp: {e}")
            return {"status": "error", "message": str(e)}
            
    def _send_twilio(self, to_phone: str, message: str, **kwargs) -> Dict:
        """Send WhatsApp via Twilio"""
        try:
            message = self.client.messages.create(
                body=message,
                from_=self.from_number,
                to=to_phone
            )
            
            return {
                "status": "success",
                "message_id": message.sid,
                "provider": "twilio"
            }
        except Exception as e:
            raise Exception(f"Twilio WhatsApp error: {e}")
            
    def _send_wati(self, to_phone: str, message: str, template_name: Optional[str], **kwargs) -> Dict:
        """Send WhatsApp via WATI"""
        try:
            # Remove whatsapp: prefix for WATI
            phone = to_phone.replace("whatsapp:", "")
            
            if template_name:
                # Send template message
                url = f"{self.base_url}/api/v1/sendTemplateMessage"
                payload = {
                    "whatsappNumber": phone,
                    "templateName": template_name,
                    "parameters": kwargs.get("parameters", [])
                }
            else:
                # Send text message
                url = f"{self.base_url}/api/v1/sendSessionMessage"
                payload = {
                    "whatsappNumber": phone,
                    "messageText": message
                }
                
            headers = {
                "Authorization": f"Bearer {self.api_key}",
                "Content-Type": "application/json"
            }
            
            response = requests.post(url, json=payload, headers=headers)
            response.raise_for_status()
            
            result = response.json()
            
            return {
                "status": "success",
                "message_id": result.get("messageId"),
                "provider": "wati"
            }
        except Exception as e:
            raise Exception(f"WATI error: {e}")


class EmailService:
    """Service for sending emails"""
    
    def __init__(self):
        self.provider = os.getenv("EMAIL_PROVIDER", "smtp")
        
        if self.provider == "smtp":
            self.smtp_host = os.getenv("SMTP_HOST", "smtp.gmail.com")
            self.smtp_port = int(os.getenv("SMTP_PORT", "587"))
            self.smtp_user = os.getenv("SMTP_USER")
            self.smtp_password = os.getenv("SMTP_PASSWORD")
            self.from_email = os.getenv("FROM_EMAIL", self.smtp_user)
            self.from_name = os.getenv("FROM_NAME", "AASO Pharmaceuticals")
            
        elif self.provider == "ses":
            self.ses_client = boto3.client(
                'ses',
                region_name=os.getenv("AWS_REGION", "ap-south-1"),
                aws_access_key_id=os.getenv("AWS_ACCESS_KEY_ID"),
                aws_secret_access_key=os.getenv("AWS_SECRET_ACCESS_KEY")
            )
            self.from_email = os.getenv("FROM_EMAIL")
            self.from_name = os.getenv("FROM_NAME", "AASO Pharmaceuticals")
            
    def send(
        self, 
        to_emails: List[str], 
        subject: str, 
        body_text: str, 
        body_html: Optional[str] = None,
        cc_emails: Optional[List[str]] = None,
        bcc_emails: Optional[List[str]] = None,
        attachments: Optional[List[Dict]] = None,
        **kwargs
    ) -> Dict:
        """Send email message"""
        try:
            if self.provider == "smtp":
                return self._send_smtp(
                    to_emails, subject, body_text, body_html, 
                    cc_emails, bcc_emails, attachments
                )
            elif self.provider == "ses":
                return self._send_ses(
                    to_emails, subject, body_text, body_html,
                    cc_emails, bcc_emails
                )
            else:
                logger.warning(f"Email provider {self.provider} not configured")
                return {"status": "error", "message": "Email provider not configured"}
                
        except Exception as e:
            logger.error(f"Error sending email: {e}")
            return {"status": "error", "message": str(e)}
            
    def _send_smtp(
        self,
        to_emails: List[str],
        subject: str,
        body_text: str,
        body_html: Optional[str],
        cc_emails: Optional[List[str]],
        bcc_emails: Optional[List[str]],
        attachments: Optional[List[Dict]]
    ) -> Dict:
        """Send email via SMTP"""
        import smtplib
        
        try:
            # Create message
            msg = MIMEMultipart('alternative')
            msg['Subject'] = subject
            msg['From'] = f"{self.from_name} <{self.from_email}>"
            msg['To'] = ', '.join(to_emails)
            
            if cc_emails:
                msg['Cc'] = ', '.join(cc_emails)
                
            # Add text and HTML parts
            msg.attach(MIMEText(body_text, 'plain'))
            if body_html:
                msg.attach(MIMEText(body_html, 'html'))
                
            # TODO: Handle attachments
            
            # Send email
            with smtplib.SMTP(self.smtp_host, self.smtp_port) as server:
                server.starttls()
                server.login(self.smtp_user, self.smtp_password)
                
                recipients = to_emails + (cc_emails or []) + (bcc_emails or [])
                server.send_message(msg, to_addrs=recipients)
                
            return {
                "status": "success",
                "provider": "smtp"
            }
            
        except Exception as e:
            raise Exception(f"SMTP error: {e}")
            
    def _send_ses(
        self,
        to_emails: List[str],
        subject: str,
        body_text: str,
        body_html: Optional[str],
        cc_emails: Optional[List[str]],
        bcc_emails: Optional[List[str]]
    ) -> Dict:
        """Send email via AWS SES"""
        try:
            destination = {'ToAddresses': to_emails}
            if cc_emails:
                destination['CcAddresses'] = cc_emails
            if bcc_emails:
                destination['BccAddresses'] = bcc_emails
                
            message = {
                'Subject': {'Data': subject},
                'Body': {'Text': {'Data': body_text}}
            }
            
            if body_html:
                message['Body']['Html'] = {'Data': body_html}
                
            response = self.ses_client.send_email(
                Source=f"{self.from_name} <{self.from_email}>",
                Destination=destination,
                Message=message
            )
            
            return {
                "status": "success",
                "message_id": response['MessageId'],
                "provider": "ses"
            }
            
        except Exception as e:
            raise Exception(f"SES error: {e}")