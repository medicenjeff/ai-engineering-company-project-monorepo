import json
import logging
import os
import smtplib
import ssl
from email.message import EmailMessage
from html import escape
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit
from urllib.request import Request, urlopen


logger = logging.getLogger(__name__)


def _email_failure() -> bool:
    logger.error("Password reset email could not be sent; check email service and reset URL configuration")
    return False


def send_password_reset_email(email: str, token: str) -> bool:
    try:
        reset_url = urlsplit(os.environ["PASSWORD_RESET_URL"])
        if not reset_url.hostname or (
            reset_url.scheme != "https"
            and not (reset_url.scheme == "http" and reset_url.hostname in {"localhost", "127.0.0.1"})
        ):
            raise ValueError("PASSWORD_RESET_URL must use HTTPS (HTTP allowed on localhost)")
        query = [(key, value) for key, value in parse_qsl(reset_url.query) if key != "token"]
        query.append(("token", token))
        link = urlunsplit(reset_url._replace(query=urlencode(query)))
    except (KeyError, TypeError, ValueError):
        return _email_failure()

    subject = "Restablece tu contrasena"
    text = (
        "Recibimos una solicitud para restablecer tu contrasena.\n\n"
        f"Abre este enlace para elegir una nueva contrasena:\n\n{link}\n\n"
        "El enlace tiene una vigencia limitada y solo puede utilizarse una vez.\n"
        "Si no solicitaste este cambio, puedes ignorar este correo.\n"
    )
    safe_link = escape(link, quote=True)
    html = f"""<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{subject}</title>
</head>
<body style="margin:0;padding:0;background:#f3f4f6;color:#202124;font-family:Helvetica,Arial,sans-serif;">
<table role="presentation" style="width:100%;border-collapse:collapse;"><tr><td style="padding:24px 12px;">
<table role="presentation" align="center" style="width:100%;max-width:560px;border-collapse:collapse;background:#ffffff;">
<tr><td style="padding:24px;font-size:16px;line-height:1.6;">
<h1 style="margin:0 0 16px;font-size:24px;line-height:1.3;">Restablece tu contrase&ntilde;a</h1>
<p>Recibimos una solicitud para restablecer tu contrase&ntilde;a.</p>
<p>Selecciona el bot&oacute;n para elegir una nueva contrase&ntilde;a.</p>
<p style="margin:24px 0;">
<a href="{safe_link}" style="display:block;padding:16px 12px;background:#146c43;color:#ffffff;text-align:center;text-decoration:none;font-weight:bold;border-radius:4px;">Restablecer contrase&ntilde;a</a>
</p>
<p>El enlace tiene una vigencia limitada y solo puede utilizarse una vez.</p>
<p>Si el bot&oacute;n no funciona, abre este enlace:</p>
<p style="word-break:break-all;overflow-wrap:anywhere;"><a href="{safe_link}" style="color:#146c43;word-break:break-all;">{safe_link}</a></p>
<p>Si no solicitaste este cambio, puedes ignorar este correo.</p>
</td></tr></table>
</td></tr></table>
</body></html>"""
    api_key = os.getenv("RESEND_API_KEY", "").strip()
    if api_key:
        try:
            payload = {
                "from": os.environ["EMAIL_FROM"],
                "to": [email],
                "subject": subject,
                "text": text,
                "html": html,
            }
            request = Request(
                "https://api.resend.com/emails",
                data=json.dumps(payload).encode("utf-8"),
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json",
                    "User-Agent": "AuthAPI/0.1",
                },
                method="POST",
            )
        except (KeyError, TypeError, ValueError):
            return _email_failure()
        try:
            with urlopen(request, timeout=10) as response:
                accepted = 200 <= response.status < 300
        except (OSError, smtplib.SMTPException):
            return _email_failure()
        if not accepted:
            return _email_failure()
        return True

    try:
        sender = os.environ["SMTP_FROM"]
        host = os.environ["SMTP_HOST"]
        port = int(os.getenv("SMTP_PORT", "587"))
        username = os.getenv("SMTP_USERNAME")
        password = os.environ["SMTP_PASSWORD"] if username else None
    except (KeyError, TypeError, ValueError):
        return _email_failure()

    try:
        message = EmailMessage()
        message["From"] = sender
        message["To"] = email
        message["Subject"] = subject
        message.set_content(text)
        message.add_alternative(html, subtype="html")
    except (TypeError, ValueError):
        return _email_failure()

    try:
        with smtplib.SMTP(host, port, timeout=10) as smtp:
            smtp.starttls(context=ssl.create_default_context())
            if username:
                smtp.login(username, password)
            smtp.send_message(message)
    except (OSError, smtplib.SMTPException):
        return _email_failure()
    return True